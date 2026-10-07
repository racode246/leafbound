//! `lbcover://` URI scheme that serves cached cover images from the library.
//!
//! Using our own scheme (instead of Tauri's generic asset protocol) keeps the
//! file-system scope out of the picture and lets us send a real image
//! Content-Type: covers are stored without an extension, as `<id>.img`.

use std::borrow::Cow;
use std::fs;

use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext};

use crate::AppState;

pub const SCHEME: &str = "lbcover";

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let id = request.uri().path().trim_start_matches('/').to_string();
    if !is_uuid(&id) {
        return status(StatusCode::BAD_REQUEST);
    }
    let path = {
        let state = ctx.app_handle().state::<AppState>();
        let store = state.0.lock().unwrap_or_else(|p| p.into_inner());
        store.cover_path(&id)
    };
    match fs::read(&path) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", sniff_mime(&bytes))
            .header("Cache-Control", "private, max-age=86400")
            .body(Cow::Owned(bytes))
            .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR)),
        Err(_) => status(StatusCode::NOT_FOUND),
    }
}

fn status(code: StatusCode) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(code)
        .body(Cow::Borrowed(&[][..]))
        .expect("static response")
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36 && s.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn sniff_mime(bytes: &[u8]) -> &'static str {
    match imagesize::image_type(bytes) {
        Ok(imagesize::ImageType::Png) => "image/png",
        Ok(imagesize::ImageType::Jpeg) => "image/jpeg",
        Ok(imagesize::ImageType::Gif) => "image/gif",
        Ok(imagesize::ImageType::Webp) => "image/webp",
        Ok(imagesize::ImageType::Bmp) => "image/bmp",
        _ => "application/octet-stream",
    }
}
