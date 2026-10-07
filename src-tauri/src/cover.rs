//! Cover image selection.
//!
//! The `epub` crate only honours the `cover-image` property (EPUB 3) or
//! `<meta name="cover">` (EPUB 2). Real-world books are messier: the tagged
//! cover may be a thumbnail, the meta entry may point at the cover *page*
//! rather than an image, and scanned books have no metadata at all and just
//! start with a full-page image.
//!
//! Candidates are therefore gathered in priority order and the first one that
//! is at least [`MIN_COVER_AREA`] pixels wins. Only if every candidate is tiny
//! do we fall back to the largest of them. Body pages are never considered
//! beyond the very first spine document, so scans do not end up showing an
//! interior page as the thumbnail.

use std::collections::HashSet;
use std::fs::File;
use std::io::BufReader;
use std::path::{Component, Path, PathBuf};

use epub::doc::EpubDoc;

type Doc = EpubDoc<BufReader<File>>;

/// Anything smaller than this (300x300) is treated as a thumbnail and only
/// used when nothing better exists.
const MIN_COVER_AREA: u64 = 300 * 300;

pub fn extract_cover(doc: &mut Doc) -> Option<Vec<u8>> {
    let mut candidates: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut push = |id: String, candidates: &mut Vec<String>| {
        if seen.insert(id.clone()) {
            candidates.push(id);
        }
    };

    // 1. Explicit cover (EPUB 3 `cover-image` property, or EPUB 2 meta).
    if let Some(id) = doc.get_cover_id() {
        push(id, &mut candidates);
    }

    // 2. `<meta name="cover">` may name an image or the cover page itself.
    if let Some(id) = doc.mdata("cover").map(|m| m.value.clone()) {
        if is_image(doc, &id) {
            push(id, &mut candidates);
        } else if is_xhtml(doc, &id) {
            for id in images_in_document(doc, &id) {
                push(id, &mut candidates);
            }
        }
    }

    // 3. Image resources that are called "cover" (sorted for determinism).
    let mut by_name: Vec<String> = doc
        .resources
        .iter()
        .filter(|(id, r)| {
            r.mime.starts_with("image/")
                && (id.to_ascii_lowercase().contains("cover")
                    || r.path.to_string_lossy().to_ascii_lowercase().contains("cover"))
        })
        .map(|(id, _)| id.clone())
        .collect();
    by_name.sort();
    for id in by_name {
        push(id, &mut candidates);
    }

    // 4. The first image on the first spine page (scanned books, untagged covers).
    if let Some(first) = doc.spine.first().map(|s| s.idref.clone()) {
        if let Some(id) = images_in_document(doc, &first).into_iter().next() {
            push(id, &mut candidates);
        }
    }

    let mut fallback: Option<(u64, Vec<u8>)> = None;
    for id in candidates {
        if !is_image(doc, &id) {
            continue;
        }
        let Some((bytes, _mime)) = doc.get_resource(&id) else {
            continue;
        };
        if bytes.is_empty() {
            continue;
        }
        let area = imagesize::blob_size(&bytes)
            .map(|s| s.width as u64 * s.height as u64)
            .unwrap_or(0);
        if area >= MIN_COVER_AREA {
            return Some(bytes);
        }
        if fallback.as_ref().map(|(a, _)| area > *a).unwrap_or(true) {
            fallback = Some((area, bytes));
        }
    }
    fallback.map(|(_, bytes)| bytes)
}

fn is_image(doc: &Doc, id: &str) -> bool {
    doc.resources
        .get(id)
        .map(|r| r.mime.starts_with("image/"))
        .unwrap_or(false)
}

fn is_xhtml(doc: &Doc, id: &str) -> bool {
    doc.resources
        .get(id)
        .map(|r| r.mime.contains("xhtml") || r.mime.contains("html"))
        .unwrap_or(false)
}

/// Resource ids of the images referenced by an XHTML resource, in document order.
fn images_in_document(doc: &mut Doc, id: &str) -> Vec<String> {
    let Some(page_path) = doc.resources.get(id).map(|r| r.path.clone()) else {
        return Vec::new();
    };
    let Some((content, _mime)) = doc.get_resource_str(id) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for reference in image_references(&content) {
        let resolved = resolve(&page_path, &reference);
        if let Some(id) = resource_id_for_path(doc, &resolved) {
            if !out.contains(&id) {
                out.push(id);
            }
        }
    }
    out
}

/// Pulls `src`/`href`/`xlink:href` values out of `<img>` and `<image>` tags.
fn image_references(html: &str) -> Vec<String> {
    let mut found: Vec<(usize, String)> = Vec::new();
    let lower = html.to_ascii_lowercase();
    for tag in ["<img", "<image"] {
        let mut from = 0;
        while let Some(pos) = lower[from..].find(tag) {
            let start = from + pos;
            let end = lower[start..].find('>').map(|e| start + e).unwrap_or(lower.len());
            let slice = &html[start..end];
            for attr in ["xlink:href=", "src=", "href="] {
                if let Some(v) = attr_value(slice, attr) {
                    if !v.is_empty() && !v.starts_with("data:") {
                        found.push((start, v));
                    }
                    break;
                }
            }
            from = end;
        }
    }
    found.sort_by_key(|(pos, _)| *pos);
    found.into_iter().map(|(_, v)| v).collect()
}

fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let idx = lower.find(attr)?;
    let rest = &tag[idx + attr.len()..];
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &rest[1..];
    let end = inner.find(quote)?;
    Some(percent_decode(&inner[..end]))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// Resolves `reference` (as written in `page`) against the page's directory,
/// collapsing `.` and `..` segments.
fn resolve(page: &Path, reference: &str) -> PathBuf {
    let reference = reference.split(['#', '?']).next().unwrap_or("");
    let base = page.parent().unwrap_or(Path::new(""));
    let mut parts: Vec<String> = base
        .components()
        .filter_map(|c| match c {
            Component::Normal(p) => Some(p.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    for seg in reference.split(['/', '\\']) {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s.to_string()),
        }
    }
    parts.iter().collect()
}

fn resource_id_for_path(doc: &Doc, wanted: &Path) -> Option<String> {
    let norm = |p: &Path| p.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
    let wanted = norm(wanted);
    doc.resources
        .iter()
        .find(|(_, r)| norm(&r.path) == wanted)
        .map(|(id, _)| id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_image_references_in_document_order() {
        let html = r#"<body><svg><image xlink:href="img/x.png" width="100%"/></svg>
            <div><img class="c" src="../Images/Cover%20Big.jpg"/></div></body>"#;
        assert_eq!(image_references(html), vec!["img/x.png", "../Images/Cover Big.jpg"]);
    }

    #[test]
    fn resolves_relative_paths() {
        let p = resolve(Path::new("OEBPS/text/cover.xhtml"), "../Images/cover.jpg#frag");
        assert_eq!(p, PathBuf::from("OEBPS").join("Images").join("cover.jpg"));
        let p = resolve(Path::new("cover.xhtml"), "./img.png");
        assert_eq!(p, PathBuf::from("img.png"));
    }
}
