//! API keys live in the OS credential store (Windows Credential Manager),
//! never in library.json and never sent back to the webview.
//!
//! Entries are keyed by the app identifier (`service`), so builds with another
//! identifier (E2E runs, worktree slots) never read or overwrite the keys of
//! the installed app (`dev.leafbound.app`).

use serde::Serialize;

/// Identifier of the released app; its keys were stored under this name before
/// the service followed the identifier, so existing keys keep working.
pub const APP_SERVICE: &str = "dev.leafbound.app";

pub const PROVIDERS: &[&str] = &["anthropic", "openai"];

fn entry(service: &str, provider: &str) -> Result<keyring::Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("unknown provider: {provider}"));
    }
    keyring::Entry::new(service, &format!("llm-api-key:{provider}")).map_err(|e| format!("credential store: {e}"))
}

pub fn get(service: &str, provider: &str) -> Result<Option<String>, String> {
    match entry(service, provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("credential store: {e}")),
    }
}

pub fn set(service: &str, provider: &str, key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return delete(service, provider);
    }
    entry(service, provider)?
        .set_password(key)
        .map_err(|e| format!("credential store: {e}"))
}

pub fn delete(service: &str, provider: &str) -> Result<(), String> {
    match entry(service, provider)?.delete_credential() {
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

pub fn status(service: &str) -> KeyStatus {
    let has = |p: &str| matches!(get(service, p), Ok(Some(_)));
    KeyStatus { anthropic: has("anthropic"), openai: has("openai") }
}
