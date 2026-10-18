use std::fs;
use std::path::PathBuf;

use leafbound_lib::library::{
    Annotation, AssistantSettings, Flow, Import, Language, LibraryStore, Provider, Settings,
    Spread, Theme, View,
};

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sample.epub")
}

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("leafbound-test-{tag}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn added(import: Import) -> leafbound_lib::library::Book {
    match import {
        Import::Added(b) => b,
        Import::Duplicate(b) => panic!("unexpected duplicate of {}", b.title),
    }
}

#[test]
fn imports_epub_with_metadata_and_cover() {
    let dir = temp_dir("import");
    let mut store = LibraryStore::load(dir.clone()).unwrap();

    let book = added(store.import_file(&fixture()).unwrap());
    assert_eq!(book.title, "Leafbound サンプル");
    assert_eq!(book.author, "Leafbound Contributors");
    assert!(book.has_cover);
    assert!(book
        .content_hash
        .as_deref()
        .map(|h| h.len() == 64)
        .unwrap_or(false));
    assert!(book
        .cover_path
        .as_deref()
        .map(|p| PathBuf::from(p).exists())
        .unwrap_or(false));
    assert!(store.book_path(&book.id).exists());

    let bytes = store.read_book(&book.id).unwrap();
    assert_eq!(bytes, fs::read(fixture()).unwrap());

    // Library persists and reloads.
    let reloaded = LibraryStore::load(dir.clone()).unwrap().snapshot();
    assert_eq!(reloaded.books.len(), 1);
    assert_eq!(reloaded.books[0].id, book.id);
    assert!(reloaded.books[0].cover_path.is_some());
    assert_eq!(reloaded.settings.spread, Spread::Auto);
    assert_eq!(reloaded.settings.language, Language::System);

    fs::remove_dir_all(dir).ok();
}

#[test]
fn detects_duplicate_imports_by_content() {
    let dir = temp_dir("dup");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let first = added(store.import_file(&fixture()).unwrap());

    // Same content under a different file name is still a duplicate.
    let copy = dir.join("renamed copy.epub");
    fs::copy(fixture(), &copy).unwrap();
    match store.import_file(&copy).unwrap() {
        Import::Duplicate(existing) => assert_eq!(existing.id, first.id),
        Import::Added(_) => panic!("duplicate was imported"),
    }
    assert_eq!(store.snapshot().books.len(), 1);

    // Different content is a new book.
    let other = dir.join("other.epub");
    let mut bytes = fs::read(fixture()).unwrap();
    bytes.push(0);
    fs::write(&other, bytes).unwrap();
    assert!(matches!(
        store.import_file(&other).unwrap(),
        Import::Added(_)
    ));
    assert_eq!(store.snapshot().books.len(), 2);

    fs::remove_dir_all(dir).ok();
}

#[test]
fn stores_annotations_per_book() {
    let dir = temp_dir("notes");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let book = added(store.import_file(&fixture()).unwrap());

    assert!(store.load_annotations(&book.id).unwrap().is_empty());
    assert!(store.load_annotations("nope").is_err());

    let note = Annotation {
        id: "a1".into(),
        cfi_range: "epubcfi(/6/4!/4/2,/1:0,/1:10)".into(),
        text: "吾輩は猫である".into(),
        note: "冒頭".into(),
        color: "yellow".into(),
        created_at: "2026-10-07T00:00:00Z".into(),
        updated_at: "2026-10-07T00:00:00Z".into(),
    };
    store
        .save_annotations(&book.id, std::slice::from_ref(&note))
        .unwrap();
    assert!(store.annotations_path(&book.id).exists());

    let reloaded = LibraryStore::load(dir.clone()).unwrap();
    let list = reloaded.load_annotations(&book.id).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "a1");
    assert_eq!(list[0].note, "冒頭");

    // Saving an empty list removes the file; deleting the book removes it too.
    store.save_annotations(&book.id, &[]).unwrap();
    assert!(!store.annotations_path(&book.id).exists());
    store.save_annotations(&book.id, &[note]).unwrap();
    let path = store.annotations_path(&book.id);
    store.delete_book(&book.id).unwrap();
    assert!(!path.exists());

    fs::remove_dir_all(dir).ok();
}

#[test]
fn scanned_book_uses_first_page_as_cover() {
    use std::io::Read;

    let dir = temp_dir("scan");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let scanned = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scanned.epub");
    let book = added(store.import_file(&scanned).unwrap());
    assert_eq!(book.title, "スキャン本");
    assert!(
        book.has_cover,
        "scan without cover metadata should still get a cover"
    );

    // The cover must be page 1's image, even though page 2's image is larger.
    let cover = fs::read(store.cover_path(&book.id)).unwrap();
    let file = fs::File::open(&scanned).unwrap();
    let mut zip = zip::ZipArchive::new(file).unwrap();
    let mut page1 = Vec::new();
    zip.by_name("OEBPS/images/page001.png")
        .unwrap()
        .read_to_end(&mut page1)
        .unwrap();
    assert_eq!(cover, page1);

    // Refreshing re-extracts and bumps the version so the UI reloads the image.
    let dirs = store.dirs();
    assert!(dirs.extract_cover_for(&book.id));
    let refreshed = store.set_cover(&book.id, true).unwrap();
    assert_eq!(refreshed.cover_version, 1);
    assert!(refreshed.has_cover);

    fs::remove_dir_all(dir).ok();
}

#[test]
fn imports_from_bytes() {
    let dir = temp_dir("bytes");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let bytes = fs::read(fixture()).unwrap();

    let book = added(store.import_bytes("Dropped Book.epub", &bytes).unwrap());
    assert_eq!(book.file_name, "Dropped Book.epub");
    assert_eq!(book.title, "Leafbound サンプル");
    assert!(store.book_path(&book.id).exists());

    // Same bytes again are a duplicate; wrong extension is rejected.
    assert!(matches!(
        store.import_bytes("again.epub", &bytes).unwrap(),
        Import::Duplicate(_)
    ));
    assert!(store.import_bytes("notes.txt", &bytes).is_err());
    assert_eq!(store.snapshot().books.len(), 1);

    fs::remove_dir_all(dir).ok();
}

#[test]
fn rejects_non_epub_files() {
    let dir = temp_dir("reject");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let bogus = dir.join("notes.txt");
    fs::write(&bogus, "hello").unwrap();
    assert!(store.import_file(&bogus).is_err());
    assert!(store.snapshot().books.is_empty());
    fs::remove_dir_all(dir).ok();
}

#[test]
fn tracks_progress_categories_and_settings() {
    let dir = temp_dir("state");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let book = added(store.import_file(&fixture()).unwrap());

    store
        .save_progress(&book.id, "epubcfi(/6/4!/4/2/1:0)".into(), 0.42)
        .unwrap();
    let snap = store.snapshot();
    let p = snap.books[0].progress.as_ref().unwrap();
    assert_eq!(p.cfi, "epubcfi(/6/4!/4/2/1:0)");
    assert!((p.percent - 0.42).abs() < 1e-9);
    assert!(snap.books[0].last_opened_at.is_some());

    // Percent is clamped.
    store.save_progress(&book.id, "x".into(), 7.0).unwrap();
    assert_eq!(
        store.snapshot().books[0].progress.as_ref().unwrap().percent,
        1.0
    );

    // Categories: unknown names are dropped, rename cascades, remove cascades.
    assert_eq!(store.add_category("  SF ").unwrap(), vec!["SF".to_string()]);
    store.add_category("SF").unwrap();
    store.add_category("").unwrap();
    assert_eq!(store.snapshot().categories, vec!["SF".to_string()]);

    let updated = store
        .set_book_categories(&book.id, vec!["SF".into(), "ghost".into()])
        .unwrap();
    assert_eq!(updated.categories, vec!["SF".to_string()]);

    let lib = store.rename_category("SF", "Science Fiction").unwrap();
    assert_eq!(lib.categories, vec!["Science Fiction".to_string()]);
    assert_eq!(lib.books[0].categories, vec!["Science Fiction".to_string()]);

    let lib = store.remove_category("Science Fiction").unwrap();
    assert!(lib.categories.is_empty());
    assert!(lib.books[0].categories.is_empty());

    // Settings round-trip.
    let settings = Settings {
        view: View::List,
        flow: Flow::Scrolled,
        spread: Spread::Always,
        theme: Theme::Dark,
        font_family: "serif".into(),
        font_size: 22,
        line_height: 2.0,
        language: Language::En,
        assistant: AssistantSettings {
            provider: Provider::OpenAi,
            model: "llama3".into(),
            base_url: "http://localhost:11434/v1".into(),
        },
    };
    store.save_settings(settings).unwrap();
    let reloaded = LibraryStore::load(dir.clone()).unwrap().snapshot();
    assert_eq!(reloaded.settings.view, View::List);
    assert_eq!(reloaded.settings.assistant.provider, Provider::OpenAi);
    assert_eq!(
        reloaded.settings.assistant.base_url,
        "http://localhost:11434/v1"
    );
    assert_eq!(reloaded.settings.spread, Spread::Always);
    assert_eq!(reloaded.settings.language, Language::En);
    assert_eq!(reloaded.settings.font_size, 22);

    // Delete removes files and entry.
    let path = store.book_path(&book.id);
    store.delete_book(&book.id).unwrap();
    assert!(!path.exists());
    assert!(store.snapshot().books.is_empty());
    assert!(store.delete_book(&book.id).is_err());

    fs::remove_dir_all(dir).ok();
}

/// Puts files named like book files (`<id>.epub`, `.img`, `.json`) for `id`.
fn plant_book_files(store: &LibraryStore, id: &str) -> Vec<PathBuf> {
    let paths = vec![
        store.book_path(id),
        store.cover_path(id),
        store.annotations_path(id),
    ];
    for path in &paths {
        fs::write(path, "left behind").unwrap();
    }
    paths
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[test]
fn removes_files_of_unknown_books_and_keeps_the_rest() {
    let dir = temp_dir("orphans");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    // A first start has nothing to clean up.
    assert!(store.remove_orphaned_files().is_empty());
    let book = added(store.import_file(&fixture()).unwrap());
    let note = Annotation {
        id: "a1".into(),
        cfi_range: "epubcfi(/6/4!/4/2,/1:0,/1:10)".into(),
        text: "text".into(),
        note: String::new(),
        color: "yellow".into(),
        created_at: "2026-10-18T00:00:00Z".into(),
        updated_at: "2026-10-18T00:00:00Z".into(),
    };
    store.save_annotations(&book.id, &[note]).unwrap();
    let kept_book_files = [
        store.book_path(&book.id),
        store.cover_path(&book.id),
        store.annotations_path(&book.id),
    ];

    let orphan = new_id();
    let orphans = plant_book_files(&store, &orphan);

    // Names that do not follow the book file naming are never ours to remove.
    // Each uses its own id: Windows file names are case-insensitive.
    let books = dir.join("books");
    let foreign = [
        books.join("notes.txt"),
        books.join("my book.epub"),
        books.join(format!("{}.epub", new_id().to_uppercase())),
        books.join(format!("{}.epub", new_id().replace('-', ""))),
        books.join(format!("{}.EPUB", new_id())),
        books.join(format!("{}.epub.part", new_id())),
        books.join(format!("{}.img", new_id())),
        dir.join("covers").join(format!("{}.png", new_id())),
        dir.join("annotations")
            .join(format!("{}.json.tmp", new_id())),
    ];
    for path in &foreign {
        fs::write(path, "not ours").unwrap();
    }
    let folder = books.join(format!("{}.epub", new_id()));
    fs::create_dir_all(folder.join("inside")).unwrap();
    drop(store);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    let mut removed = store.remove_orphaned_files();
    removed.sort();
    let mut expected = orphans.clone();
    expected.sort();
    assert_eq!(removed, expected);
    for path in &orphans {
        assert!(!path.exists(), "{} should be removed", path.display());
    }
    for path in kept_book_files.iter().chain(&foreign) {
        assert!(path.exists(), "{} should be kept", path.display());
    }
    assert!(folder.join("inside").is_dir());

    // The known book is intact.
    assert_eq!(
        store.read_book(&book.id).unwrap(),
        fs::read(fixture()).unwrap()
    );
    assert_eq!(store.load_annotations(&book.id).unwrap().len(), 1);
    assert!(store.remove_orphaned_files().is_empty());

    fs::remove_dir_all(dir).ok();
}

/// A library that cannot be used as the list of books removes nothing, not even
/// once the library that replaced it has been saved with a book in it.
fn assert_keeps_files_after_reset(dir: PathBuf) {
    let store = LibraryStore::load(dir.clone()).unwrap();
    let id = new_id();
    let files = plant_book_files(&store, &id);
    drop(store);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert!(store.snapshot().books.is_empty());
    assert!(store.remove_orphaned_files().is_empty());
    for path in &files {
        assert!(path.exists(), "{} should be kept", path.display());
    }

    // Importing saves the new library; later starts still keep the files.
    let book = added(store.import_file(&fixture()).unwrap());
    drop(store);
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert!(store.remove_orphaned_files().is_empty());
    for path in &files {
        assert!(path.exists(), "{} should be kept", path.display());
    }
    assert!(store.book_path(&book.id).exists());

    fs::remove_dir_all(dir).ok();
}

#[test]
fn empty_library_next_to_book_files_removes_nothing() {
    let dir = temp_dir("empty");
    // A valid, saved library without books, like one that was reset and saved
    // before pruneOrphans existed.
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    store.add_category("SF").unwrap();
    let files = plant_book_files(&store, &new_id());
    drop(store);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert!(store.snapshot().books.is_empty());
    assert!(store.remove_orphaned_files().is_empty());
    for path in &files {
        assert!(path.exists(), "{} should be kept", path.display());
    }

    // Remembered: once books are added again, the files are still kept.
    added(store.import_file(&fixture()).unwrap());
    drop(store);
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert!(store.remove_orphaned_files().is_empty());
    for path in &files {
        assert!(path.exists(), "{} should be kept", path.display());
    }

    fs::remove_dir_all(dir).ok();
}

#[test]
fn empty_library_without_book_files_removes_leftovers() {
    let dir = temp_dir("empty-leftovers");
    let mut store = LibraryStore::load(dir.clone()).unwrap();
    store.add_category("SF").unwrap();
    // Only a cover and highlights are left, no book: nothing to recover.
    let id = new_id();
    let leftovers = [store.cover_path(&id), store.annotations_path(&id)];
    for path in &leftovers {
        fs::write(path, "left behind").unwrap();
    }
    drop(store);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert_eq!(store.remove_orphaned_files().len(), 2);
    for path in &leftovers {
        assert!(!path.exists(), "{} should be removed", path.display());
    }

    fs::remove_dir_all(dir).ok();
}

#[test]
fn unparsable_library_removes_nothing() {
    let dir = temp_dir("broken");
    // Make the directories, then break library.json.
    drop(LibraryStore::load(dir.clone()).unwrap());
    fs::write(dir.join("library.json"), "{ \"books\": [ not json").unwrap();
    assert_keeps_files_after_reset(dir);
}

#[test]
fn unreadable_library_removes_nothing() {
    let dir = temp_dir("unreadable");
    drop(LibraryStore::load(dir.clone()).unwrap());
    // Reading a directory fails with an error other than "not found".
    fs::create_dir_all(dir.join("library.json")).unwrap();
    let store = LibraryStore::load(dir.clone()).unwrap();
    let files = plant_book_files(&store, &new_id());
    drop(store);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert!(store.remove_orphaned_files().is_empty());
    for path in &files {
        assert!(path.exists(), "{} should be kept", path.display());
    }
    fs::remove_dir_all(dir).ok();
}

#[test]
fn missing_library_removes_nothing() {
    let dir = temp_dir("missing");
    assert_keeps_files_after_reset(dir);
}

/// Writes a `library.json` holding `settings` (and nothing else) into `dir`.
fn write_library_with_settings(dir: &std::path::Path, settings: &serde_json::Value) {
    let payload = serde_json::json!({
        "version": 1,
        "books": [],
        "categories": ["SF"],
        "settings": settings,
    });
    fs::write(
        dir.join("library.json"),
        serde_json::to_string_pretty(&payload).unwrap(),
    )
    .unwrap();
}

#[test]
fn unknown_setting_values_fall_back_to_defaults() {
    let dir = temp_dir("settings-unknown");
    write_library_with_settings(
        &dir,
        &serde_json::json!({
            "view": "tiles",
            "flow": "vertical",
            "spread": "double",
            "theme": "purple",
            "fontFamily": "serif",
            "fontSize": 20,
            "lineHeight": 1.5,
            "language": "fr",
            "assistant": { "provider": "unknown", "model": "m", "baseUrl": "" },
        }),
    );
    let snap = LibraryStore::load(dir.clone()).unwrap().snapshot();
    // The rest of the file was still read: the library did not start over.
    assert_eq!(snap.categories, vec!["SF".to_string()]);

    let settings = serde_json::to_value(&snap.settings).unwrap();
    assert_eq!(settings["view"], "grid");
    assert_eq!(settings["flow"], "paginated");
    assert_eq!(settings["spread"], "auto");
    assert_eq!(settings["theme"], "light");
    assert_eq!(settings["language"], "system");
    assert_eq!(settings["assistant"]["provider"], "anthropic");
    // Free-form fields next to them are untouched.
    assert_eq!(settings["fontFamily"], "serif");
    assert_eq!(settings["fontSize"], 20);
    assert_eq!(settings["assistant"]["model"], "m");
    fs::remove_dir_all(dir).ok();
}

#[test]
fn missing_setting_values_fall_back_to_defaults() {
    let dir = temp_dir("settings-missing");
    write_library_with_settings(
        &dir,
        &serde_json::json!({
            "fontFamily": "serif",
            "fontSize": 20,
            "lineHeight": 1.5,
        }),
    );
    let snap = LibraryStore::load(dir.clone()).unwrap().snapshot();
    assert_eq!(snap.categories, vec!["SF".to_string()]);
    let settings = serde_json::to_value(&snap.settings).unwrap();
    assert_eq!(settings["view"], "grid");
    assert_eq!(settings["flow"], "paginated");
    assert_eq!(settings["theme"], "light");
    assert_eq!(settings["fontFamily"], "serif");
    fs::remove_dir_all(dir).ok();
}

#[test]
fn known_setting_values_survive_a_round_trip_unchanged() {
    let dir = temp_dir("settings-roundtrip");
    let original = serde_json::json!({
        "view": "list",
        "flow": "scrolled",
        "spread": "always",
        "theme": "sepia",
        "fontFamily": "serif",
        "fontSize": 22,
        "lineHeight": 2.0,
        "language": "ja",
        "assistant": {
            "provider": "openai",
            "model": "llama3",
            "baseUrl": "http://localhost:11434/v1",
        },
    });
    write_library_with_settings(&dir, &original);

    let mut store = LibraryStore::load(dir.clone()).unwrap();
    assert_eq!(serde_json::to_value(store.settings()).unwrap(), original);

    // Saving writes exactly the strings that were read.
    let settings = store.settings().clone();
    store.save_settings(settings).unwrap();
    let saved: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.join("library.json")).unwrap()).unwrap();
    assert_eq!(saved["settings"], original);
    fs::remove_dir_all(dir).ok();
}
