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

mod common;

use std::collections::HashSet;
use std::sync::atomic::AtomicBool;

use common::BOOK_ID;
use leafbound_lib::assistant::llm::{stream_chat, ChatRequest, Provider, Role};
use leafbound_lib::assistant::{find_passages, prompt, secrets, CHUNK_INDEX};

/// (question, chapters that answer it; 1-based)
const QUESTIONS: &[(&str, &[usize])] = &[
    (
        "Why does Elizabeth change her mind about Mr. Darcy?",
        &[35, 36],
    ),
    ("What did Darcy's letter say about Wickham?", &[35]),
    (
        "Why did Mr. Bingley leave Netherfield so suddenly?",
        &[21, 35],
    ),
    ("How did Mr. Collins propose to Elizabeth?", &[19]),
    ("Why did Charlotte Lucas accept Mr. Collins?", &[22]),
    (
        "What did Lady Catherine demand when she visited Elizabeth?",
        &[56],
    ),
    ("Who paid Wickham to marry Lydia?", &[50, 51, 52]),
    ("What did Elizabeth think of Pemberley?", &[43]),
    (
        "How did the family learn that Lydia had run away with Wickham?",
        &[46],
    ),
    (
        "What did Mr. Darcy say about Elizabeth at the first ball?",
        &[3],
    ),
    ("How did Jane fall ill at Netherfield?", &[7]),
    (
        "What did Mr. Bennet say when Elizabeth refused Mr. Collins?",
        &[20],
    ),
    (
        "How did Darcy first propose and why did Elizabeth refuse him?",
        &[34],
    ),
    ("Why did Lydia go to Brighton?", &[41]),
    (
        "ダーシーの手紙にはウィッカムについて何が書かれていた？",
        &[35],
    ),
    ("エリザベスはペンバリーをどう思った？", &[43]),
];

#[test]
#[ignore]
fn retrieval_finds_the_answering_chapter() {
    let chapters = common::eval_chapters();
    let embedder = common::loaded_embedder();
    let db = common::index_book(&embedder, &chapters);

    let key = secrets::get(secrets::APP_SERVICE, "anthropic")
        .unwrap()
        .expect("store an Anthropic API key in the app first");
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
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
        rt.block_on(stream_chat(&client, &req, &AtomicBool::new(false), |_| {}))
            .expect("LLM call")
    };
    let sections = |hits: Vec<leafbound_lib::assistant::db::ChunkHit>| {
        hits.iter().map(|c| c.section).collect::<Vec<_>>()
    };

    let labels = ["before", "question", "hyde"];
    let mut hits = [0usize; 3];
    for (question, want) in QUESTIONS {
        let want: HashSet<i64> = want.iter().map(|&c| c as i64).collect();
        let q = embedder.embed_query(question).unwrap();
        let passage = hyde(question);
        let h = embedder
            .embed_passages(std::slice::from_ref(&passage))
            .unwrap()
            .remove(0);
        let got = [
            sections(db.search_chunks(BOOK_ID, CHUNK_INDEX, &q, 6, None).unwrap()),
            sections(find_passages(&db, BOOK_ID, &q, None).unwrap()),
            sections(find_passages(&db, BOOK_ID, &h, None).unwrap()),
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
    let summary: Vec<String> = labels
        .iter()
        .zip(&hits)
        .map(|(label, h)| format!("{label} {h}/{n}"))
        .collect();
    println!("answering chapter retrieved: {}", summary.join(", "));
    assert!(
        hits[2] > hits[0],
        "HyDE search should find more answering chapters than the original search"
    );
}
