//! Answer style check on a real novel: do answers talk about the book, or
//! about the prompt ("in the material I have", "(current chapter)")? And do
//! they cite the passages with [#n] / [Hn] labels the reader can click?
//!
//! Each question goes through the same steps as `assistant_ask`: the HyDE
//! search passage, `find_passages`, `prompt::build` and the answer. The
//! "current chapter" is the chapter the reader is assumed to be in, cut to
//! 6000 characters from its start like the frontend does (src/lib/bookText.ts).
//!
//! Needs the embedding model (see tests/embedding_model.rs), an Anthropic API
//! key stored by the app, and the Project Gutenberg text of Pride and Prejudice
//! (#1342). Makes two LLM calls per question (search passage + answer), 10 per
//! run; an answer prompt is a few thousand tokens (6000 characters of chapter
//! plus eight 500-character passages).
//!
//!     LEAFBOUND_EVAL_TEXT=path/to/pg1342.txt cargo test --release --test answer_style_eval -- --ignored --nocapture
//!
//! Measured 2026-10-18 with claude-sonnet-5-5: old instructions 2/5 answers
//! with prompt talk, 4/5 citing; new instructions 0/5 with prompt talk and
//! 5/5, 4/5 citing in two runs (an answer without citations is Q2, whose
//! retrieved passages miss the chapters that explain it).

mod common;

use std::sync::atomic::AtomicBool;

use common::BOOK_ID;
use leafbound_lib::assistant::llm::{stream_chat, ChatRequest, Provider, Role};
use leafbound_lib::assistant::{find_passages, prompt, secrets};

const MODEL: &str = "claude-sonnet-5-5";
/// CHAPTER_CONTEXT_CHARS in src/lib/bookText.ts.
const CHAPTER_CONTEXT_CHARS: usize = 60_000;

/// (question, chapter the reader is in)
const QUESTIONS: &[(&str, usize)] = &[
    ("What did Elizabeth think of Pemberley?", 43),
    ("Why did Mr. Bingley leave Netherfield so suddenly?", 24),
    // The book never gives Darcy's age: the answer should say so plainly.
    ("How old is Mr. Darcy?", 10),
    ("ダーシーの手紙にはウィッカムについて何が書かれていた？", 36),
    ("シャーロットはなぜコリンズ氏の求婚を受け入れたの？", 22),
];

/// Wording that describes the prompt rather than the book (issue #5).
const PROMPT_TALK: &[&str] = &[
    "material",
    "passages i have",
    "(current chapter)",
    "資料",
    "手元の",
    "(現在の章)",
    "（現在の章）",
];

/// Reported, not counted: wording that may be fine in a sentence but often
/// points back at the prompt, and Markdown.
const WATCH: &[&str] = &[
    "passage",
    "excerpt",
    "provided",
    "retrieved",
    "current chapter",
    "context",
    "i can see",
    "parts i have",
    "抜粋",
    "提供された",
    "現在の章",
    "文脈",
    "見える範囲",
    "手元",
    // Markdown the instructions ask the model to leave out.
    "**",
    "##",
];

/// Labels the frontend turns into links (AssistantPanel.tsx: `[#n]`, `[Hn]`).
fn citations(answer: &str) -> Vec<String> {
    let chars: Vec<char> = answer.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' && matches!(chars.get(i + 1), Some('#' | 'H')) {
            let digits: String = chars[i + 2..]
                .iter()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if !digits.is_empty() && chars.get(i + 2 + digits.len()) == Some(&']') {
                out.push(format!("{}{digits}", chars[i + 1]));
                i += 3 + digits.len();
                continue;
            }
        }
        i += 1;
    }
    out
}

fn found<'a>(answer: &str, words: &[&'a str]) -> Vec<&'a str> {
    let lower = answer.to_lowercase();
    words
        .iter()
        .copied()
        .filter(|w| lower.contains(w))
        .collect()
}

#[test]
fn citation_labels_are_parsed_like_the_frontend() {
    assert_eq!(
        citations("a [#1] b [H2][#10] c [#1, #2] [x] [#]"),
        ["#1", "H2", "#10"]
    );
}

#[test]
#[ignore]
fn answers_talk_about_the_book() {
    let chapters = common::eval_chapters();
    let embedder = common::loaded_embedder();
    let db = common::index_book(&embedder, &chapters);

    let key = secrets::get(secrets::APP_SERVICE, Provider::Anthropic)
        .unwrap()
        .expect("store an Anthropic API key in the app first");
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let client = reqwest::Client::new();
    let ask = |system: String, messages: Vec<(Role, String)>| -> String {
        let req = ChatRequest {
            provider: Provider::Anthropic,
            base_url: String::new(),
            model: MODEL.into(),
            api_key: Some(key.clone()),
            system,
            messages,
        };
        rt.block_on(stream_chat(&client, &req, &AtomicBool::new(false), |_| {}))
            .expect("LLM call")
    };

    let mut prompt_talk = 0;
    let mut cited = 0;
    let mut rows = Vec::new();
    for (n, (question, reading)) in QUESTIONS.iter().enumerate() {
        let full = &chapters[reading - 1];
        let total = full.chars().count();
        let complete = total <= CHAPTER_CONTEXT_CHARS;
        let chapter_text: String = full.chars().take(CHAPTER_CONTEXT_CHARS).collect();
        let covered = complete.then_some(*reading as i64);
        let omitted = (!complete).then(|| prompt::ChapterOmitted {
            before: 0,
            after: (total - CHAPTER_CONTEXT_CHARS) as u64,
        });

        let passage = ask(
            prompt::hypothetical_passage("Pride and Prejudice", "Jane Austen", &chapter_text),
            vec![(Role::User, question.to_string())],
        );
        let h = embedder
            .embed_passages(std::slice::from_ref(&passage))
            .unwrap()
            .remove(0);
        let passages = find_passages(&db, BOOK_ID, &h, Some(*reading as i64), covered).unwrap();
        let title = common::chapter_title(*reading);
        let built = prompt::build(&prompt::PromptInput {
            title: "Pride and Prejudice",
            author: "Jane Austen",
            percent: (*reading as f64 - 0.5) / chapters.len() as f64,
            chapter_title: Some(&title),
            chapter_text: &chapter_text,
            chapter_omitted: omitted,
            passages: &passages,
            highlights: &[],
            related: &[],
            window: &[],
            question,
        });
        let answer = ask(built.system, built.messages);

        let talk = found(&answer, PROMPT_TALK);
        let watch = found(&answer, WATCH);
        let labels = citations(&answer);
        let unknown: Vec<&String> = labels
            .iter()
            .filter(|l| !built.sources.iter().any(|s| &s.label == *l))
            .collect();
        prompt_talk += !talk.is_empty() as usize;
        cited += !labels.is_empty() as usize;
        let sections: Vec<i64> = passages.iter().map(|p| p.section).collect();
        println!(
            "\n=== Q{} {question}\n    reading {title}{} | passages from chapters {sections:?}\n\n{}\n",
            n + 1,
            if complete { " (whole chapter)" } else { "" },
            answer.trim()
        );
        println!(
            "--- prompt talk {talk:?} | watch {watch:?} | citations {labels:?}{}",
            if unknown.is_empty() {
                String::new()
            } else {
                format!(" | unknown labels {unknown:?}")
            }
        );
        rows.push(format!(
            "| Q{} | {} | {} | {} |",
            n + 1,
            if talk.is_empty() {
                "-".to_string()
            } else {
                talk.join(", ")
            },
            labels.len(),
            if watch.is_empty() {
                "-".to_string()
            } else {
                watch.join(", ")
            }
        ));
    }

    let total = QUESTIONS.len();
    println!("\n| Question | Prompt talk | Citations | Watch words |\n|---|---|---|---|");
    for row in &rows {
        println!("{row}");
    }
    println!("\nanswers with prompt talk: {prompt_talk}/{total}, answers with citations: {cited}/{total}");
    assert_eq!(prompt_talk, 0, "answers should not describe the prompt");
    assert!(
        cited + 1 >= total,
        "at least {} of {total} answers should cite [#n] or [Hn]",
        total - 1
    );
}
