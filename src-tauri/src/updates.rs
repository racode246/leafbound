//! In-app updates through `tauri-plugin-updater`.
//!
//! The endpoint (`latest.json` of the latest GitHub release) and the minisign public key
//! are in `tauri.conf.json` under `plugins.updater`. The frontend checks once at startup
//! (`automatic`, at most once a day) and from the "Check for updates" button; it then asks
//! for confirmation and calls `update_install`, which downloads the installer, verifies
//! its signature and runs it. On Windows the plugin starts the NSIS installer and exits
//! the app; the installer restarts it.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, TimeDelta, Utc};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The automatic check runs at most this often.
pub const CHECK_INTERVAL: TimeDelta = TimeDelta::hours(24);
/// Stored next to library.json; not part of `Settings` (nothing the user chooses).
pub const CHECK_FILE: &str = "update-check.json";
/// `latest.json` is small: a check that takes longer than this has failed.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// The whole download (about 30 MB), so generous for slow connections.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// When the last automatic check started (RFC 3339, like the dates in library.json).
#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckRecord {
    #[serde(default)]
    pub last_checked_at: Option<String>,
}

impl CheckRecord {
    /// A missing or unreadable file means "never checked".
    pub fn load(data_dir: &Path) -> Self {
        std::fs::read_to_string(data_dir.join(CHECK_FILE))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, data_dir: &Path) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        std::fs::write(data_dir.join(CHECK_FILE), json).map_err(|e| e.to_string())
    }

    /// Whether the automatic check should run now. A time in the future (the clock was
    /// set back) does not hold checks off until then; an unreadable one is ignored.
    pub fn is_due(&self, now: DateTime<Utc>) -> bool {
        let last = self
            .last_checked_at
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok());
        match last {
            None => true,
            Some(last) => {
                let last = last.to_utc();
                last > now || now - last >= CHECK_INTERVAL
            }
        }
    }

    pub fn checked_at(now: DateTime<Utc>) -> Self {
        Self {
            last_checked_at: Some(now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        }
    }
}

/// What the frontend shows about an available update.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// Release notes from `latest.json`.
    pub notes: Option<String>,
    /// RFC 3339 publish date.
    pub date: Option<String>,
}

impl From<&Update> for UpdateInfo {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone().filter(|s| !s.trim().is_empty()),
            date: update
                .raw_json
                .get("pub_date")
                .and_then(|d| d.as_str())
                .map(str::to_string),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InstallEvent {
    /// Bytes downloaded so far; `total` when the server sent a length.
    Progress { downloaded: u64, total: Option<u64> },
    /// Downloaded; the signature is checked and the installer started.
    Installing,
}

pub struct UpdateState {
    data_dir: PathBuf,
    /// The update found by the last check, installed on confirmation.
    pending: Mutex<Option<Update>>,
    installing: AtomicBool,
}

impl UpdateState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            pending: Mutex::new(None),
            installing: AtomicBool::new(false),
        }
    }
}

/// Emits download progress at most once per percent (or per 512 KiB without a length),
/// so a 30 MB download is about a hundred events rather than thousands.
#[derive(Default)]
pub struct ProgressThrottle {
    downloaded: u64,
    last_sent: Option<u64>,
}

impl ProgressThrottle {
    pub fn add(&mut self, chunk: usize, total: Option<u64>) -> Option<InstallEvent> {
        self.downloaded += chunk as u64;
        let step = match total {
            Some(t) if t > 0 => (t / 100).max(1),
            _ => 512 * 1024,
        };
        let done = total.is_some_and(|t| self.downloaded >= t);
        let due = match self.last_sent {
            None => true,
            Some(last) => self.downloaded - last >= step,
        };
        if due || done {
            self.last_sent = Some(self.downloaded);
            Some(InstallEvent::Progress {
                downloaded: self.downloaded,
                total,
            })
        } else {
            None
        }
    }
}

/// Checks the update endpoint. `automatic` (the startup check) runs at most once a day,
/// not in `tauri dev`, and never reports an error: failures are only logged, so being
/// offline does not bother the user. A manual check returns the error.
#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
    automatic: bool,
) -> Result<Option<UpdateInfo>, String> {
    if automatic {
        if tauri::is_dev() {
            eprintln!("update: no automatic check in `tauri dev`");
            return Ok(None);
        }
        let now = Utc::now();
        let record = CheckRecord::load(&state.data_dir);
        if !record.is_due(now) {
            eprintln!(
                "update: no automatic check, the last one was at {}",
                record.last_checked_at.as_deref().unwrap_or_default()
            );
            return Ok(None);
        }
        if let Err(err) = CheckRecord::checked_at(now).save(&state.data_dir) {
            eprintln!("update: cannot save {CHECK_FILE}: {err}");
        }
    }

    let found = async {
        app.updater_builder()
            .timeout(CHECK_TIMEOUT)
            .build()?
            .check()
            .await
    }
    .await;

    match found {
        Ok(Some(mut update)) => {
            eprintln!(
                "update: {} is available (running {})",
                update.version, update.current_version
            );
            update.timeout = Some(DOWNLOAD_TIMEOUT);
            let info = UpdateInfo::from(&update);
            *state.pending.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        Ok(None) => {
            eprintln!("update: up to date");
            *state.pending.lock().unwrap() = None;
            Ok(None)
        }
        Err(err) => {
            eprintln!("update: check failed: {err}");
            if automatic {
                Ok(None)
            } else {
                Err(err.to_string())
            }
        }
    }
}

/// Downloads, verifies and installs the update found by the last check. On Windows the
/// app exits here once the installer has started (the installer restarts it); this
/// returns only on failure, e.g. a signature that does not match the public key.
#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    state: State<'_, UpdateState>,
    on_event: Channel<InstallEvent>,
) -> Result<(), String> {
    let update = state
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no update to install".to_string())?;
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("an update is already being installed".into());
    }

    eprintln!("update: installing {}", update.version);
    let mut progress = ProgressThrottle::default();
    let result = update
        .download_and_install(
            |chunk, total| {
                if let Some(event) = progress.add(chunk, total) {
                    let _ = on_event.send(event);
                }
            },
            || {
                let _ = on_event.send(InstallEvent::Installing);
            },
        )
        .await;
    state.installing.store(false, Ordering::SeqCst);

    match result {
        // Not reached on Windows, where the plugin exits the app to run the installer.
        Ok(()) => app.restart(),
        Err(err) => {
            eprintln!("update: install failed: {err}");
            Err(err.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().to_utc()
    }

    #[test]
    fn checks_at_most_once_a_day() {
        let now = at("2026-10-18T12:00:00Z");
        assert!(CheckRecord::default().is_due(now));
        let record = |last: &str| CheckRecord::checked_at(at(last));
        assert!(!record("2026-10-18T11:00:00Z").is_due(now));
        assert!(!record("2026-10-17T12:00:01Z").is_due(now));
        assert!(record("2026-10-17T12:00:00Z").is_due(now));
        assert!(record("2026-10-01T00:00:00Z").is_due(now));
        // The clock was set back: do not wait until the stored time comes round again.
        assert!(record("2027-01-01T00:00:00Z").is_due(now));
        let garbled = CheckRecord {
            last_checked_at: Some("yesterday".into()),
        };
        assert!(garbled.is_due(now));
    }

    #[test]
    fn check_record_round_trips_and_tolerates_bad_files() {
        let dir = std::env::temp_dir().join(format!("leafbound-update-{}", uuid::Uuid::new_v4()));
        assert_eq!(CheckRecord::load(&dir), CheckRecord::default());
        let record = CheckRecord::checked_at(at("2026-10-18T12:00:00Z"));
        record.save(&dir).unwrap();
        assert!(std::fs::read_to_string(dir.join(CHECK_FILE))
            .unwrap()
            .contains("2026-10-18T12:00:00.000Z"));
        assert_eq!(CheckRecord::load(&dir), record);
        std::fs::write(dir.join(CHECK_FILE), "not json").unwrap();
        assert_eq!(CheckRecord::load(&dir), CheckRecord::default());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    fn downloaded(event: Option<InstallEvent>) -> Option<u64> {
        match event {
            Some(InstallEvent::Progress { downloaded, .. }) => Some(downloaded),
            _ => None,
        }
    }

    #[test]
    fn progress_is_sent_about_once_a_percent() {
        let mut p = ProgressThrottle::default();
        let total = Some(10_000);
        assert_eq!(downloaded(p.add(10, total)), Some(10));
        assert_eq!(downloaded(p.add(50, total)), None);
        assert_eq!(downloaded(p.add(50, total)), Some(110));
        let sent = (0..98)
            .filter_map(|_| downloaded(p.add(100, total)))
            .count();
        assert!((90..=98).contains(&sent), "{sent} events");
        // The last chunk is always reported, so the bar reaches the end.
        assert_eq!(downloaded(p.add(90, total)), Some(10_000));
    }

    #[test]
    fn progress_without_a_length_is_sent_every_512_kib() {
        let mut p = ProgressThrottle::default();
        assert!(p.add(1024, None).is_some());
        assert!(p.add(256 * 1024, None).is_none());
        assert!(p.add(256 * 1024, None).is_some());
    }
}
