//! Shared setup for the evaluations on a real novel (retrieval_eval.rs,
//! answer_style_eval.rs): the Project Gutenberg text of Pride and Prejudice
//! (#1342), split into chapters and chunks the way the app indexes a book.

use std::path::PathBuf;
use std::time::Instant;

use leafbound_lib::assistant::db::{AssistantDb, ChunkInput};
use leafbound_lib::assistant::embed::Embedder;
use leafbound_lib::assistant::CHUNK_INDEX;

const SIZE: usize = 500;
const OVERLAP: usize = 100;

pub const BOOK_ID: &str = "book";

/// The embedding model the installed app downloaded (read only).
pub fn loaded_embedder() -> Embedder {
    let appdata = std::env::var("APPDATA").expect("APPDATA");
    let dir = PathBuf::from(appdata)
        .join("dev.leafbound.app")
        .join("models")
        .join("multilingual-e5-small");
    let embedder = Embedder::new(dir);
    assert!(
        embedder.is_downloaded(),
        "run tests/embedding_model.rs first to download the model"
    );
    embedder.load().unwrap();
    embedder
}

/// Chapters of the text in `LEAFBOUND_EVAL_TEXT`; index 0 is chapter 1.
pub fn eval_chapters() -> Vec<String> {
    let path = std::env::var("LEAFBOUND_EVAL_TEXT").expect("set LEAFBOUND_EVAL_TEXT to pg1342.txt");
    let raw = std::fs::read_to_string(path).unwrap();
    let chapters = chapters(&raw);
    assert_eq!(chapters.len(), 61, "Pride and Prejudice has 61 chapters");
    chapters
}

/// Indexes every chapter as one spine section (section = chapter number).
pub fn index_book(embedder: &Embedder, chapters: &[String]) -> AssistantDb {
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
            .map(|(text, v)| {
                (
                    ChunkInput {
                        text,
                        cfi: String::new(),
                    },
                    v,
                )
            })
            .collect();
        db.store_section(
            BOOK_ID,
            CHUNK_INDEX,
            i as i64 + 1,
            "",
            &chapter_title(i + 1),
            &rows,
        )
        .unwrap();
    }
    println!("indexed {total} chunks in {:?}", t.elapsed());
    db
}

/// Chapter heading as the reader's table of contents would show it.
pub fn chapter_title(number: usize) -> String {
    format!("Chapter {number}")
}

/// Chapters of the Gutenberg text, illustration captions removed.
fn chapters(raw: &str) -> Vec<String> {
    let start = raw
        .find("It is a truth universally acknowledged")
        .expect("start of text");
    let end = raw
        .find("*** END OF THE PROJECT GUTENBERG")
        .expect("end of text");
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
            && upper[8..]
                .trim_end_matches('.')
                .chars()
                .all(|c| "IVXLC".contains(c))
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
        .map(|c| {
            c.split("\n\n")
                .map(|p| p.split_whitespace().collect::<Vec<_>>().join(" "))
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .collect()
}

/// Same split as chunkRanges() in src/lib/bookText.ts.
fn chunk(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let boundary = |i: usize| {
        matches!(chars[i], '。' | '．' | '！' | '？' | '!' | '?' | '\n')
            || (chars[i] == '.' && chars.get(i + 1).is_some_and(|c| c.is_whitespace()))
    };
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
        let body: String = chars[start..end]
            .iter()
            .collect::<String>()
            .trim()
            .to_string();
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
