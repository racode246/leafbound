use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

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
    /// Absolute path of the cached cover image, resolved at read time.
    #[serde(default, skip_deserializing)]
    pub cover_path: Option<String>,
}

fn default_spread() -> String {
    "auto".into()
}

fn default_language() -> String {
    "system".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub view: String,
    pub flow: String,
    #[serde(default = "default_spread")]
    pub spread: String,
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f64,
    /// "system" | "ja" | "en"
    #[serde(default = "default_language")]
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            view: "grid".into(),
            flow: "paginated".into(),
            spread: default_spread(),
            theme: "light".into(),
            font_family: "publisher".into(),
            font_size: 18,
            line_height: 1.7,
            language: default_language(),
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
}

#[derive(Debug)]
pub struct LibraryStore {
    books_dir: PathBuf,
    covers_dir: PathBuf,
    annotations_dir: PathBuf,
    file: PathBuf,
    data: Persisted,
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
        let data = match fs::read_to_string(&file) {
            Ok(raw) => serde_json::from_str::<Persisted>(&raw).unwrap_or_default(),
            Err(_) => Persisted::default(),
        };
        let mut store = Self { books_dir, covers_dir, annotations_dir, file, data };
        store.backfill_hashes();
        Ok(store)
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
            Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("annotations unreadable: {e}")),
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

    pub fn import_file(&mut self, source: &Path) -> Result<Import, String> {
        let is_epub = source
            .extension()
            .map(|e| e.eq_ignore_ascii_case("epub"))
            .unwrap_or(false);
        if !is_epub {
            return Err(format!("not an EPUB file: {}", source.display()));
        }

        let hash = hash_file(source)?;
        if let Some(existing) = self
            .data
            .books
            .iter()
            .find(|b| b.content_hash.as_deref() == Some(hash.as_str()))
        {
            return Ok(Import::Duplicate(self.with_cover(existing)));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let target = self.book_path(&id);
        fs::copy(source, &target).map_err(|e| format!("copy failed: {e}"))?;

        let file_name = source
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "book.epub".into());
        let fallback_title = file_name.trim_end_matches(".epub").trim_end_matches(".EPUB").to_string();

        let (title, author, cover) = read_metadata(&target);
        let has_cover = match cover {
            Some(bytes) if !bytes.is_empty() => {
                fs::write(self.cover_path(&id), bytes).is_ok()
            }
            _ => false,
        };

        let book = Book {
            id: id.clone(),
            title: title.filter(|t| !t.trim().is_empty()).unwrap_or(fallback_title),
            author: author.unwrap_or_default(),
            file_name,
            has_cover,
            added_at: now(),
            last_opened_at: None,
            progress: None,
            categories: Vec::new(),
            content_hash: Some(hash),
            cover_path: None,
        };
        self.data.books.push(book.clone());
        self.save()?;
        Ok(Import::Added(self.with_cover(&book)))
    }

    pub fn read_book(&self, id: &str) -> Result<Vec<u8>, String> {
        if !self.data.books.iter().any(|b| b.id == id) {
            return Err(format!("unknown book: {id}"));
        }
        fs::read(self.book_path(id)).map_err(|e| format!("read failed: {e}"))
    }

    pub fn save_progress(&mut self, id: &str, cfi: String, percent: f64) -> Result<(), String> {
        let stamp = now();
        let book = self.book_mut(id)?;
        book.progress = Some(Progress { cfi, percent: percent.clamp(0.0, 1.0), updated_at: stamp.clone() });
        book.last_opened_at = Some(stamp);
        self.save()
    }

    pub fn set_book_categories(&mut self, id: &str, categories: Vec<String>) -> Result<Book, String> {
        let known = self.data.categories.clone();
        let book = self.book_mut(id)?;
        book.categories = categories.into_iter().filter(|c| known.contains(c)).collect();
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

fn hash_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = fs::read(path).map_err(|e| format!("read failed: {e}"))?;
    let digest = Sha256::digest(&bytes);
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}
