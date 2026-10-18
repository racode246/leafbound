//! Reading assistant: ask an LLM about the open book. Retrieval runs locally
//! (multilingual-e5 embeddings + SQLite/sqlite-vec); only the assembled
//! prompt goes to the chat provider the user configured.

pub mod db;
pub mod embed;
pub mod llm;
pub mod prompt;
pub mod search;
pub mod secrets;

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

use crate::AppState;
use db::{AssistantDb, ChunkInput, Exchange, HighlightRow, NewExchange};
use embed::{Embedder, MODEL_ID};
use llm::{ChatError, ChatRequest, Provider, Role};

/// Conversation window: the last N question/answer pairs go to the model verbatim.
const WINDOW_EXCHANGES: usize = 5;
const PASSAGE_HITS: usize = 8;
/// Book chunks kept from one spine section, so one long chapter cannot crowd out the rest.
const PASSAGES_PER_SECTION: usize = 2;
/// Nearest chunks considered before capping per section.
const CANDIDATES: usize = 40;

/// Identifies how book chunks were made: the embedding model plus the chunker
/// in src/lib/bookText.ts. Bump the suffix when chunking changes so books are
/// indexed again; rows under an older key are dropped as sections are re-indexed.
pub const CHUNK_INDEX: &str = "multilingual-e5-small-int8@761b726d/chunks-2";
const HIGHLIGHT_HITS: usize = 5;
const RELATED_HITS: usize = 3;
/// Cosine distance cut-offs for optional context. With e5 a matching
/// query/passage pair measured about 0.14-0.17 and unrelated Japanese text
/// 0.23-0.27 (tests/embedding_model.rs).
const HIGHLIGHT_MAX_DISTANCE: f64 = 0.2;
const RELATED_MAX_DISTANCE: f64 = 0.19;

/// Error codes the frontend translates.
pub const ERR_NO_API_KEY: &str = "NO_API_KEY";
pub const ERR_MODEL_NOT_READY: &str = "MODEL_NOT_READY";
pub const ERR_REFUSED: &str = "REFUSED";
pub const ERR_CANCELLED: &str = "CANCELLED";

pub struct AssistantState {
    db: Mutex<AssistantDb>,
    embedder: Arc<Embedder>,
    http: reqwest::Client,
    /// Serialises model download / load so concurrent callers share one run.
    prepare: tauri::async_runtime::Mutex<()>,
    asks: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Credential store service name: the app identifier (see `secrets`).
    key_service: String,
}

impl AssistantState {
    pub fn new(data_dir: &Path, identifier: &str) -> Result<Self, String> {
        // A broken database must not keep the reader from starting: fall back to
        // a throwaway in-memory store and say why.
        let db = AssistantDb::open(&data_dir.join("assistant.sqlite")).or_else(|err| {
            eprintln!("assistant: {err}; using an in-memory store for this session");
            AssistantDb::open_in_memory()
        })?;
        let http = reqwest::Client::builder()
            .user_agent(concat!("Leafbound/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            db: Mutex::new(db),
            embedder: Arc::new(Embedder::new(
                data_dir.join("models").join("multilingual-e5-small"),
            )),
            http,
            prepare: tauri::async_runtime::Mutex::new(()),
            asks: Mutex::new(HashMap::new()),
            key_service: identifier.to_string(),
        })
    }

    fn db(&self) -> MutexGuard<'_, AssistantDb> {
        self.db.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Removes everything stored for a deleted book.
    pub fn forget_book(&self, book_id: &str) {
        if let Err(err) = self.db().delete_book(book_id) {
            eprintln!("assistant: could not forget {book_id}: {err}");
        }
    }

    async fn blocking<T: Send + 'static>(
        &self,
        f: impl FnOnce(&Embedder) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let embedder = Arc::clone(&self.embedder);
        tauri::async_runtime::spawn_blocking(move || f(&embedder))
            .await
            .map_err(|e| format!("background task failed: {e}"))?
    }
}

type Assistant<'a> = State<'a, AssistantState>;

fn library<'a>(state: &'a State<'a, AppState>) -> MutexGuard<'a, crate::library::LibraryStore> {
    state.0.lock().unwrap_or_else(|p| p.into_inner())
}

// ---- status / setup ---------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    model_downloaded: bool,
    model_loaded: bool,
    download_size: u64,
    indexed_sections: Vec<i64>,
    keys: secrets::KeyStatus,
}

#[tauri::command]
pub fn assistant_status(state: Assistant<'_>, book_id: String) -> Result<AssistantStatus, String> {
    Ok(AssistantStatus {
        model_downloaded: state.embedder.is_downloaded(),
        model_loaded: state.embedder.is_loaded(),
        download_size: embed::total_download_size(),
        indexed_sections: state.db().indexed_sections(&book_id, CHUNK_INDEX)?,
        keys: secrets::status(&state.key_service),
    })
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PrepareEvent {
    Download { done: u64, total: u64 },
    Loading,
}

/// Downloads (first run) and loads the embedding model.
#[tauri::command]
pub async fn assistant_prepare(
    state: Assistant<'_>,
    on_event: Channel<PrepareEvent>,
) -> Result<(), String> {
    let _guard = state.prepare.lock().await;
    if !state.embedder.is_downloaded() {
        let mut last = 0u64;
        state
            .embedder
            .download(&state.http, |done, total| {
                // ~1 MB steps keep the IPC channel quiet.
                if done == total || done < last || done - last >= 1 << 20 {
                    last = done;
                    let _ = on_event.send(PrepareEvent::Download { done, total });
                }
            })
            .await?;
    }
    if !state.embedder.is_loaded() {
        let _ = on_event.send(PrepareEvent::Loading);
        state.blocking(|e| e.load()).await?;
    }
    Ok(())
}

/// Embeds and stores one spine section's chunks (sent by the frontend, which
/// extracts text and CFIs with epub.js).
#[tauri::command]
pub async fn assistant_index_section(
    state: Assistant<'_>,
    book_id: String,
    section: i64,
    href: String,
    chapter: String,
    chunks: Vec<ChunkInput>,
) -> Result<(), String> {
    if !state.embedder.is_loaded() {
        return Err(ERR_MODEL_NOT_READY.into());
    }
    let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
    let vectors = state.blocking(move |e| e.embed_passages(&texts)).await?;
    let rows: Vec<(ChunkInput, Vec<f32>)> = chunks.into_iter().zip(vectors).collect();
    state
        .db()
        .store_section(&book_id, CHUNK_INDEX, section, &href, &chapter, &rows)
}

// ---- API keys -----------------------------------------------------------------

#[tauri::command]
pub fn assistant_set_api_key(
    state: Assistant<'_>,
    provider: Provider,
    key: String,
) -> Result<secrets::KeyStatus, String> {
    secrets::set(&state.key_service, provider, &key)?;
    Ok(secrets::status(&state.key_service))
}

#[tauri::command]
pub fn assistant_delete_api_key(
    state: Assistant<'_>,
    provider: Provider,
) -> Result<secrets::KeyStatus, String> {
    secrets::delete(&state.key_service, provider)?;
    Ok(secrets::status(&state.key_service))
}

// ---- history ------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    session_id: Option<String>,
    exchanges: Vec<Exchange>,
}

/// The most recent conversation about the book.
#[tauri::command]
pub fn assistant_history(state: Assistant<'_>, book_id: String) -> Result<History, String> {
    let db = state.db();
    let session_id = db.latest_session(&book_id)?;
    let exchanges = match &session_id {
        Some(s) => db.session_exchanges(&book_id, s)?,
        None => Vec::new(),
    };
    Ok(History {
        session_id,
        exchanges,
    })
}

#[tauri::command]
pub fn assistant_clear_history(state: Assistant<'_>, book_id: String) -> Result<(), String> {
    state.db().clear_history(&book_id)
}

// ---- asking -------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    request_id: String,
    book_id: String,
    session_id: String,
    question: String,
    chapter_title: Option<String>,
    /// Text around the reading position in the current chapter.
    chapter_text: String,
    /// Spine index of the current chapter, when `chapter_text` covers all of it
    /// (its chunks are then left out of retrieval as duplicates).
    covered_section: Option<i64>,
    percent: f64,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AskEvent {
    /// "highlights" | "searching" | "generating"
    Stage {
        stage: &'static str,
    },
    Sources {
        sources: Vec<db::Source>,
    },
    Delta {
        text: String,
    },
}

#[tauri::command]
pub fn assistant_cancel(state: Assistant<'_>, request_id: String) {
    if let Some(flag) = state
        .asks
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(&request_id)
    {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn assistant_ask(
    state: Assistant<'_>,
    library_state: State<'_, AppState>,
    request: AskRequest,
    on_event: Channel<AskEvent>,
) -> Result<Exchange, String> {
    let question = request.question.trim().to_string();
    if question.is_empty() {
        return Err("empty question".into());
    }
    if !state.embedder.is_loaded() {
        return Err(ERR_MODEL_NOT_READY.into());
    }

    let (settings, title, author, annotations) = {
        let lib = library(&library_state);
        let book = lib
            .book(&request.book_id)
            .ok_or_else(|| format!("unknown book: {}", request.book_id))?;
        (
            lib.settings().assistant.clone(),
            book.title.clone(),
            book.author.clone(),
            lib.load_annotations(&request.book_id)?,
        )
    };
    let provider = settings.provider;
    let api_key = secrets::get(&state.key_service, provider)?;
    if provider == Provider::Anthropic && api_key.is_none() {
        return Err(ERR_NO_API_KEY.into());
    }
    if settings.model.trim().is_empty() {
        return Err("model is not set".into());
    }

    let _ = on_event.send(AskEvent::Stage {
        stage: "highlights",
    });
    sync_highlights(&state, &request.book_id, &annotations).await?;

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .asks
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(request.request_id.clone(), Arc::clone(&cancel));
    let _cancel_guard = CancelGuard {
        state: &state,
        id: request.request_id.clone(),
    };
    let model = settings.model.trim().to_string();

    let _ = on_event.send(AskEvent::Stage { stage: "searching" });
    let window =
        state
            .db()
            .recent_exchanges(&request.book_id, &request.session_id, WINDOW_EXCHANGES)?;
    let search = prompt::search_text(&question, window.last());

    // HyDE: ask the model for the passage it expects would answer the question and
    // search with that. The small embedding model matches a question poorly against
    // narrative text; tests/retrieval_eval.rs measured 9/16 -> 14-15/16 on a novel.
    let hyde = ChatRequest {
        provider,
        base_url: settings.base_url.clone(),
        model: model.clone(),
        api_key: api_key.clone(),
        system: prompt::hypothetical_passage(&title, &author, &request.chapter_text),
        messages: vec![(Role::User, search.clone())],
    };
    let hypothetical = match llm::stream_chat(&state.http, &hyde, &cancel, |_| {}).await {
        Ok(text) if !text.trim().is_empty() => Some(text),
        Ok(_) => None,
        Err(ChatError::Cancelled) => return Err(ERR_CANCELLED.into()),
        Err(err) => {
            eprintln!("assistant: search passage failed, searching with the question: {err:?}");
            None
        }
    };
    let search_for_embedding = search.clone();
    let query = state
        .blocking(move |e| e.embed_query(&search_for_embedding))
        .await?;
    let passage_query = match hypothetical {
        Some(text) => state
            .blocking(move |e| e.embed_passages(&[text]))
            .await?
            .remove(0),
        None => query.clone(),
    };
    let window_ids: Vec<String> = window.iter().map(|e| e.id.clone()).collect();
    let (passages, highlights, related) = {
        let db = state.db();
        (
            find_passages(
                &db,
                &request.book_id,
                &passage_query,
                request.covered_section,
            )?,
            db.search_highlights(
                &request.book_id,
                MODEL_ID,
                &query,
                HIGHLIGHT_HITS,
                HIGHLIGHT_MAX_DISTANCE,
            )?,
            db.search_exchanges(
                &request.book_id,
                MODEL_ID,
                &query,
                RELATED_HITS,
                RELATED_MAX_DISTANCE,
                &window_ids,
            )?,
        )
    };

    let built = prompt::build(&prompt::PromptInput {
        title: &title,
        author: &author,
        percent: request.percent,
        chapter_title: request.chapter_title.as_deref(),
        chapter_text: &request.chapter_text,
        passages: &passages,
        highlights: &highlights,
        related: &related,
        window: &window,
        question: &question,
    });
    let _ = on_event.send(AskEvent::Sources {
        sources: built.sources.clone(),
    });
    let _ = on_event.send(AskEvent::Stage {
        stage: "generating",
    });

    let chat = ChatRequest {
        provider,
        base_url: settings.base_url.clone(),
        model,
        api_key,
        system: built.system,
        messages: built.messages,
    };
    let result = llm::stream_chat(&state.http, &chat, &cancel, |text| {
        let _ = on_event.send(AskEvent::Delta {
            text: text.to_string(),
        });
    })
    .await;

    let answer = match result {
        Ok(answer) if !answer.trim().is_empty() => answer,
        Ok(_) => return Err("the model returned an empty answer".into()),
        Err(ChatError::Cancelled) => return Err(ERR_CANCELLED.into()),
        Err(ChatError::Refused) => return Err(ERR_REFUSED.into()),
        Err(ChatError::Failed(msg)) => return Err(msg),
    };

    let exchange = Exchange {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        question: question.clone(),
        answer: answer.clone(),
        sources: built.sources,
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    };
    let text = prompt::exchange_text(&question, &answer);
    let vector = state.blocking(move |e| e.embed_passages(&[text])).await?;
    state.db().insert_exchange(NewExchange {
        exchange: &exchange,
        book_id: &request.book_id,
        model: MODEL_ID,
        embedding: &vector[0],
    })?;
    Ok(exchange)
}

/// Book passages for a search vector: the nearest chunks, at most
/// `PASSAGES_PER_SECTION` from one chapter. `exclude_section` is a chapter
/// already sent in full.
pub fn find_passages(
    db: &AssistantDb,
    book_id: &str,
    query: &[f32],
    exclude_section: Option<i64>,
) -> Result<Vec<db::ChunkHit>, String> {
    let ranked = db.search_chunks(book_id, CHUNK_INDEX, query, CANDIDATES, exclude_section)?;
    let ids: Vec<i64> = ranked.iter().map(|c| c.id).collect();
    let section_of: HashMap<i64, i64> = ranked.iter().map(|c| (c.id, c.section)).collect();
    let picked = search::spread(&ids, &section_of, PASSAGE_HITS, PASSAGES_PER_SECTION);
    let mut by_id: HashMap<i64, db::ChunkHit> = ranked.into_iter().map(|c| (c.id, c)).collect();
    Ok(picked
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}

/// Removes a request's cancel flag however `assistant_ask` returns.
struct CancelGuard<'a> {
    state: &'a AssistantState,
    id: String,
}

impl Drop for CancelGuard<'_> {
    fn drop(&mut self) {
        self.state
            .asks
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&self.id);
    }
}

/// Brings the highlight vectors in line with the book's annotations: new or
/// edited ones are embedded, deleted ones removed.
async fn sync_highlights(
    state: &AssistantState,
    book_id: &str,
    annotations: &[crate::library::Annotation],
) -> Result<(), String> {
    let stored = state.db().highlights(book_id)?;
    let mut changed: Vec<HighlightRow> = Vec::new();
    for a in annotations {
        let current = stored.get(&a.id);
        let fresh = current.is_some_and(|row| {
            row.model == MODEL_ID
                && row.text == a.text
                && row.note == a.note
                && row.cfi == a.cfi_range
        });
        if !fresh {
            changed.push(HighlightRow {
                annotation_id: a.id.clone(),
                text: a.text.clone(),
                note: a.note.clone(),
                cfi: a.cfi_range.clone(),
                model: MODEL_ID.to_string(),
            });
        }
    }
    for id in stored.keys() {
        if !annotations.iter().any(|a| &a.id == id) {
            state.db().delete_highlight(book_id, id)?;
        }
    }
    if changed.is_empty() {
        return Ok(());
    }
    let texts: Vec<String> = changed
        .iter()
        .map(|h| {
            if h.note.trim().is_empty() {
                h.text.clone()
            } else {
                format!("{}\n{}", h.text, h.note)
            }
        })
        .collect();
    let vectors = state.blocking(move |e| e.embed_passages(&texts)).await?;
    let db = state.db();
    for (row, vector) in changed.iter().zip(vectors) {
        db.upsert_highlight(book_id, row, &vector)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_index_names_the_embedding_model() {
        assert!(CHUNK_INDEX.starts_with(MODEL_ID));
    }

    #[test]
    fn passages_are_spread_over_sections() {
        let mut db = AssistantDb::open_in_memory().unwrap();
        let input = |t: &str| ChunkInput {
            text: t.into(),
            cfi: String::new(),
        };
        let near: Vec<(ChunkInput, Vec<f32>)> = (0..5)
            .map(|i| (input(&format!("near {i}")), vec![1.0, 0.01 * i as f32]))
            .collect();
        db.store_section("b", CHUNK_INDEX, 0, "a", "", &near)
            .unwrap();
        db.store_section(
            "b",
            CHUNK_INDEX,
            1,
            "b",
            "",
            &[(input("far"), vec![0.0, 1.0])],
        )
        .unwrap();
        let hits = find_passages(&db, "b", &[1.0, 0.0], None).unwrap();
        // Five near chunks in one section, but only PASSAGES_PER_SECTION of them are kept.
        assert_eq!(
            hits.iter().filter(|h| h.section == 0).count(),
            PASSAGES_PER_SECTION
        );
        assert!(hits.iter().any(|h| h.text == "far"));
        // A chapter that is already in the prompt is left out.
        assert!(find_passages(&db, "b", &[1.0, 0.0], Some(0))
            .unwrap()
            .iter()
            .all(|h| h.section != 0));
    }
}
