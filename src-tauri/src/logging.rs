//! Log output: stderr plus a rotating file under the data directory.
//!
//! A release build has no console (Windows builds hide it, and macOS apps started from
//! Finder have no terminal), so without the file nothing the backend reports about failed
//! imports, LLM requests, model downloads or updates would survive for a bug report.

use std::path::Path;

use log::LevelFilter;
use tauri::Runtime;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Folder under the data directory that holds the log files.
pub const LOG_DIR: &str = "logs";
/// File name of the current log, without the `.log` extension; rotated copies get a
/// timestamp suffix.
pub const LOG_FILE: &str = "leafbound";
/// Size at which the current log is rotated.
const MAX_FILE_SIZE: u128 = 1_000_000;
/// Number of log files kept, the current one included.
const KEEP_FILES: usize = 4;

/// The log plugin: `Info` and above from every crate, plus `Debug` from this crate in
/// debug builds. Dependencies stay at `Info` even then, since their `Debug` output
/// (HTTP connections, ONNX session details) would bury the lines that matter.
pub fn plugin<R: Runtime>(data_dir: &Path) -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri_plugin_log::Builder::new()
        .targets([
            Target::new(TargetKind::Stderr),
            Target::new(TargetKind::Folder {
                path: data_dir.join(LOG_DIR),
                file_name: Some(LOG_FILE.into()),
            }),
        ])
        .level(LevelFilter::Info)
        .max_file_size(MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal);
    if cfg!(debug_assertions) {
        builder
            .level_for("leafbound_lib", LevelFilter::Debug)
            .build()
    } else {
        builder.build()
    }
}
