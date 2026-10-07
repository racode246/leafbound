use std::path::Path;

use tauri::ipc::Response;
use tauri::State;

use crate::library::{Book, Import, ImportOutcome, Library, Settings};
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
pub fn take_pending_open_files(pending: State<'_, PendingOpen>) -> Vec<String> {
    let mut guard = pending.0.lock().unwrap_or_else(|p| p.into_inner());
    std::mem::take(&mut *guard)
}
