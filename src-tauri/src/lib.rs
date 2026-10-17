pub mod assistant;
mod commands;
mod cover;
mod covers_protocol;
pub mod library;
pub mod updates;

use std::sync::Mutex;

use tauri::{Emitter, Manager};

use library::LibraryStore;

/// Shared, mutex-guarded library state.
pub struct AppState(pub Mutex<LibraryStore>);

/// EPUB paths passed on the command line (file association / "Open with")
/// that the frontend has not consumed yet.
pub struct PendingOpen(pub Mutex<Vec<String>>);

fn epub_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|a| a.to_ascii_lowercase().ends_with(".epub"))
        .collect()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = epub_args(argv.into_iter().skip(1));
            if !paths.is_empty() {
                let _ = app.emit("open-files", paths);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol(covers_protocol::SCHEME, covers_protocol::handle)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let mut store = LibraryStore::load(data_dir.clone())?;
            // Before the store is managed, so no command can have started an
            // import (whose files exist before its id is in the library). A
            // second instance never gets here: the single-instance plugin exits
            // during plugin setup, which runs before this hook.
            store.remove_orphaned_files();
            app.manage(AppState(Mutex::new(store)));
            app.manage(assistant::AssistantState::new(
                &data_dir,
                &app.config().identifier,
            )?);
            app.manage(updates::UpdateState::new(data_dir));
            app.manage(PendingOpen(Mutex::new(epub_args(std::env::args().skip(1)))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library,
            commands::import_books,
            commands::import_book_bytes,
            commands::read_book,
            commands::refresh_cover,
            commands::save_progress,
            commands::set_book_categories,
            commands::delete_book,
            commands::add_category,
            commands::rename_category,
            commands::remove_category,
            commands::save_settings,
            commands::get_annotations,
            commands::save_annotations,
            commands::take_pending_open_files,
            assistant::assistant_status,
            assistant::assistant_prepare,
            assistant::assistant_index_section,
            assistant::assistant_set_api_key,
            assistant::assistant_delete_api_key,
            assistant::assistant_history,
            assistant::assistant_clear_history,
            assistant::assistant_ask,
            assistant::assistant_cancel,
            updates::update_check,
            updates::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Leafbound");
}
