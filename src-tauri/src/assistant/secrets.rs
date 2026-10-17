//! API keys live in the OS credential store (Windows Credential Manager),
//! never in library.json and never sent back to the webview.

use serde::Serialize;

const SERVICE: &str = "dev.leafbound.app";

pub const PROVIDERS: &[&str] = &["anthropic", "openai"];

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("unknown provider: {provider}"));
    }
    keyring::Entry::new(SERVICE, &format!("llm-api-key:{provider}")).map_err(|e| format!("credential store: {e}"))
}

pub fn get(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("credential store: {e}")),
    }
}

pub fn set(provider: &str, key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return delete(provider);
    }
    entry(provider)?
        .set_password(key)
        .map_err(|e| format!("credential store: {e}"))
}

pub fn delete(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("credential store: {e}")),
    }
}

/// Which providers have a stored key.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub anthropic: bool,
    pub openai: bool,
}

pub fn status() -> KeyStatus {
    let has = |p: &str| matches!(get(p), Ok(Some(_)));
    KeyStatus { anthropic: has("anthropic"), openai: has("openai") }
}
