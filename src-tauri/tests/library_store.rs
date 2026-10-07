use std::fs;
use std::path::PathBuf;

use leafbound_lib::library::{Annotation, Import, LibraryStore, Settings};

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
    store.save_annotations(&book.id, &[note.clone()]).unwrap();
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
    assert!(book.has_cover, "scan without cover metadata should still get a cover");

    // The cover must be page 1's image, even though page 2's image is larger.
    let cover = fs::read(store.cover_path(&book.id)).unwrap();
    let file = fs::File::open(&scanned).unwrap();
    let mut zip = zip::ZipArchive::new(file).unwrap();
    let mut page1 = Vec::new();
    zip.by_name("OEBPS/images/page001.png").unwrap().read_to_end(&mut page1).unwrap();
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
    assert!(matches!(store.import_bytes("again.epub", &bytes).unwrap(), Import::Duplicate(_)));
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
