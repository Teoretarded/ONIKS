// ONIKS as a native app: a Rust (Tauri 2) window over the system WebView2, serving the game's files from disk through
// its own protocol (no local server, no Python). The game's code is unchanged; the hit physics already runs as Rust
// compiled to WebAssembly (game/src/blast/fast/rs).
//
//   cargo run --release                 the game (game/index.html)
//   ONIKS_PAGE=game/lab.html?style=pointcloud&blast=fast cargo run --release
//   ONIKS_SIZE=1600x900                 window inner size
//   ONIKS_DEBUG_PORT=9333               Chrome DevTools Protocol on that port (tools/app_cdp.py drives it)
//   ONIKS_ROOT=<dir>                    where game/ and reference/ are (default: found above the exe, else the cwd)
//   ONIKS_FULLSCREEN=1                  start fullscreen (F11 toggles in the shipped build)
//   ONIKS_LOG=<file>                    append every missing file (404) to it
//
// POST /save?path=... is the same PNG/JSON sink as tools/serve_game.py, so ONIKS.still() and the lab work here too
// (dev builds only). The shipped build: cargo build --release --no-default-features (tools/build_release.py), with
// the game files in resources/ beside the exe.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{
    http::{header, Request, Response, StatusCode},
    WebviewUrl, WebviewWindowBuilder,
};

fn main() {
    let root = find_root();
    let r2 = root.clone();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![quit])
        .register_asynchronous_uri_scheme_protocol("oniks", move |_ctx, req, responder| {
            let root = r2.clone();
            // (off the UI thread: the game asks for ~130 modules at once)
            std::thread::spawn(move || responder.respond(serve(&root, req)));
        })
        .setup(move |app| {
            let page = std::env::var("ONIKS_PAGE").unwrap_or_else(|_| "game/index.html".into());
            let base = if cfg!(windows) { "http://oniks.localhost/" } else { "oniks://localhost/" };
            let url = format!("{base}{}", page.trim_start_matches('/'));
            let (w, h) = std::env::var("ONIKS_SIZE")
                .ok()
                .and_then(|s| {
                    let (a, b) = s.split_once('x')?;
                    Some((a.parse::<f64>().ok()?, b.parse::<f64>().ok()?))
                })
                .unwrap_or((1600.0, 900.0));
            // (Tauri's own defaults, plus: no GPU blocklist, no timer throttling when the window is behind another)
            let mut args = String::from(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                 --ignore-gpu-blocklist --disable-background-timer-throttling \
                 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows",
            );
            if let Ok(p) = std::env::var("ONIKS_DEBUG_PORT") {
                args.push_str(&format!(" --remote-debugging-port={p}"));
            }
            let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::CustomProtocol(url.parse().expect("page url")))
                .title("ONIKS")
                .inner_size(w, h)
                .min_inner_size(1024.0, 600.0)
                .background_color(tauri::window::Color(11, 12, 10, 255))
                .additional_browser_args(&args);
            if !cfg!(feature = "dev") {
                b = b.initialization_script(SHIPPED_JS);
            }
            if std::env::var("ONIKS_FULLSCREEN").is_ok_and(|v| v == "1") {
                b = b.fullscreen(true);
            }
            b.build()?;
            eprintln!("ONIKS: serving {} -> {url}", root.display());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("ONIKS failed to start");
}

/// The shipped build (no `dev` feature): the browser's own keys and menus are not the game's. Reload, print, find,
/// view source, dev tools, page zoom and the right-click menu are off; the game's keys (F1, F2, F8-F10, Ctrl 1-9...)
/// are untouched. F11 toggles fullscreen (the game's own handler, if any, runs first).
const SHIPPED_JS: &str = r#"
(() => {
  const block = e => {
    const k = e.key, c = e.ctrlKey || e.metaKey;
    if (k === 'F5' || k === 'F7' || k === 'F12' || k === 'BrowserRefresh' ||
        (c && /^[rpfugjs]$/i.test(k)) ||
        (c && e.shiftKey && /^[ijc]$/i.test(k)) || (c && /^[-+=0]$/.test(k))) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  addEventListener('keydown', block, true);
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { capture: true, passive: false });
  addEventListener('contextmenu', e => e.preventDefault(), true);
  addEventListener('keydown', e => {
    if (e.key === 'F11' && !e.defaultPrevented) { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
  });
})();
"#;

/// The menu's Quit (game/src/ui/shell/screens/menu.js): close the app.
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// The folder holding game/ and reference/.
fn find_root() -> PathBuf {
    if let Ok(r) = std::env::var("ONIKS_ROOT") {
        return PathBuf::from(r);
    }
    let ok = |p: &Path| p.join("game").join("index.html").is_file();
    if let Ok(exe) = std::env::current_exe() {
        for a in exe.ancestors() {
            if ok(a) {
                return a.to_path_buf();
            }
            let res = a.join("resources");
            if ok(&res) {
                return res;
            }
        }
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    cwd.ancestors().find(|a| ok(a)).map(Path::to_path_buf).unwrap_or(cwd)
}

fn reply(code: StatusCode, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap()
}

fn serve(root: &Path, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = unescape(req.uri().path());
    let rel = path.trim_start_matches('/');
    if rel.split(['/', '\\']).any(|s| s == "..") {
        return reply(StatusCode::FORBIDDEN, "text/plain", b"no".to_vec());
    }
    if req.method() == "POST" {
        return if rel == "save" && cfg!(feature = "dev") { save(root, req.uri().query().unwrap_or(""), req.body()) } else { reply(StatusCode::NOT_FOUND, "text/plain", vec![]) };
    }
    let mut file = root.join(if rel.is_empty() { "game/index.html" } else { rel });
    if file.is_dir() {
        file = file.join("index.html");
    }
    match fs::read(&file) {
        Ok(b) => reply(StatusCode::OK, mime(&file), b),
        Err(_) => {
            // (ONIKS_LOG=<file>: every request and miss, so a release copy that left a file out is caught)
            log(&format!("404 {rel}"));
            reply(StatusCode::NOT_FOUND, "text/plain", format!("not found: {rel}").into_bytes())
        }
    }
}

fn log(line: &str) {
    if let Ok(p) = std::env::var("ONIKS_LOG") {
        use std::io::Write;
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "{line}");
        }
    }
}

/// The PNG/JPEG/JSON/CSV/OBJ sink (tools/serve_game.py's rules: .png anywhere; .jpg, .json, .csv, .obj under game/shots/ only).
fn save(root: &Path, query: &str, body: &[u8]) -> Response<Vec<u8>> {
    let rel = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("path="))
        .map(unescape)
        .unwrap_or_default()
        .replace('\\', "/");
    let text = String::from_utf8_lossy(body);
    let b64 = |pre: &str| text.strip_prefix(pre).and_then(base64);
    let data = if rel.contains("..") || rel.is_empty() {
        None
    } else if rel.ends_with(".png") {
        b64("data:image/png;base64,")
    } else if rel.starts_with("game/shots/") && rel.ends_with(".jpg") {
        b64("data:image/jpeg;base64,")
    } else if rel.starts_with("game/shots/") && rel.ends_with(".json") && matches!(body.first(), Some(b'{' | b'[')) {
        Some(body.to_vec())
    } else if rel.starts_with("game/shots/") && (rel.ends_with(".csv") || rel.ends_with(".obj")) {
        // the lab's hit data (game/src/dev/lab/export.js)
        Some(body.to_vec())
    } else {
        None
    };
    let Some(data) = data else { return reply(StatusCode::BAD_REQUEST, "text/plain", vec![]) };
    let out = root.join(&rel);
    if let Some(d) = out.parent() {
        let _ = fs::create_dir_all(d);
    }
    match fs::write(&out, data) {
        Ok(_) => reply(StatusCode::OK, "text/plain", b"ok".to_vec()),
        Err(_) => reply(StatusCode::INTERNAL_SERVER_ERROR, "text/plain", vec![]),
    }
}

fn mime(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "txt" | "md" => "text/plain; charset=utf-8",
        "bin" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

/// %XX decoding (URLs carry encodeURIComponent'd paths).
fn unescape(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn base64(s: &str) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        } as u32)
    };
    let s = s.trim_end().trim_end_matches('=').as_bytes();
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    for ch in s.chunks(4) {
        let mut n = 0u32;
        for (i, &c) in ch.iter().enumerate() {
            n |= val(c)? << (18 - 6 * i);
        }
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&bytes[..ch.len() - 1]);
    }
    Some(out)
}
