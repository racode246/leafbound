mod commands;
mod cover;
mod covers_protocol;
pub mod library;

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
        .register_uri_scheme_protocol(covers_protocol::SCHEME, covers_protocol::handle)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let store = LibraryStore::load(data_dir)?;
            app.manage(AppState(Mutex::new(store)));
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Leafbound");
}
