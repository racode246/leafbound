use std::path::Path;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::library::{Annotation, Book, Import, ImportOutcome, Library, Settings};
use crate::{AppState, PendingOpen};

type Store<'a> = State<'a, AppState>;

fn lock<'a>(state: &'a Store<'a>) -> std::sync::MutexGuard<'a, crate::library::LibraryStore> {
    state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[tauri::command]
pub fn get_library(state: Store<'_>) -> Library {
    lock(&state).snapshot()
}

#[tauri::command]
pub async fn import_books(state: Store<'_>, paths: Vec<String>) -> Result<ImportOutcome, String> {
    let mut store = lock(&state);
    let mut outcome = ImportOutcome::default();
    for p in paths {
        let path = Path::new(&p);
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| p.clone());
        match store.import_file(path) {
            Ok(Import::Added(book)) => outcome.added.push(book),
            Ok(Import::Duplicate(_)) => outcome.duplicates.push(name),
            Err(err) => {
                eprintln!("import failed for {p}: {err}");
                outcome.failed.push(name);
            }
        }
    }
    Ok(outcome)
}

/// Imports one EPUB sent as a raw request body. The file name travels in the
/// `x-file-name` header (percent-encoded) because HTML5 drops carry no path.
#[tauri::command]
pub async fn import_book_bytes(state: Store<'_>, request: Request<'_>) -> Result<ImportOutcome, String> {
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "book.epub".to_string());
    let bytes: &[u8] = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("expected a binary body".into()),
    };
    let mut outcome = ImportOutcome::default();
    match lock(&state).import_bytes(&name, bytes) {
        Ok(Import::Added(book)) => outcome.added.push(book),
        Ok(Import::Duplicate(_)) => outcome.duplicates.push(name),
        Err(err) => {
            eprintln!("import failed for {name}: {err}");
            outcome.failed.push(name);
        }
    }
    Ok(outcome)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

#[tauri::command]
pub async fn read_book(state: Store<'_>, id: String) -> Result<Response, String> {
    let bytes = lock(&state).read_book(&id)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn save_progress(state: Store<'_>, id: String, cfi: String, percent: f64) -> Result<(), String> {
    lock(&state).save_progress(&id, cfi, percent)
}

#[tauri::command]
pub fn set_book_categories(state: Store<'_>, id: String, categories: Vec<String>) -> Result<Book, String> {
    lock(&state).set_book_categories(&id, categories)
}

#[tauri::command]
pub fn delete_book(state: Store<'_>, id: String) -> Result<(), String> {
    lock(&state).delete_book(&id)
}

#[tauri::command]
pub fn add_category(state: Store<'_>, name: String) -> Result<Vec<String>, String> {
    lock(&state).add_category(&name)
}

#[tauri::command]
pub fn rename_category(state: Store<'_>, from: String, to: String) -> Result<Library, String> {
    lock(&state).rename_category(&from, &to)
}

#[tauri::command]
pub fn remove_category(state: Store<'_>, name: String) -> Result<Library, String> {
    lock(&state).remove_category(&name)
}

#[tauri::command]
pub fn save_settings(state: Store<'_>, settings: Settings) -> Result<Settings, String> {
    lock(&state).save_settings(settings)
}

#[tauri::command]
pub fn get_annotations(state: Store<'_>, id: String) -> Result<Vec<Annotation>, String> {
    lock(&state).load_annotations(&id)
}

#[tauri::command]
pub fn save_annotations(state: Store<'_>, id: String, annotations: Vec<Annotation>) -> Result<(), String> {
    lock(&state).save_annotations(&id, &annotations)
}

#[tauri::command]
pub fn take_pending_open_files(pending: State<'_, PendingOpen>) -> Vec<String> {
    let mut guard = pending.0.lock().unwrap_or_else(|p| p.into_inner());
    std::mem::take(&mut *guard)
}
