//! SQLite store for the reading assistant: book text chunks, highlights and
//! past Q&A exchanges, each with an embedding. Vectors are compared with
//! sqlite-vec's `vec_distance_cosine` over the rows of a single book, which is
//! a few thousand rows at most, so a full scan is fast and the embedding
//! dimension does not have to be fixed in the schema.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Once;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: i32 = 1;

static REGISTER_VEC: Once = Once::new();

/// Makes sqlite-vec available to every connection opened afterwards.
fn register_sqlite_vec() {
    REGISTER_VEC.call_once(|| unsafe {
        #[allow(clippy::missing_transmute_annotations)]
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

pub fn vector_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInput {
    pub text: String,
    pub cfi: String,
}

#[derive(Debug, Clone)]
pub struct ChunkHit {
    pub section: i64,
    pub href: String,
    pub chapter: String,
    pub cfi: String,
    pub text: String,
    pub distance: f64,
}

#[derive(Debug, Clone)]
pub struct HighlightRow {
    pub annotation_id: String,
    pub text: String,
    pub note: String,
    pub cfi: String,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct HighlightHit {
    pub text: String,
    pub note: String,
    pub cfi: String,
    pub distance: f64,
}

/// Where a cited piece of context lives in the book.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// Label the model cites, e.g. "#1" or "H2".
    pub label: String,
    /// "passage" | "highlight"
    pub kind: String,
    pub cfi: String,
    pub excerpt: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exchange {
    pub id: String,
    pub session_id: String,
    pub question: String,
    pub answer: String,
    pub sources: Vec<Source>,
    pub created_at: String,
}

pub struct NewExchange<'a> {
    pub exchange: &'a Exchange,
    pub book_id: &'a str,
    pub model: &'a str,
    pub embedding: &'a [f32],
}

pub struct AssistantDb {
    conn: Connection,
}

impl AssistantDb {
    pub fn open(path: &Path) -> Result<Self, String> {
        register_sqlite_vec();
        let conn = Connection::open(path).map_err(|e| format!("assistant db: {e}"))?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Self, String> {
        register_sqlite_vec();
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::init(conn)
    }

    fn init(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS chunks (
               id INTEGER PRIMARY KEY,
               book_id TEXT NOT NULL,
               model TEXT NOT NULL,
               section INTEGER NOT NULL,
               seq INTEGER NOT NULL,
               href TEXT NOT NULL,
               chapter TEXT NOT NULL,
               cfi TEXT NOT NULL,
               text TEXT NOT NULL,
               embedding BLOB NOT NULL
             );
             CREATE INDEX IF NOT EXISTS chunks_book ON chunks(book_id, model, section);
             CREATE TABLE IF NOT EXISTS indexed_sections (
               book_id TEXT NOT NULL,
               model TEXT NOT NULL,
               section INTEGER NOT NULL,
               PRIMARY KEY (book_id, model, section)
             );
             CREATE TABLE IF NOT EXISTS highlights (
               book_id TEXT NOT NULL,
               annotation_id TEXT NOT NULL,
               model TEXT NOT NULL,
               text TEXT NOT NULL,
               note TEXT NOT NULL,
               cfi TEXT NOT NULL,
               embedding BLOB NOT NULL,
               PRIMARY KEY (book_id, annotation_id)
             );
             CREATE TABLE IF NOT EXISTS exchanges (
               id TEXT PRIMARY KEY,
               book_id TEXT NOT NULL,
               session_id TEXT NOT NULL,
               question TEXT NOT NULL,
               answer TEXT NOT NULL,
               sources TEXT NOT NULL,
               created_at TEXT NOT NULL,
               model TEXT NOT NULL,
               embedding BLOB NOT NULL
             );
             CREATE INDEX IF NOT EXISTS exchanges_book ON exchanges(book_id, created_at);",
        )
        .map_err(|e| format!("assistant db schema: {e}"))?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }

    // ---- book chunks -------------------------------------------------------

    pub fn indexed_sections(&self, book_id: &str, model: &str) -> Result<Vec<i64>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT section FROM indexed_sections WHERE book_id = ?1 AND model = ?2 ORDER BY section")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![book_id, model], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }

    /// Replaces the chunks of one spine section and marks it as indexed.
    pub fn store_section(
        &mut self,
        book_id: &str,
        model: &str,
        section: i64,
        href: &str,
        chapter: &str,
        chunks: &[(ChunkInput, Vec<f32>)],
    ) -> Result<(), String> {
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM chunks WHERE book_id = ?1 AND model = ?2 AND section = ?3",
            params![book_id, model, section],
        )
        .map_err(|e| e.to_string())?;
        {
            let mut insert = tx
                .prepare(
                    "INSERT INTO chunks (book_id, model, section, seq, href, chapter, cfi, text, embedding)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                )
                .map_err(|e| e.to_string())?;
            for (seq, (chunk, embedding)) in chunks.iter().enumerate() {
                insert
                    .execute(params![
                        book_id,
                        model,
                        section,
                        seq as i64,
                        href,
                        chapter,
                        chunk.cfi,
                        chunk.text,
                        vector_blob(embedding)
                    ])
                    .map_err(|e| e.to_string())?;
            }
        }
        tx.execute(
            "INSERT OR IGNORE INTO indexed_sections (book_id, model, section) VALUES (?1, ?2, ?3)",
            params![book_id, model, section],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn search_chunks(
        &self,
        book_id: &str,
        model: &str,
        query: &[f32],
        limit: usize,
        exclude_section: Option<i64>,
    ) -> Result<Vec<ChunkHit>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT section, href, chapter, cfi, text, vec_distance_cosine(embedding, ?3) AS d
                 FROM chunks
                 WHERE book_id = ?1 AND model = ?2 AND (?4 IS NULL OR section <> ?4)
                 ORDER BY d LIMIT ?5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![book_id, model, vector_blob(query), exclude_section, limit as i64],
                |r| {
                    Ok(ChunkHit {
                        section: r.get(0)?,
                        href: r.get(1)?,
                        chapter: r.get(2)?,
                        cfi: r.get(3)?,
                        text: r.get(4)?,
                        distance: r.get(5)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }

    // ---- highlights --------------------------------------------------------

    pub fn highlights(&self, book_id: &str) -> Result<HashMap<String, HighlightRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT annotation_id, text, note, cfi, model FROM highlights WHERE book_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![book_id], |r| {
                Ok(HighlightRow {
                    annotation_id: r.get(0)?,
                    text: r.get(1)?,
                    note: r.get(2)?,
                    cfi: r.get(3)?,
                    model: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = HashMap::new();
        for row in rows {
            let row = row.map_err(|e| e.to_string())?;
            out.insert(row.annotation_id.clone(), row);
        }
        Ok(out)
    }

    pub fn upsert_highlight(&self, book_id: &str, row: &HighlightRow, embedding: &[f32]) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO highlights (book_id, annotation_id, model, text, note, cfi, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT (book_id, annotation_id) DO UPDATE SET
                   model = excluded.model, text = excluded.text, note = excluded.note,
                   cfi = excluded.cfi, embedding = excluded.embedding",
                params![
                    book_id,
                    row.annotation_id,
                    row.model,
                    row.text,
                    row.note,
                    row.cfi,
                    vector_blob(embedding)
                ],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn delete_highlight(&self, book_id: &str, annotation_id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM highlights WHERE book_id = ?1 AND annotation_id = ?2",
                params![book_id, annotation_id],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn search_highlights(
        &self,
        book_id: &str,
        model: &str,
        query: &[f32],
        limit: usize,
        max_distance: f64,
    ) -> Result<Vec<HighlightHit>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT text, note, cfi, vec_distance_cosine(embedding, ?3) AS d
                 FROM highlights WHERE book_id = ?1 AND model = ?2 AND d <= ?4
                 ORDER BY d LIMIT ?5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![book_id, model, vector_blob(query), max_distance, limit as i64],
                |r| {
                    Ok(HighlightHit {
                        text: r.get(0)?,
                        note: r.get(1)?,
                        cfi: r.get(2)?,
                        distance: r.get(3)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }

    // ---- exchanges ---------------------------------------------------------

    pub fn insert_exchange(&self, new: NewExchange<'_>) -> Result<(), String> {
        let e = new.exchange;
        let sources = serde_json::to_string(&e.sources).map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "INSERT INTO exchanges (id, book_id, session_id, question, answer, sources, created_at, model, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    e.id,
                    new.book_id,
                    e.session_id,
                    e.question,
                    e.answer,
                    sources,
                    e.created_at,
                    new.model,
                    vector_blob(new.embedding)
                ],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    fn exchange_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Exchange> {
        let sources: String = r.get(4)?;
        Ok(Exchange {
            id: r.get(0)?,
            session_id: r.get(1)?,
            question: r.get(2)?,
            answer: r.get(3)?,
            sources: serde_json::from_str(&sources).unwrap_or_default(),
            created_at: r.get(5)?,
        })
    }

    /// The last `limit` exchanges of a session, oldest first.
    pub fn recent_exchanges(&self, book_id: &str, session_id: &str, limit: usize) -> Result<Vec<Exchange>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, session_id, question, answer, sources, created_at FROM exchanges
                 WHERE book_id = ?1 AND session_id = ?2
                 ORDER BY created_at DESC, rowid DESC LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![book_id, session_id, limit as i64], Self::exchange_from_row)
            .map_err(|e| e.to_string())?;
        let mut out: Vec<Exchange> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
        out.reverse();
        Ok(out)
    }

    /// Past exchanges of the book similar to the query, skipping `exclude`
    /// (the ones already in the conversation window).
    pub fn search_exchanges(
        &self,
        book_id: &str,
        model: &str,
        query: &[f32],
        limit: usize,
        max_distance: f64,
        exclude: &[String],
    ) -> Result<Vec<Exchange>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, session_id, question, answer, sources, created_at,
                        vec_distance_cosine(embedding, ?3) AS d
                 FROM exchanges WHERE book_id = ?1 AND model = ?2 AND d <= ?4
                 ORDER BY d LIMIT ?5",
            )
            .map_err(|e| e.to_string())?;
        // Over-fetch so excluded rows don't starve the result.
        let fetch = (limit + exclude.len()) as i64;
        let rows = stmt
            .query_map(
                params![book_id, model, vector_blob(query), max_distance, fetch],
                Self::exchange_from_row,
            )
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            let ex = row.map_err(|e| e.to_string())?;
            if !exclude.contains(&ex.id) {
                out.push(ex);
            }
            if out.len() == limit {
                break;
            }
        }
        Ok(out)
    }

    pub fn latest_session(&self, book_id: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT session_id FROM exchanges WHERE book_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1",
                params![book_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn session_exchanges(&self, book_id: &str, session_id: &str) -> Result<Vec<Exchange>, String> {
        self.recent_exchanges(book_id, session_id, usize::MAX >> 1)
    }

    pub fn clear_history(&self, book_id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM exchanges WHERE book_id = ?1", params![book_id])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// Drops everything stored for a book (used when the book is deleted).
    pub fn delete_book(&mut self, book_id: &str) -> Result<(), String> {
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        for table in ["chunks", "indexed_sections", "highlights", "exchanges"] {
            tx.execute(&format!("DELETE FROM {table} WHERE book_id = ?1"), params![book_id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(text: &str) -> ChunkInput {
        ChunkInput { text: text.into(), cfi: format!("epubcfi(/6/2!/4/{})", text.len()) }
    }

    fn exchange(id: &str, session: &str, at: &str) -> Exchange {
        Exchange {
            id: id.into(),
            session_id: session.into(),
            question: format!("q {id}"),
            answer: format!("a {id}"),
            sources: vec![],
            created_at: at.into(),
        }
    }

    #[test]
    fn chunk_search_orders_by_cosine_distance_and_excludes_section() {
        let mut db = AssistantDb::open_in_memory().unwrap();
        db.store_section("b", "m", 0, "a.xhtml", "One", &[(chunk("east"), vec![1.0, 0.0]), (chunk("north"), vec![0.0, 1.0])])
            .unwrap();
        db.store_section("b", "m", 1, "b.xhtml", "Two", &[(chunk("north-east"), vec![0.7, 0.7])]).unwrap();
        db.store_section("other", "m", 0, "a.xhtml", "One", &[(chunk("east too"), vec![1.0, 0.0])]).unwrap();

        let hits = db.search_chunks("b", "m", &[1.0, 0.1], 10, None).unwrap();
        let texts: Vec<_> = hits.iter().map(|h| h.text.as_str()).collect();
        assert_eq!(texts, ["east", "north-east", "north"]);

        let hits = db.search_chunks("b", "m", &[1.0, 0.1], 10, Some(0)).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].href, "b.xhtml");

        // Other models are invisible.
        assert!(db.search_chunks("b", "other-model", &[1.0, 0.0], 10, None).unwrap().is_empty());
        assert_eq!(db.indexed_sections("b", "m").unwrap(), vec![0, 1]);
    }

    #[test]
    fn storing_a_section_again_replaces_its_chunks() {
        let mut db = AssistantDb::open_in_memory().unwrap();
        db.store_section("b", "m", 0, "a", "", &[(chunk("old"), vec![1.0, 0.0])]).unwrap();
        db.store_section("b", "m", 0, "a", "", &[(chunk("new"), vec![1.0, 0.0])]).unwrap();
        let hits = db.search_chunks("b", "m", &[1.0, 0.0], 10, None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].text, "new");
    }

    #[test]
    fn highlight_search_respects_distance_threshold() {
        let db = AssistantDb::open_in_memory().unwrap();
        let row = |id: &str| HighlightRow {
            annotation_id: id.into(),
            text: format!("text {id}"),
            note: String::new(),
            cfi: String::new(),
            model: "m".into(),
        };
        db.upsert_highlight("b", &row("near"), &[1.0, 0.0]).unwrap();
        db.upsert_highlight("b", &row("far"), &[0.0, 1.0]).unwrap();
        let hits = db.search_highlights("b", "m", &[1.0, 0.0], 5, 0.2).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].text, "text near");

        db.delete_highlight("b", "near").unwrap();
        assert_eq!(db.highlights("b").unwrap().len(), 1);
    }

    #[test]
    fn window_returns_latest_exchanges_of_the_session_oldest_first() {
        let db = AssistantDb::open_in_memory().unwrap();
        for (i, at) in ["2026-01-01T00:00:01Z", "2026-01-01T00:00:02Z", "2026-01-01T00:00:03Z"].iter().enumerate() {
            let ex = exchange(&format!("e{i}"), "s1", at);
            db.insert_exchange(NewExchange { exchange: &ex, book_id: "b", model: "m", embedding: &[1.0, 0.0] })
                .unwrap();
        }
        let other = exchange("x", "s0", "2026-01-01T00:00:04Z");
        db.insert_exchange(NewExchange { exchange: &other, book_id: "b", model: "m", embedding: &[1.0, 0.0] })
            .unwrap();

        let window = db.recent_exchanges("b", "s1", 2).unwrap();
        let ids: Vec<_> = window.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["e1", "e2"]);
        assert_eq!(db.latest_session("b").unwrap().as_deref(), Some("s0"));

        let similar = db
            .search_exchanges("b", "m", &[1.0, 0.0], 2, 0.5, &["e1".to_string(), "e2".to_string()])
            .unwrap();
        let ids: Vec<_> = similar.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids.len(), 2);
        assert!(!ids.contains(&"e1") && !ids.contains(&"e2"));
    }

    #[test]
    fn delete_book_removes_every_row() {
        let mut db = AssistantDb::open_in_memory().unwrap();
        db.store_section("b", "m", 0, "a", "", &[(chunk("x"), vec![1.0])]).unwrap();
        let ex = exchange("e", "s", "2026-01-01T00:00:00Z");
        db.insert_exchange(NewExchange { exchange: &ex, book_id: "b", model: "m", embedding: &[1.0] }).unwrap();
        db.delete_book("b").unwrap();
        assert!(db.indexed_sections("b", "m").unwrap().is_empty());
        assert!(db.latest_session("b").unwrap().is_none());
    }
}
