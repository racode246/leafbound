//! API keys live in the OS credential store (Windows Credential Manager, macOS Keychain),
//! never in library.json and never sent back to the webview.
//!
//! Entries are keyed by the app identifier (`service`), so builds with another
//! identifier (E2E runs, worktree slots) never read or overwrite the keys of
//! the installed app (`dev.leafbound.app`).

use serde::Serialize;

use crate::library::Provider;

/// Identifier of the released app; its keys were stored under this name before
/// the service followed the identifier, so existing keys keep working.
pub const APP_SERVICE: &str = "dev.leafbound.app";

fn entry(service: &str, provider: Provider) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service, &format!("llm-api-key:{provider}"))
        .map_err(|e| format!("credential store: {e}"))
}

pub fn get(service: &str, provider: Provider) -> Result<Option<String>, String> {
    match entry(service, provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("credential store: {e}")),
    }
}

pub fn set(service: &str, provider: Provider, key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return delete(service, provider);
    }
    entry(service, provider)?
        .set_password(key)
        .map_err(|e| format!("credential store: {e}"))
}

pub fn delete(service: &str, provider: Provider) -> Result<(), String> {
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
    let has = |p: Provider| matches!(get(service, p), Ok(Some(_)));
    KeyStatus {
        anthropic: has(Provider::Anthropic),
        openai: has(Provider::OpenAi),
    }
}
