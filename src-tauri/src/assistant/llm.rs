//! Streaming chat against the Anthropic Messages API or any OpenAI-compatible
//! `/chat/completions` endpoint (OpenAI, OpenRouter, Gemini's compatibility
//! endpoint, Ollama, LM Studio, ...).

use std::sync::atomic::{AtomicBool, Ordering};

use futures_util::StreamExt;
use serde_json::{json, Value};

pub const ANTHROPIC_DEFAULT_BASE: &str = "https://api.anthropic.com";
pub const OPENAI_DEFAULT_BASE: &str = "https://api.openai.com/v1";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 16_000;

/// Models that accept server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS: &[&str] = &["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"];
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Anthropic,
    OpenAi,
}

impl Provider {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "anthropic" => Ok(Self::Anthropic),
            "openai" => Ok(Self::OpenAi),
            other => Err(format!("unknown provider: {other}")),
        }
    }

    pub fn key_name(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub provider: Provider,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub system: String,
    pub messages: Vec<(Role, String)>,
}

#[derive(Debug, PartialEq)]
pub enum ChatError {
    Cancelled,
    /// The model (or a safety classifier) declined; partial output is discarded.
    Refused,
    Failed(String),
}

impl From<String> for ChatError {
    fn from(s: String) -> Self {
        Self::Failed(s)
    }
}

fn base_or_default(base: &str, default: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    if base.is_empty() {
        default.to_string()
    } else {
        base.to_string()
    }
}

/// Refuses to send a key over plain HTTP unless the server is on this machine.
fn check_transport(url: &str, has_key: bool) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid API URL: {e}"))?;
    match parsed.scheme() {
        "https" => Ok(()),
        "http" => {
            let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1"));
            if local || !has_key {
                Ok(())
            } else {
                Err("API keys are only sent over HTTPS (plain HTTP is allowed for localhost).".into())
            }
        }
        other => Err(format!("unsupported URL scheme: {other}")),
    }
}

pub fn build_http_request(client: &reqwest::Client, req: &ChatRequest) -> Result<reqwest::RequestBuilder, String> {
    let key = req.api_key.as_deref().filter(|k| !k.is_empty());
    match req.provider {
        Provider::Anthropic => {
            let base = base_or_default(&req.base_url, ANTHROPIC_DEFAULT_BASE);
            let url = format!("{base}/v1/messages");
            check_transport(&url, key.is_some())?;
            let key = key.ok_or_else(|| "Anthropic API key is not set.".to_string())?;
            let messages: Vec<Value> = req
                .messages
                .iter()
                .map(|(role, text)| json!({ "role": role.as_str(), "content": text }))
                .collect();
            let mut body = json!({
                "model": req.model,
                "max_tokens": MAX_TOKENS,
                "stream": true,
                "system": req.system,
                "messages": messages,
            });
            let mut builder = client
                .post(url)
                .header("x-api-key", key)
                .header("anthropic-version", ANTHROPIC_VERSION);
            // Server-side fallback is only offered by the first-party API.
            if base == ANTHROPIC_DEFAULT_BASE && FALLBACK_MODELS.contains(&req.model.as_str()) {
                body["fallbacks"] = json!("default");
                builder = builder.header("anthropic-beta", FALLBACK_BETA);
            }
            Ok(builder.json(&body))
        }
        Provider::OpenAi => {
            let base = base_or_default(&req.base_url, OPENAI_DEFAULT_BASE);
            let url = format!("{base}/chat/completions");
            check_transport(&url, key.is_some())?;
            let mut messages = vec![json!({ "role": "system", "content": req.system })];
            messages.extend(
                req.messages
                    .iter()
                    .map(|(role, text)| json!({ "role": role.as_str(), "content": text })),
            );
            let body = json!({ "model": req.model, "stream": true, "messages": messages });
            let mut builder = client.post(url).json(&body);
            if let Some(key) = key {
                builder = builder.bearer_auth(key);
            }
            Ok(builder)
        }
    }
}

/// Splits a byte stream into server-sent event `data:` payloads.
#[derive(Default)]
pub struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(bytes);
        let mut out = Vec::new();
        while let Some(end) = find_event_end(&self.buf) {
            let (event, sep) = end;
            let raw: Vec<u8> = self.buf.drain(..event + sep).collect();
            let text = String::from_utf8_lossy(&raw[..event]);
            let data: Vec<&str> = text
                .lines()
                .filter_map(|l| l.strip_prefix("data:"))
                .map(|d| d.strip_prefix(' ').unwrap_or(d))
                .collect();
            if !data.is_empty() {
                out.push(data.join("\n"));
            }
        }
        out
    }
}

/// Position of the first blank-line separator and its length.
fn find_event_end(buf: &[u8]) -> Option<(usize, usize)> {
    let lf = buf.windows(2).position(|w| w == b"\n\n").map(|p| (p, 2));
    let crlf = buf.windows(4).position(|w| w == b"\r\n\r\n").map(|p| (p, 4));
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a } else { b }),
        (a, b) => a.or(b),
    }
}

/// What one SSE payload means for the answer being assembled.
#[derive(Debug, PartialEq)]
pub enum StreamItem {
    Text(String),
    Done,
    Refused,
    Error(String),
    Ignore,
}

pub fn interpret(provider: Provider, data: &str) -> StreamItem {
    if provider == Provider::OpenAi && data.trim() == "[DONE]" {
        return StreamItem::Done;
    }
    let Ok(v) = serde_json::from_str::<Value>(data) else {
        return StreamItem::Ignore;
    };
    if let Some(err) = v.get("error") {
        let msg = err
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| err.to_string());
        return StreamItem::Error(msg);
    }
    match provider {
        Provider::Anthropic => match v.get("type").and_then(Value::as_str) {
            Some("content_block_delta") => match v.pointer("/delta/type").and_then(Value::as_str) {
                Some("text_delta") => v
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .map(|t| StreamItem::Text(t.to_string()))
                    .unwrap_or(StreamItem::Ignore),
                _ => StreamItem::Ignore,
            },
            Some("message_delta") => match v.pointer("/delta/stop_reason").and_then(Value::as_str) {
                Some("refusal") => StreamItem::Refused,
                _ => StreamItem::Ignore,
            },
            Some("message_stop") => StreamItem::Done,
            _ => StreamItem::Ignore,
        },
        Provider::OpenAi => v
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty())
            .map(|t| StreamItem::Text(t.to_string()))
            .unwrap_or(StreamItem::Ignore),
    }
}

fn error_message(status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .or_else(|| v.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    format!("HTTP {}: {}", status.as_u16(), detail.trim())
}

/// Awaits `fut`, giving up with `None` once `cancel` is set (checked every 250 ms,
/// so a server that never answers can still be stopped).
async fn unless_cancelled<F: std::future::Future>(fut: F, cancel: &AtomicBool) -> Option<F::Output> {
    let mut fut = std::pin::pin!(fut);
    loop {
        match tokio::time::timeout(std::time::Duration::from_millis(250), &mut fut).await {
            Ok(out) => return Some(out),
            Err(_) if cancel.load(Ordering::Relaxed) => return None,
            Err(_) => {}
        }
    }
}

/// Sends the request and streams text pieces to `on_text`. Returns the full
/// answer, or `Cancelled` as soon as `cancel` is set.
pub async fn stream_chat(
    client: &reqwest::Client,
    req: &ChatRequest,
    cancel: &AtomicBool,
    mut on_text: impl FnMut(&str),
) -> Result<String, ChatError> {
    let response = unless_cancelled(build_http_request(client, req)?.send(), cancel)
        .await
        .ok_or(ChatError::Cancelled)?
        .map_err(|e| ChatError::Failed(format!("request failed: {e}")))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(ChatError::Failed(error_message(status, &body)));
    }

    let mut parser = SseParser::default();
    let mut answer = String::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = unless_cancelled(stream.next(), cancel).await.ok_or(ChatError::Cancelled)? {
        let chunk = chunk.map_err(|e| ChatError::Failed(format!("stream interrupted: {e}")))?;
        for data in parser.push(&chunk) {
            match interpret(req.provider, &data) {
                StreamItem::Text(t) => {
                    answer.push_str(&t);
                    on_text(&t);
                }
                StreamItem::Done => return Ok(answer),
                StreamItem::Refused => return Err(ChatError::Refused),
                StreamItem::Error(msg) => return Err(ChatError::Failed(msg)),
                StreamItem::Ignore => {}
            }
        }
    }
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_parser_handles_split_chunks_and_multibyte_text() {
        let mut p = SseParser::default();
        let event = "event: content_block_delta\ndata: {\"t\":\"日本語\"}\n\n".as_bytes();
        let (a, b) = event.split_at(40); // splits inside a multibyte character
        assert!(p.push(a).is_empty());
        assert_eq!(p.push(b), vec!["{\"t\":\"日本語\"}".to_string()]);
        assert_eq!(p.push(b"data: one\r\n\r\ndata: two\n\n"), vec!["one".to_string(), "two".to_string()]);
    }

    #[test]
    fn interprets_anthropic_events() {
        let p = Provider::Anthropic;
        assert_eq!(
            interpret(p, r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}"#),
            StreamItem::Text("Hi".into())
        );
        assert_eq!(
            interpret(p, r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}"#),
            StreamItem::Ignore
        );
        assert_eq!(
            interpret(p, r#"{"type":"message_delta","delta":{"stop_reason":"refusal"}}"#),
            StreamItem::Refused
        );
        assert_eq!(interpret(p, r#"{"type":"message_stop"}"#), StreamItem::Done);
        assert_eq!(
            interpret(p, r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#),
            StreamItem::Error("Overloaded".into())
        );
    }

    #[test]
    fn interprets_openai_events() {
        let p = Provider::OpenAi;
        assert_eq!(
            interpret(p, r#"{"choices":[{"index":0,"delta":{"content":"Yo"}}]}"#),
            StreamItem::Text("Yo".into())
        );
        assert_eq!(interpret(p, r#"{"choices":[{"index":0,"delta":{"role":"assistant"}}]}"#), StreamItem::Ignore);
        assert_eq!(interpret(p, "[DONE]"), StreamItem::Done);
    }

    #[test]
    fn stop_works_while_the_server_is_silent() {
        // A server that accepts the connection and never answers.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let _hold = std::thread::spawn(move || {
            let conn = listener.accept();
            std::thread::sleep(std::time::Duration::from_secs(5));
            drop(conn);
        });
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let flag = std::sync::Arc::clone(&cancel);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            flag.store(true, Ordering::Relaxed);
        });
        let mut req = request(Provider::OpenAi, "m", &format!("http://127.0.0.1:{port}/v1"));
        req.api_key = None;
        let started = std::time::Instant::now();
        let result = rt.block_on(stream_chat(&reqwest::Client::new(), &req, &cancel, |_| {}));
        assert_eq!(result, Err(ChatError::Cancelled));
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }

    #[test]
    fn keys_only_travel_over_https_or_localhost() {
        assert!(check_transport("https://api.example.com/v1/chat/completions", true).is_ok());
        assert!(check_transport("http://localhost:11434/v1/chat/completions", true).is_ok());
        assert!(check_transport("http://192.168.1.5:1234/v1/chat/completions", false).is_ok());
        assert!(check_transport("http://example.com/v1/chat/completions", true).is_err());
    }

    fn request(provider: Provider, model: &str, base: &str) -> ChatRequest {
        ChatRequest {
            provider,
            base_url: base.into(),
            model: model.into(),
            api_key: Some("sk-test".into()),
            system: "sys".into(),
            messages: vec![(Role::User, "q".into())],
        }
    }

    #[test]
    fn anthropic_request_shape() {
        let client = reqwest::Client::new();
        let built = build_http_request(&client, &request(Provider::Anthropic, "claude-sonnet-5-5", ""))
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(built.url().as_str(), "https://api.anthropic.com/v1/messages");
        assert_eq!(built.headers()["x-api-key"], "sk-test");
        assert_eq!(built.headers()["anthropic-beta"], FALLBACK_BETA);
        let body: Value = serde_json::from_slice(built.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(body["system"], "sys");
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(body["messages"][0]["role"], "user");

        // Proxies and older models get no fallback parameter.
        let proxied = build_http_request(&client, &request(Provider::Anthropic, "claude-sonnet-5-5", "https://proxy.example.com/"))
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(proxied.url().as_str(), "https://proxy.example.com/v1/messages");
        assert!(proxied.headers().get("anthropic-beta").is_none());
    }

    #[test]
    fn openai_request_puts_system_first_and_allows_keyless_local_servers() {
        let client = reqwest::Client::new();
        let mut req = request(Provider::OpenAi, "llama3", "http://localhost:11434/v1/");
        req.api_key = None;
        let built = build_http_request(&client, &req).unwrap().build().unwrap();
        assert_eq!(built.url().as_str(), "http://localhost:11434/v1/chat/completions");
        assert!(built.headers().get("authorization").is_none());
        let body: Value = serde_json::from_slice(built.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "q");
    }
}
