use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub cfi: String,
    pub percent: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub file_name: String,
    pub has_cover: bool,
    pub added_at: String,
    pub last_opened_at: Option<String>,
    pub progress: Option<Progress>,
    #[serde(default)]
    pub categories: Vec<String>,
    /// SHA-256 of the EPUB file, used to detect re-imports of the same book.
    #[serde(default)]
    pub content_hash: Option<String>,
    /// Bumped whenever the cover file is rewritten so the UI can bust its cache.
    #[serde(default)]
    pub cover_version: u32,
    /// Absolute path of the cached cover image, resolved at read time.
    #[serde(default, skip_deserializing)]
    pub cover_path: Option<String>,
}

/// Deserializes a setting that has a fixed set of values, falling back to its
/// default when the stored value is not one of them (say, a `theme` written by
/// a newer or a broken build). The rest of `library.json` is still read, so a
/// stray value never resets the library. Missing fields are covered by
/// `#[serde(default)]` on the field itself.
fn or_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned + Default,
{
    let raw = serde_json::Value::deserialize(deserializer)?;
    Ok(T::deserialize(&raw).unwrap_or_else(|err| {
        eprintln!("library: ignoring setting value {raw}: {err}");
        T::default()
    }))
}

/// How the library lists books.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum View {
    #[default]
    Grid,
    List,
}

/// How the reader lays out a chapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Flow {
    #[default]
    Paginated,
    Scrolled,
}

/// Whether paginated flow shows two pages side by side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Spread {
    None,
    #[default]
    Auto,
    Always,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Light,
    Sepia,
    Dark,
}

/// UI language; `System` follows the OS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    System,
    Ja,
    En,
}

/// Which kind of LLM API the assistant talks to. `OpenAi` covers any
/// OpenAI-compatible endpoint. The JSON form (`"anthropic"`, `"openai"`) is
/// also the name the API key is stored under (see `assistant::secrets`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Anthropic,
    OpenAi,
}

impl Provider {
    pub const ALL: [Provider; 2] = [Provider::Anthropic, Provider::OpenAi];

    /// The JSON string for this provider.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
        }
    }
}

impl std::str::FromStr for Provider {
    type Err = String;

    /// Strict, unlike the lenient settings field: an unknown name is an error.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|p| p.as_str() == s)
            .ok_or_else(|| format!("unknown provider: {s}"))
    }
}

impl std::fmt::Display for Provider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default, deserialize_with = "or_default")]
    pub view: View,
    #[serde(default, deserialize_with = "or_default")]
    pub flow: Flow,
    #[serde(default, deserialize_with = "or_default")]
    pub spread: Spread,
    #[serde(default, deserialize_with = "or_default")]
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f64,
    #[serde(default, deserialize_with = "or_default")]
    pub language: Language,
    #[serde(default)]
    pub assistant: AssistantSettings,
}

/// Which LLM answers questions about the book. The API key itself is kept in
/// the OS credential store (see `assistant::secrets`), not here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AssistantSettings {
    #[serde(deserialize_with = "or_default")]
    pub provider: Provider,
    pub model: String,
    /// Empty means the provider's official endpoint.
    pub base_url: String,
}

impl Default for AssistantSettings {
    fn default() -> Self {
        Self {
            provider: Provider::default(),
            model: "claude-sonnet-5-5".into(),
            base_url: String::new(),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            view: View::default(),
            flow: Flow::default(),
            spread: Spread::default(),
            theme: Theme::default(),
            font_family: "publisher".into(),
            font_size: 18,
            line_height: 1.7,
            language: Language::default(),
            assistant: AssistantSettings::default(),
        }
    }
}

/// A highlighted passage with an optional note, stored per book in
/// `annotations/<book id>.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub cfi_range: String,
    pub text: String,
    #[serde(default)]
    pub note: String,
    pub color: String,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Where imports write their files. Obtained from [`LibraryStore::dirs`].
#[derive(Debug, Clone)]
pub struct ImportDirs {
    books_dir: PathBuf,
    covers_dir: PathBuf,
}

/// First half of an import: everything that is slow (hashing, copying,
/// parsing metadata, extracting the cover) has been done and the files are in
/// place under a fresh id. Nothing is in the library yet.
#[derive(Debug)]
pub struct PreparedImport {
    id: String,
    hash: String,
    title: String,
    author: String,
    file_name: String,
    has_cover: bool,
    book_path: PathBuf,
    cover_path: PathBuf,
}

impl ImportDirs {
    pub fn prepare(&self, source: &Path) -> Result<PreparedImport, String> {
        let is_epub = source
            .extension()
            .map(|e| e.eq_ignore_ascii_case("epub"))
            .unwrap_or(false);
        if !is_epub {
            return Err(format!("not an EPUB file: {}", source.display()));
        }

        let hash = hash_file(source)?;
        let id = uuid::Uuid::new_v4().to_string();
        let book_path = self.books_dir.join(format!("{id}.epub"));
        let cover_path = self.covers_dir.join(format!("{id}.img"));
        fs::copy(source, &book_path).map_err(|e| format!("copy failed: {e}"))?;

        let file_name = source
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "book.epub".into());
        let fallback_title = file_name
            .trim_end_matches(".epub")
            .trim_end_matches(".EPUB")
            .to_string();

        let (title, author, cover) = read_metadata(&book_path);
        let has_cover = match cover {
            Some(bytes) if !bytes.is_empty() => fs::write(&cover_path, bytes).is_ok(),
            _ => false,
        };

        Ok(PreparedImport {
            id,
            hash,
            title: title
                .filter(|t| !t.trim().is_empty())
                .unwrap_or(fallback_title),
            author: author.unwrap_or_default(),
            file_name,
            has_cover,
            book_path,
            cover_path,
        })
    }
}

impl ImportDirs {
    /// Re-runs cover extraction for a stored book (used after the selection
    /// heuristics improve). Returns whether a cover file now exists.
    pub fn extract_cover_for(&self, id: &str) -> bool {
        let book_path = self.books_dir.join(format!("{id}.epub"));
        let cover_path = self.covers_dir.join(format!("{id}.img"));
        let (_title, _author, cover) = read_metadata(&book_path);
        match cover {
            Some(bytes) if !bytes.is_empty() => fs::write(&cover_path, bytes).is_ok(),
            _ => {
                let _ = fs::remove_file(&cover_path);
                false
            }
        }
    }

    /// Like [`ImportDirs::prepare`] but for in-memory contents: the bytes are
    /// staged in a temporary file first.
    pub fn prepare_bytes(&self, file_name: &str, bytes: &[u8]) -> Result<PreparedImport, String> {
        let safe_name = Path::new(file_name)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|n| n.to_ascii_lowercase().ends_with(".epub"))
            .ok_or_else(|| format!("not an EPUB file: {file_name}"))?;
        let staging =
            std::env::temp_dir().join(format!("leafbound-import-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&staging).map_err(|e| format!("staging failed: {e}"))?;
        let tmp = staging.join(&safe_name);
        let result = fs::write(&tmp, bytes)
            .map_err(|e| format!("staging write failed: {e}"))
            .and_then(|_| self.prepare(&tmp));
        let _ = fs::remove_dir_all(&staging);
        result
    }
}

impl PreparedImport {
    /// Removes the files written by [`ImportDirs::prepare`].
    pub fn discard(self) {
        let _ = fs::remove_file(&self.book_path);
        let _ = fs::remove_file(&self.cover_path);
    }
}

/// Result of importing one file.
#[derive(Debug)]
pub enum Import {
    Added(Book),
    /// The same file (by content hash) is already in the library.
    Duplicate(Book),
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub added: Vec<Book>,
    pub duplicates: Vec<String>,
    pub failed: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub books: Vec<Book>,
    pub categories: Vec<String>,
    pub settings: Settings,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    books: Vec<Book>,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    settings: Settings,
    /// Whether files of books missing from `books` may be removed on startup.
    /// False when the library had to start over (no readable `library.json`)
    /// while book files already existed: they may belong to the lost library.
    #[serde(default = "default_true")]
    prune_orphans: bool,
}

/// How [`LibraryStore::load`] found `library.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoadStatus {
    /// Read and parsed, so its book list is authoritative.
    Loaded,
    /// Not there (first start).
    Missing,
    /// There but unreadable or unparsable; the library started empty.
    Unreadable,
}

#[derive(Debug)]
pub struct LibraryStore {
    books_dir: PathBuf,
    covers_dir: PathBuf,
    annotations_dir: PathBuf,
    file: PathBuf,
    data: Persisted,
    status: LoadStatus,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

impl LibraryStore {
    pub fn load(data_dir: PathBuf) -> io::Result<Self> {
        let books_dir = data_dir.join("books");
        let covers_dir = data_dir.join("covers");
        let annotations_dir = data_dir.join("annotations");
        fs::create_dir_all(&books_dir)?;
        fs::create_dir_all(&covers_dir)?;
        fs::create_dir_all(&annotations_dir)?;
        let file = data_dir.join("library.json");
        let (data, status) = match fs::read_to_string(&file) {
            Ok(raw) => match serde_json::from_str::<Persisted>(&raw) {
                Ok(data) => (data, LoadStatus::Loaded),
                Err(err) => {
                    log::error!("library: {} is unparsable: {err}", file.display());
                    (Persisted::default(), LoadStatus::Unreadable)
                }
            },
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                (Persisted::default(), LoadStatus::Missing)
            }
            Err(err) => {
                log::error!("library: {} is unreadable: {err}", file.display());
                (Persisted::default(), LoadStatus::Unreadable)
            }
        };
        let mut store = Self {
            books_dir,
            covers_dir,
            annotations_dir,
            file,
            data,
            status,
        };
        if status != LoadStatus::Loaded {
            // Starting over. Book files already on disk may belong to a library
            // that could not be read; keep them for good, even after this empty
            // library is saved.
            store.data.prune_orphans = store.book_files().is_empty();
        }
        store.backfill_hashes();
        Ok(store)
    }

    /// Files under `books/`, `covers/` and `annotations/` named after a book
    /// id, with that id. Anything else (other names, folders) is not ours.
    fn book_files(&self) -> Vec<(PathBuf, String)> {
        let mut out = Vec::new();
        for (dir, ext) in [
            (&self.books_dir, "epub"),
            (&self.covers_dir, "img"),
            (&self.annotations_dir, "json"),
        ] {
            let entries = match fs::read_dir(dir) {
                Ok(entries) => entries,
                Err(err) => {
                    log::warn!("library: cannot list {}: {err}", dir.display());
                    continue;
                }
            };
            for entry in entries.flatten() {
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let name = entry.file_name();
                let Some(id) = name.to_str().and_then(|n| book_file_id(n, ext)) else {
                    continue;
                };
                out.push((entry.path(), id.to_string()));
            }
        }
        out
    }

    /// Removes the files of books that are no longer in the library (left
    /// behind by a failed delete, or an import that never got committed).
    ///
    /// Does nothing unless `library.json` was read successfully: a missing or
    /// broken one says nothing about which books exist. Nor when the library
    /// is empty but `books/` holds book files (see below). Must run before any
    /// import starts, since [`ImportDirs::prepare`] writes files under an id
    /// that is only added to the library by [`LibraryStore::commit_import`].
    /// Returns the removed files; failures are logged and skipped.
    pub fn remove_orphaned_files(&mut self) -> Vec<PathBuf> {
        match self.status {
            LoadStatus::Loaded if self.data.prune_orphans => {}
            LoadStatus::Loaded => {
                log::info!("library: keeping unknown book files (the library was reset)");
                return Vec::new();
            }
            LoadStatus::Missing | LoadStatus::Unreadable => return Vec::new(),
        }
        let files = self.book_files();
        if self.data.books.is_empty() && files.iter().any(|(p, _)| p.starts_with(&self.books_dir)) {
            // An empty library next to stored books is most likely one that was
            // reset and saved before `pruneOrphans` existed: the books are only
            // hidden and can still be recovered by hand. Record that, so they
            // are kept even once new books are added.
            log::warn!("library: keeping book files of an empty library (it may have been reset)");
            self.data.prune_orphans = false;
            if let Err(err) = self.save() {
                log::error!("library: cannot save library.json: {err}");
            }
            return Vec::new();
        }
        let known: std::collections::HashSet<String> = self
            .data
            .books
            .iter()
            .map(|b| b.id.to_ascii_lowercase())
            .collect();
        let mut removed = Vec::new();
        for (path, id) in files {
            if known.contains(&id) {
                continue;
            }
            match fs::remove_file(&path) {
                Ok(()) => {
                    log::info!("library: removed orphaned file {}", path.display());
                    removed.push(path);
                }
                Err(err) => log::warn!("library: cannot remove {}: {err}", path.display()),
            }
        }
        if !removed.is_empty() {
            log::info!("library: removed {} orphaned file(s)", removed.len());
        }
        removed
    }

    /// Books imported before content hashing existed get a hash computed from
    /// their stored copy so duplicate detection covers them too.
    fn backfill_hashes(&mut self) {
        let mut changed = false;
        let paths: Vec<(usize, PathBuf)> = self
            .data
            .books
            .iter()
            .enumerate()
            .filter(|(_, b)| b.content_hash.is_none())
            .map(|(i, b)| (i, self.book_path(&b.id)))
            .collect();
        for (i, path) in paths {
            if let Ok(hash) = hash_file(&path) {
                self.data.books[i].content_hash = Some(hash);
                changed = true;
            }
        }
        if changed {
            let _ = self.save();
        }
    }

    pub fn snapshot(&self) -> Library {
        Library {
            books: self.data.books.iter().map(|b| self.with_cover(b)).collect(),
            categories: self.data.categories.clone(),
            settings: self.data.settings.clone(),
        }
    }

    pub fn book(&self, id: &str) -> Option<&Book> {
        self.data.books.iter().find(|b| b.id == id)
    }

    pub fn settings(&self) -> &Settings {
        &self.data.settings
    }

    pub fn book_path(&self, id: &str) -> PathBuf {
        self.books_dir.join(format!("{id}.epub"))
    }

    pub fn cover_path(&self, id: &str) -> PathBuf {
        self.covers_dir.join(format!("{id}.img"))
    }

    pub fn annotations_path(&self, id: &str) -> PathBuf {
        self.annotations_dir.join(format!("{id}.json"))
    }

    pub fn load_annotations(&self, id: &str) -> Result<Vec<Annotation>, String> {
        if !self.data.books.iter().any(|b| b.id == id) {
            return Err(format!("unknown book: {id}"));
        }
        match fs::read_to_string(self.annotations_path(id)) {
            Ok(raw) => {
                serde_json::from_str(&raw).map_err(|e| format!("annotations unreadable: {e}"))
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(e) => Err(format!("read failed: {e}")),
        }
    }

    pub fn save_annotations(&self, id: &str, annotations: &[Annotation]) -> Result<(), String> {
        if !self.data.books.iter().any(|b| b.id == id) {
            return Err(format!("unknown book: {id}"));
        }
        let path = self.annotations_path(id);
        if annotations.is_empty() {
            let _ = fs::remove_file(&path);
            return Ok(());
        }
        let payload = serde_json::to_string_pretty(annotations).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, payload).map_err(|e| format!("write failed: {e}"))?;
        fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {e}"))
    }

    fn with_cover(&self, book: &Book) -> Book {
        let mut out = book.clone();
        out.cover_path = if book.has_cover {
            Some(self.cover_path(&book.id).to_string_lossy().into_owned())
        } else {
            None
        };
        out
    }

    fn book_mut(&mut self, id: &str) -> Result<&mut Book, String> {
        self.data
            .books
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| format!("unknown book: {id}"))
    }

    /// Directories a [`PreparedImport`] writes into. Cloning this lets callers
    /// do the heavy work without holding the store lock.
    pub fn dirs(&self) -> ImportDirs {
        ImportDirs {
            books_dir: self.books_dir.clone(),
            covers_dir: self.covers_dir.clone(),
        }
    }

    /// Convenience for callers that do not care about lock granularity
    /// (tests, single-threaded code): prepare and commit in one go.
    pub fn import_file(&mut self, source: &Path) -> Result<Import, String> {
        let prepared = self.dirs().prepare(source)?;
        self.commit_import(prepared)
    }

    /// Second half of an import: runs under the lock but only touches the
    /// in-memory list and `library.json`. A duplicate discards the prepared
    /// files again.
    pub fn commit_import(&mut self, prepared: PreparedImport) -> Result<Import, String> {
        if let Some(existing) = self
            .data
            .books
            .iter()
            .find(|b| b.content_hash.as_deref() == Some(prepared.hash.as_str()))
        {
            let existing = self.with_cover(existing);
            prepared.discard();
            return Ok(Import::Duplicate(existing));
        }
        let book = Book {
            id: prepared.id.clone(),
            title: prepared.title,
            author: prepared.author,
            file_name: prepared.file_name,
            has_cover: prepared.has_cover,
            added_at: now(),
            last_opened_at: None,
            progress: None,
            categories: Vec::new(),
            content_hash: Some(prepared.hash),
            cover_version: 0,
            cover_path: None,
        };
        self.data.books.push(book.clone());
        self.save()?;
        Ok(Import::Added(self.with_cover(&book)))
    }

    /// Imports an EPUB from in-memory bytes (used for HTML5 drag and drop,
    /// where the webview only exposes file contents, not paths).
    pub fn import_bytes(&mut self, file_name: &str, bytes: &[u8]) -> Result<Import, String> {
        let prepared = self.dirs().prepare_bytes(file_name, bytes)?;
        self.commit_import(prepared)
    }

    /// Path of a stored book, if it is in the library. Lets callers read the
    /// file without holding the lock.
    pub fn stored_book_path(&self, id: &str) -> Result<PathBuf, String> {
        if !self.data.books.iter().any(|b| b.id == id) {
            return Err(format!("unknown book: {id}"));
        }
        Ok(self.book_path(id))
    }

    pub fn read_book(&self, id: &str) -> Result<Vec<u8>, String> {
        let path = self.stored_book_path(id)?;
        fs::read(path).map_err(|e| format!("read failed: {e}"))
    }

    /// Records the outcome of [`ImportDirs::extract_cover_for`] and bumps the
    /// cover version so stale thumbnails are replaced in the UI.
    pub fn set_cover(&mut self, id: &str, has_cover: bool) -> Result<Book, String> {
        let book = self.book_mut(id)?;
        book.has_cover = has_cover;
        book.cover_version = book.cover_version.wrapping_add(1);
        let out = book.clone();
        self.save()?;
        Ok(self.with_cover(&out))
    }

    pub fn save_progress(&mut self, id: &str, cfi: String, percent: f64) -> Result<(), String> {
        let stamp = now();
        let book = self.book_mut(id)?;
        book.progress = Some(Progress {
            cfi,
            percent: percent.clamp(0.0, 1.0),
            updated_at: stamp.clone(),
        });
        book.last_opened_at = Some(stamp);
        self.save()
    }

    pub fn set_book_categories(
        &mut self,
        id: &str,
        categories: Vec<String>,
    ) -> Result<Book, String> {
        let known = self.data.categories.clone();
        let book = self.book_mut(id)?;
        book.categories = categories
            .into_iter()
            .filter(|c| known.contains(c))
            .collect();
        let out = book.clone();
        self.save()?;
        Ok(self.with_cover(&out))
    }

    pub fn delete_book(&mut self, id: &str) -> Result<(), String> {
        self.book_mut(id)?;
        self.data.books.retain(|b| b.id != id);
        self.save()?;
        let _ = fs::remove_file(self.book_path(id));
        let _ = fs::remove_file(self.cover_path(id));
        let _ = fs::remove_file(self.annotations_path(id));
        Ok(())
    }

    pub fn add_category(&mut self, name: &str) -> Result<Vec<String>, String> {
        let clean = name.trim();
        if !clean.is_empty() && !self.data.categories.iter().any(|c| c == clean) {
            self.data.categories.push(clean.to_string());
            self.save()?;
        }
        Ok(self.data.categories.clone())
    }

    pub fn rename_category(&mut self, from: &str, to: &str) -> Result<Library, String> {
        let clean = to.trim();
        let exists = self.data.categories.iter().any(|c| c == clean);
        if let Some(idx) = self.data.categories.iter().position(|c| c == from) {
            if !clean.is_empty() && !exists {
                self.data.categories[idx] = clean.to_string();
                for book in &mut self.data.books {
                    for cat in &mut book.categories {
                        if cat == from {
                            *cat = clean.to_string();
                        }
                    }
                }
                self.save()?;
            }
        }
        Ok(self.snapshot())
    }

    pub fn remove_category(&mut self, name: &str) -> Result<Library, String> {
        self.data.categories.retain(|c| c != name);
        for book in &mut self.data.books {
            book.categories.retain(|c| c != name);
        }
        self.save()?;
        Ok(self.snapshot())
    }

    pub fn save_settings(&mut self, settings: Settings) -> Result<Settings, String> {
        self.data.settings = settings;
        self.save()?;
        Ok(self.data.settings.clone())
    }

    fn save(&mut self) -> Result<(), String> {
        self.data.version = 1;
        let payload = serde_json::to_string_pretty(&self.data).map_err(|e| e.to_string())?;
        let tmp = self.file.with_extension("json.tmp");
        fs::write(&tmp, payload).map_err(|e| format!("write failed: {e}"))?;
        fs::rename(&tmp, &self.file).map_err(|e| format!("rename failed: {e}"))
    }
}

/// Best-effort metadata extraction. Any failure falls back to filename-based defaults.
fn read_metadata(path: &Path) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
    match epub::doc::EpubDoc::new(path) {
        Ok(mut doc) => {
            let title = doc.mdata("title").map(|m| m.value.clone());
            let author = doc.mdata("creator").map(|m| m.value.clone());
            let cover = crate::cover::extract_cover(&mut doc);
            (title, author, cover)
        }
        Err(_) => (None, None, None),
    }
}

/// The book id in a stored file name such as `<id>.epub`, matching how
/// [`LibraryStore::book_path`] and friends name them: the id is a UUID in its
/// lowercase hyphenated form and the extension is exactly `ext`. Any other
/// name (temporary files, other casings, things a user put there) is `None`.
fn book_file_id<'a>(name: &'a str, ext: &str) -> Option<&'a str> {
    let id = name.strip_suffix(ext)?.strip_suffix('.')?;
    let uuid = uuid::Uuid::parse_str(id).ok()?;
    (uuid.hyphenated().to_string() == id).then_some(id)
}

fn hash_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = fs::read(path).map_err(|e| format!("read failed: {e}"))?;
    let digest = Sha256::digest(&bytes);
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json<T: Serialize>(value: T) -> String {
        serde_json::to_string(&value).unwrap()
    }

    #[test]
    fn setting_enums_keep_the_strings_library_json_always_used() {
        assert_eq!(json(View::Grid), r#""grid""#);
        assert_eq!(json(View::List), r#""list""#);
        assert_eq!(json(Flow::Paginated), r#""paginated""#);
        assert_eq!(json(Flow::Scrolled), r#""scrolled""#);
        assert_eq!(json(Spread::None), r#""none""#);
        assert_eq!(json(Spread::Auto), r#""auto""#);
        assert_eq!(json(Spread::Always), r#""always""#);
        assert_eq!(json(Theme::Light), r#""light""#);
        assert_eq!(json(Theme::Sepia), r#""sepia""#);
        assert_eq!(json(Theme::Dark), r#""dark""#);
        assert_eq!(json(Language::System), r#""system""#);
        assert_eq!(json(Language::Ja), r#""ja""#);
        assert_eq!(json(Language::En), r#""en""#);
        assert_eq!(json(Provider::Anthropic), r#""anthropic""#);
        assert_eq!(json(Provider::OpenAi), r#""openai""#);
    }

    #[test]
    fn defaults_match_the_previous_string_defaults() {
        let settings = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(settings["view"], "grid");
        assert_eq!(settings["flow"], "paginated");
        assert_eq!(settings["spread"], "auto");
        assert_eq!(settings["theme"], "light");
        assert_eq!(settings["language"], "system");
        assert_eq!(settings["assistant"]["provider"], "anthropic");
    }

    #[test]
    fn provider_parses_strictly_and_round_trips() {
        for provider in Provider::ALL {
            assert_eq!(provider.as_str().parse::<Provider>(), Ok(provider));
            assert_eq!(json(provider), format!("\"{provider}\""));
        }
        assert!("unknown".parse::<Provider>().is_err());
        // Command arguments stay strict: only the settings field is lenient.
        assert!(serde_json::from_str::<Provider>(r#""unknown""#).is_err());
    }

    #[test]
    fn unknown_or_non_string_setting_values_become_defaults() {
        let settings: Settings = serde_json::from_str(
            r#"{"view":"tiles","flow":7,"spread":null,"theme":"purple",
                "fontFamily":"serif","fontSize":20,"lineHeight":1.5,
                "language":["ja"],"assistant":{"provider":"unknown"}}"#,
        )
        .unwrap();
        assert_eq!(settings.view, View::Grid);
        assert_eq!(settings.flow, Flow::Paginated);
        assert_eq!(settings.spread, Spread::Auto);
        assert_eq!(settings.theme, Theme::Light);
        assert_eq!(settings.language, Language::System);
        assert_eq!(settings.assistant.provider, Provider::Anthropic);
        assert_eq!(settings.font_family, "serif");
    }
}
