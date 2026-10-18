pub mod assistant;
mod commands;
mod cover;
mod covers_protocol;
pub mod library;
mod logging;
pub mod updates;
mod window_placement;

use std::sync::Mutex;

use tauri::{webview::PageLoadEvent, Emitter, Manager};

use library::LibraryStore;

/// Shared, mutex-guarded library state.
pub struct AppState(pub Mutex<LibraryStore>);

/// EPUB paths passed on the command line (file association / "Open with"), or on
/// macOS opened from Finder, that the frontend has not consumed yet. `None` once the
/// frontend has taken them: later files go to it as "open-files" events.
pub struct PendingOpen(pub Mutex<Option<Vec<String>>>);

fn epub_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|a| a.to_ascii_lowercase().ends_with(".epub"))
        .collect()
}

/// EPUB paths among the URLs macOS hands the app when books are opened from Finder
/// (`RunEvent::Opened`); macOS passes them there, not on the command line.
#[cfg(any(target_os = "macos", all(test, unix)))]
fn epub_urls(urls: &[tauri::Url]) -> Vec<String> {
    epub_args(
        urls.iter()
            .filter(|u| u.scheme() == "file")
            .filter_map(|u| u.to_file_path().ok())
            .map(|p| p.to_string_lossy().into_owned()),
    )
}

pub fn run() {
    let app = tauri::Builder::default()
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
        // Restores the main window as it is created and saves it on exit.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_placement::STATE_FLAGS)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol(covers_protocol::SCHEME, covers_protocol::handle)
        // Managed before setup: on macOS the books a launch was for arrive as
        // RunEvent::Opened before the Ready event that runs setup.
        .manage(PendingOpen(Mutex::new(Some(epub_args(
            std::env::args().skip(1),
        )))))
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == PageLoadEvent::Finished {
                window_placement::keep_on_screen_once(&webview.window());
            }
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.handle().plugin(logging::plugin(&data_dir))?;
            log::info!(
                "Leafbound {} starting, data in {}",
                env!("CARGO_PKG_VERSION"),
                data_dir.display()
            );
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
        .build(tauri::generate_context!())
        .expect("error while building Leafbound");

    app.run(|_app, _event| {
        // Finder sends the books to open (double-click, "Open With", dropping on the Dock
        // icon) as Apple Events, both at launch and while the app is running.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = epub_urls(&urls);
            if paths.is_empty() {
                return;
            }
            let pending = _app.state::<PendingOpen>();
            let mut guard = pending.0.lock().unwrap_or_else(|p| p.into_inner());
            match guard.as_mut() {
                Some(queued) => queued.extend(paths),
                None => {
                    drop(guard);
                    let _ = _app.emit("open-files", paths);
                    if let Some(window) = _app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epub_args_keeps_epub_files_only() {
        let args = ["Book.EPUB", "--flag", "notes.txt", "other.epub"].map(String::from);
        assert_eq!(epub_args(args), ["Book.EPUB", "other.epub"]);
    }

    #[cfg(unix)]
    #[test]
    fn epub_urls_decodes_file_urls_and_skips_the_rest() {
        let urls = [
            "file:///Users/me/Books/%E5%B0%8F%E8%AA%AC%20A.epub",
            "file:///Users/me/notes.txt",
            "https://example.com/book.epub",
        ]
        .map(|u| tauri::Url::parse(u).unwrap());
        assert_eq!(epub_urls(&urls), ["/Users/me/Books/小説 A.epub"]);
    }
}
