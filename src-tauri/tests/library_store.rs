use std::fs;
use std::path::PathBuf;

use leafbound_lib::library::{Import, LibraryStore, Settings};

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
    assert!(book.content_hash.as_deref().map(|h| h.len() == 64).unwrap_or(false));
    assert!(book.cover_path.as_deref().map(|p| PathBuf::from(p).exists()).unwrap_or(false));
    assert!(store.book_path(&book.id).exists());

    let bytes = store.read_book(&book.id).unwrap();
    assert_eq!(bytes, fs::read(fixture()).unwrap());

    // Library persists and reloads.
    let reloaded = LibraryStore::load(dir.clone()).unwrap().snapshot();
    assert_eq!(reloaded.books.len(), 1);
    assert_eq!(reloaded.books[0].id, book.id);
    assert!(reloaded.books[0].cover_path.is_some());
    assert_eq!(reloaded.settings.spread, "auto");
    assert_eq!(reloaded.settings.language, "system");

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
    assert!(matches!(store.import_file(&other).unwrap(), Import::Added(_)));
    assert_eq!(store.snapshot().books.len(), 2);

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

    store.save_progress(&book.id, "epubcfi(/6/4!/4/2/1:0)".into(), 0.42).unwrap();
    let snap = store.snapshot();
    let p = snap.books[0].progress.as_ref().unwrap();
    assert_eq!(p.cfi, "epubcfi(/6/4!/4/2/1:0)");
    assert!((p.percent - 0.42).abs() < 1e-9);
    assert!(snap.books[0].last_opened_at.is_some());

    // Percent is clamped.
    store.save_progress(&book.id, "x".into(), 7.0).unwrap();
    assert_eq!(store.snapshot().books[0].progress.as_ref().unwrap().percent, 1.0);

    // Categories: unknown names are dropped, rename cascades, remove cascades.
    assert_eq!(store.add_category("  SF ").unwrap(), vec!["SF".to_string()]);
    store.add_category("SF").unwrap();
    store.add_category("").unwrap();
    assert_eq!(store.snapshot().categories, vec!["SF".to_string()]);

    let updated = store.set_book_categories(&book.id, vec!["SF".into(), "ghost".into()]).unwrap();
    assert_eq!(updated.categories, vec!["SF".to_string()]);

    let lib = store.rename_category("SF", "Science Fiction").unwrap();
    assert_eq!(lib.categories, vec!["Science Fiction".to_string()]);
    assert_eq!(lib.books[0].categories, vec!["Science Fiction".to_string()]);

    let lib = store.remove_category("Science Fiction").unwrap();
    assert!(lib.categories.is_empty());
    assert!(lib.books[0].categories.is_empty());

    // Settings round-trip.
    let settings = Settings {
        view: "list".into(),
        flow: "scrolled".into(),
        spread: "always".into(),
        theme: "dark".into(),
        font_family: "serif".into(),
        font_size: 22,
        line_height: 2.0,
        language: "en".into(),
    };
    store.save_settings(settings).unwrap();
    let reloaded = LibraryStore::load(dir.clone()).unwrap().snapshot();
    assert_eq!(reloaded.settings.view, "list");
    assert_eq!(reloaded.settings.spread, "always");
    assert_eq!(reloaded.settings.language, "en");
    assert_eq!(reloaded.settings.font_size, 22);

    // Delete removes files and entry.
    let path = store.book_path(&book.id);
    store.delete_book(&book.id).unwrap();
    assert!(!path.exists());
    assert!(store.snapshot().books.is_empty());
    assert!(store.delete_book(&book.id).is_err());

    fs::remove_dir_all(dir).ok();
}
