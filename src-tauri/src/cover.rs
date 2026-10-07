//! Cover image selection.
//!
//! The `epub` crate only honours the `cover-image` property (EPUB 3) or
//! `<meta name="cover">` (EPUB 2). Publishers frequently tag a small thumbnail
//! there while the real cover lives on the first page as an `<img>`/`<image>`.
//! We gather every plausible candidate and keep the largest one by pixel area.

use std::collections::HashSet;
use std::fs::File;
use std::io::BufReader;
use std::path::{Component, Path, PathBuf};

use epub::doc::EpubDoc;

type Doc = EpubDoc<BufReader<File>>;

pub fn extract_cover(doc: &mut Doc) -> Option<Vec<u8>> {
    let mut candidates: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut push = |id: String, candidates: &mut Vec<String>| {
        if seen.insert(id.clone()) {
            candidates.push(id);
        }
    };

    if let Some(id) = doc.get_cover_id() {
        push(id, &mut candidates);
    }
    if let Some(item) = doc.mdata("cover") {
        let id = item.value.clone();
        if doc.resources.contains_key(&id) {
            push(id, &mut candidates);
        }
    }

    // Images referenced from the first couple of spine documents.
    let first_pages: Vec<String> = doc.spine.iter().take(2).map(|s| s.idref.clone()).collect();
    for idref in first_pages {
        let page_path = match doc.resources.get(&idref) {
            Some(r) => r.path.clone(),
            None => continue,
        };
        let Some((content, _mime)) = doc.get_resource_str(&idref) else {
            continue;
        };
        for reference in image_references(&content) {
            let resolved = resolve(&page_path, &reference);
            if let Some(id) = resource_id_for_path(doc, &resolved) {
                push(id, &mut candidates);
            }
        }
    }

    // Anything that looks like a cover by name.
    let by_name: Vec<String> = doc
        .resources
        .iter()
        .filter(|(id, r)| {
            r.mime.starts_with("image/")
                && (id.to_ascii_lowercase().contains("cover")
                    || r.path.to_string_lossy().to_ascii_lowercase().contains("cover"))
        })
        .map(|(id, _)| id.clone())
        .collect();
    for id in by_name {
        push(id, &mut candidates);
    }

    let mut best: Option<(u64, usize, Vec<u8>)> = None;
    for (order, id) in candidates.iter().enumerate() {
        let is_image = doc
            .resources
            .get(id)
            .map(|r| r.mime.starts_with("image/"))
            .unwrap_or(false);
        if !is_image {
            continue;
        }
        let Some((bytes, _mime)) = doc.get_resource(id) else {
            continue;
        };
        if bytes.is_empty() {
            continue;
        }
        let area = imagesize::blob_size(&bytes)
            .map(|s| s.width as u64 * s.height as u64)
            .unwrap_or(0);
        let better = match &best {
            None => true,
            Some((best_area, best_order, _)) => area > *best_area || (area == *best_area && order < *best_order),
        };
        if better {
            best = Some((area, order, bytes));
        }
    }
    best.map(|(_, _, bytes)| bytes)
}

/// Pulls `src`/`href`/`xlink:href` values out of `<img>` and `<image>` tags.
fn image_references(html: &str) -> Vec<String> {
    let mut out = Vec::new();
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
                        out.push(v);
                    }
                    break;
                }
            }
            from = end;
        }
    }
    out
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
    fn finds_image_references() {
        let html = r#"<body><div><img class="c" src="../Images/Cover%20Big.jpg"/></div>
            <svg><image xlink:href="img/x.png" width="100%"/></svg></body>"#;
        assert_eq!(image_references(html), vec!["../Images/Cover Big.jpg", "img/x.png"]);
    }

    #[test]
    fn resolves_relative_paths() {
        let p = resolve(Path::new("OEBPS/text/cover.xhtml"), "../Images/cover.jpg#frag");
        assert_eq!(p, PathBuf::from("OEBPS").join("Images").join("cover.jpg"));
        let p = resolve(Path::new("cover.xhtml"), "./img.png");
        assert_eq!(p, PathBuf::from("img.png"));
    }
}
