//! Retrieval quality check on a real novel: does the chapter that answers a
//! question make it into the passages sent to the LLM?
//!
//! Compares the original search (6 nearest chunks to the question) with the
//! app's `find_passages` searched by the question alone and by the HyDE passage
//! the LLM writes first (what `assistant_ask` does).
//!
//! Needs the embedding model (see tests/embedding_model.rs), an Anthropic API
//! key stored by the app, and the Project Gutenberg text of Pride and Prejudice
//! (#1342). Makes one short LLM call per question.
//!
//!     LEAFBOUND_EVAL_TEXT=path/to/pg1342.txt cargo test --release --test retrieval_eval -- --ignored --nocapture
//!
//! Measured 2026-10-17: before 9/16, question only 9/16, HyDE 14-16/16 (LLM
//! output varies between runs).

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use leafbound_lib::assistant::db::{AssistantDb, ChunkInput};
use leafbound_lib::assistant::embed::Embedder;
use std::sync::atomic::AtomicBool;

use leafbound_lib::assistant::llm::{stream_chat, ChatRequest, Provider, Role};
use leafbound_lib::assistant::{find_passages, prompt, secrets, CHUNK_INDEX};

const SIZE: usize = 500;
const OVERLAP: usize = 100;

/// (question, chapters that answer it; 1-based)
const QUESTIONS: &[(&str, &[usize])] = &[
    ("Why does Elizabeth change her mind about Mr. Darcy?", &[35, 36]),
    ("What did Darcy's letter say about Wickham?", &[35]),
    ("Why did Mr. Bingley leave Netherfield so suddenly?", &[21, 35]),
    ("How did Mr. Collins propose to Elizabeth?", &[19]),
    ("Why did Charlotte Lucas accept Mr. Collins?", &[22]),
    ("What did Lady Catherine demand when she visited Elizabeth?", &[56]),
    ("Who paid Wickham to marry Lydia?", &[50, 51, 52]),
    ("What did Elizabeth think of Pemberley?", &[43]),
    ("How did the family learn that Lydia had run away with Wickham?", &[46]),
    ("What did Mr. Darcy say about Elizabeth at the first ball?", &[3]),
    ("How did Jane fall ill at Netherfield?", &[7]),
    ("What did Mr. Bennet say when Elizabeth refused Mr. Collins?", &[20]),
    ("How did Darcy first propose and why did Elizabeth refuse him?", &[34]),
    ("Why did Lydia go to Brighton?", &[41]),
    ("ダーシーの手紙にはウィッカムについて何が書かれていた？", &[35]),
    ("エリザベスはペンバリーをどう思った？", &[43]),
];

fn model_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").expect("APPDATA");
    PathBuf::from(appdata).join("dev.leafbound.app").join("models").join("multilingual-e5-small")
}

/// Chapters of the Gutenberg text, illustration captions removed.
fn chapters(raw: &str) -> Vec<String> {
    let start = raw.find("It is a truth universally acknowledged").expect("start of text");
    let end = raw.find("*** END OF THE PROJECT GUTENBERG").expect("end of text");
    let mut text = String::new();
    let body = &raw[start..end];
    let mut depth = 0usize;
    let mut i = 0;
    let bytes: Vec<char> = body.chars().collect();
    while i < bytes.len() {
        let rest: String = bytes[i..bytes.len().min(i + 13)].iter().collect();
        if depth == 0 && rest == "[Illustration" {
            depth = 1;
            i += 1;
            continue;
        }
        if depth > 0 {
            match bytes[i] {
                '[' => depth += 1,
                ']' => depth -= 1,
                _ => {}
            }
        } else {
            text.push(bytes[i]);
        }
        i += 1;
    }
    let mut out = vec![String::new()];
    for line in text.lines() {
        let t = line.trim();
        let upper = t.to_uppercase();
        let is_heading = upper.starts_with("CHAPTER ")
            && upper[8..].trim_end_matches('.').chars().all(|c| "IVXLC".contains(c))
            && upper.len() > 8;
        if is_heading {
            out.push(String::new());
        } else {
            let ch = out.last_mut().unwrap();
            ch.push_str(line);
            ch.push('\n');
        }
    }
    out.into_iter()
        .map(|c| c.split("\n\n").map(|p| p.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|p| !p.is_empty()).collect::<Vec<_>>().join("\n"))
        .collect()
}

/// Same split as chunkRanges() in src/lib/bookText.ts.
fn chunk(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let boundary = |i: usize| matches!(chars[i], '。' | '．' | '！' | '？' | '!' | '?' | '\n') || (chars[i] == '.' && chars.get(i + 1).is_some_and(|c| c.is_whitespace()));
    let mut out = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let mut end = (start + SIZE).min(chars.len());
        if end < chars.len() {
            let from = start + SIZE * 6 / 10;
            if let Some(cut) = (from..end).rev().find(|&i| boundary(i)) {
                if cut + 1 > from {
                    end = cut + 1;
                }
            }
        }
        let body: String = chars[start..end].iter().collect::<String>().trim().to_string();
        if body.chars().count() >= 10 {
            out.push(body);
        }
        if end >= chars.len() {
            break;
        }
        let mut next = end - OVERLAP;
        if let Some(b) = (next..end - OVERLAP / 3).find(|&i| boundary(i)) {
            next = b + 1;
        }
        start = next.max(start + 1);
    }
    out
}

#[test]
#[ignore]
fn retrieval_finds_the_answering_chapter() {
    let path = std::env::var("LEAFBOUND_EVAL_TEXT").expect("set LEAFBOUND_EVAL_TEXT to pg1342.txt");
    let raw = std::fs::read_to_string(path).unwrap();
    let chapters = chapters(&raw);
    assert_eq!(chapters.len(), 61, "Pride and Prejudice has 61 chapters");

    let embedder = Embedder::new(model_dir());
    assert!(embedder.is_downloaded(), "run tests/embedding_model.rs first to download the model");
    embedder.load().unwrap();

    let mut db = AssistantDb::open_in_memory().unwrap();
    let t = Instant::now();
    let mut total = 0;
    for (i, text) in chapters.iter().enumerate() {
        let texts = chunk(text);
        total += texts.len();
        let vectors = embedder.embed_passages(&texts).unwrap();
        let rows: Vec<(ChunkInput, Vec<f32>)> = texts
            .into_iter()
            .zip(vectors)
            .map(|(text, v)| (ChunkInput { text, cfi: String::new() }, v))
            .collect();
        db.store_section("book", CHUNK_INDEX, i as i64 + 1, "", "", &rows).unwrap();
    }
    println!("indexed {total} chunks in {:?}", t.elapsed());

    let key = secrets::get(secrets::APP_SERVICE, "anthropic").unwrap().expect("store an Anthropic API key in the app first");
    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    let client = reqwest::Client::new();
    let system = prompt::hypothetical_passage("Pride and Prejudice", "Jane Austen", &chapters[0]);
    let hyde = |question: &str| -> String {
        let req = ChatRequest {
            provider: Provider::Anthropic,
            base_url: String::new(),
            model: "claude-sonnet-5-5".into(),
            api_key: Some(key.clone()),
            system: system.clone(),
            messages: vec![(Role::User, question.to_string())],
        };
        rt.block_on(stream_chat(&client, &req, &AtomicBool::new(false), |_| {})).expect("LLM call")
    };
    let sections = |hits: Vec<leafbound_lib::assistant::db::ChunkHit>| hits.iter().map(|c| c.section).collect::<Vec<_>>();

    let labels = ["before", "question", "hyde"];
    let mut hits = [0usize; 3];
    for (question, want) in QUESTIONS {
        let want: HashSet<i64> = want.iter().map(|&c| c as i64).collect();
        let q = embedder.embed_query(question).unwrap();
        let passage = hyde(question);
        let h = embedder.embed_passages(std::slice::from_ref(&passage)).unwrap().remove(0);
        let got = [
            sections(db.search_chunks("book", CHUNK_INDEX, &q, 6, None).unwrap()),
            sections(find_passages(&db, "book", &q, None).unwrap()),
            sections(find_passages(&db, "book", &h, None).unwrap()),
        ];
        let mut marks = String::new();
        let mut detail = String::new();
        for (i, g) in got.iter().enumerate() {
            let ok = g.iter().any(|s| want.contains(s));
            hits[i] += ok as usize;
            marks.push_str(if ok { "✔ " } else { "· " });
            detail.push_str(&format!(" {} {g:?}", labels[i]));
        }
        let mut w: Vec<_> = want.iter().collect();
        w.sort();
        println!("{marks}{question}\n      want {w:?} |{detail}");
    }
    let n = QUESTIONS.len();
    let summary: Vec<String> = labels.iter().zip(&hits).map(|(label, h)| format!("{label} {h}/{n}")).collect();
    println!("answering chapter retrieved: {}", summary.join(", "));
    assert!(hits[2] > hits[0], "HyDE search should find more answering chapters than the original search");
}
