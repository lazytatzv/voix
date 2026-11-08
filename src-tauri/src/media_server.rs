//! Loopback HTTP server for streaming local media into the webview.
//!
//! WebKitGTK cannot feed `<video>`/`<audio>` from Tauri's `asset:` scheme, and
//! turning whole files into blob URLs makes the web process hold the entire
//! video in memory. This server exposes registered files over
//! `http://127.0.0.1:<port>` with HTTP Range support, so the media engine can
//! stream and seek without loading the file at once.
//!
//! Every URL carries a random token. Only paths explicitly registered through
//! [`MediaServer::url_for`] are reachable; the server never accepts a path from
//! the request itself.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

#[allow(dead_code)]
fn media_log(msg: &str) {
    eprintln!("[media_server] {}", msg);
}

const RECV_TICK: Duration = Duration::from_millis(250);

#[derive(Default)]
struct Registry {
    by_id: HashMap<String, PathBuf>,
    by_path: HashMap<PathBuf, String>,
}

/// A running loopback media server. Dropping it stops the accept loop.
pub struct MediaServer {
    token: String,
    base_url: String,
    registry: Arc<Mutex<Registry>>,
    server: Arc<Server>,
    accept_thread: Option<JoinHandle<()>>,
    shutdown: Arc<AtomicBool>,
}

impl MediaServer {
    /// Binds to an ephemeral port on loopback and starts the accept thread.
    pub fn start() -> io::Result<Self> {
        let server = Server::http("127.0.0.1:0")
            .map_err(|err| io::Error::other(format!("media server bind failed: {err}")))?;
        let addr = server
            .server_addr()
            .to_ip()
            .ok_or_else(|| io::Error::other("media server did not get an IP address"))?;
        let base_url = format!("http://{}", addr);
        let token = Uuid::new_v4().simple().to_string();

        let registry = Arc::new(Mutex::new(Registry::default()));
        let server = Arc::new(server);
        let shutdown = Arc::new(AtomicBool::new(false));

        let accept_server = Arc::clone(&server);
        let accept_registry = Arc::clone(&registry);
        let accept_shutdown = Arc::clone(&shutdown);
        let accept_token = token.clone();
        let accept_thread = thread::Builder::new()
            .name("voix-media-accept".into())
            .spawn(move || {
                loop {
                    if accept_shutdown.load(Ordering::Relaxed) {
                        break;
                    }
                    match accept_server.recv_timeout(RECV_TICK) {
                        Ok(Some(request)) => {
                            let registry = Arc::clone(&accept_registry);
                            let shutdown = Arc::clone(&accept_shutdown);
                            let token = accept_token.clone();
                            // Serve each request on its own thread: WebKit can
                            // keep a streaming response open while issuing a
                            // second ranged request for seeking.
                            let _ = thread::Builder::new()
                                .name("voix-media-request".into())
                                .spawn(move || {
                                    handle_request(request, &token, &registry, &shutdown);
                                });
                        }
                        Ok(None) => {}
                        // `unblock()` (called from Drop) surfaces as an error.
                        Err(_) => break,
                    }
                }
            })?;

        Ok(Self {
            token,
            base_url,
            registry,
            server,
            accept_thread: Some(accept_thread),
            shutdown,
        })
    }

    /// Registers a file and returns its streaming URL. Registering the same
    /// path again reuses the previous URL.
    pub fn url_for(&self, path: &str) -> io::Result<String> {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "empty media path",
            ));
        }
        let expanded = if trimmed == "~" || trimmed.starts_with("~/") {
            let home = std::env::var("HOME").unwrap_or_default();
            if trimmed == "~" {
                home
            } else {
                format!("{}/{}", home.trim_end_matches('/'), &trimmed[2..])
            }
        } else {
            trimmed.to_string()
        };
        let canonical = std::fs::canonicalize(&expanded)?;
        if !std::fs::metadata(&canonical)?.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "media path is not a file",
            ));
        }

        let mut registry = lock_registry(&self.registry);
        let id = match registry.by_path.get(&canonical) {
            Some(id) => id.clone(),
            None => {
                let id = Uuid::new_v4().simple().to_string();
                registry.by_path.insert(canonical.clone(), id.clone());
                registry.by_id.insert(id.clone(), canonical.clone());
                id
            }
        };

        let url = format!("{}/media/{}/{}", self.base_url, self.token, id);
        media_log(&format!("url_for: {} -> {}", canonical.display(), url));
        Ok(url)
    }

    /// The loopback origin, useful for CSP headers or diagnostics.
    #[allow(dead_code)]
    pub fn origin(&self) -> &str {
        &self.base_url
    }
}

impl Drop for MediaServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        self.server.unblock();
        if let Some(handle) = self.accept_thread.take() {
            let _ = handle.join();
        }
    }
}

fn lock_registry(registry: &Mutex<Registry>) -> std::sync::MutexGuard<'_, Registry> {
    registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn handle_request(
    request: Request,
    token: &str,
    registry: &Mutex<Registry>,
    shutdown: &AtomicBool,
) {
    if shutdown.load(Ordering::Relaxed) {
        return;
    }

    let method = request.method().clone();
    if !matches!(method, Method::Get | Method::Head | Method::Options) {
        let mut response = Response::empty(StatusCode(405));
        add_headers(&mut response, cors_headers());
        add_headers(&mut response, vec![header("Allow", "GET, HEAD, OPTIONS")]);
        let _ = request.respond(response);
        return;
    }

    if matches!(method, Method::Options) {
        let mut response = Response::empty(StatusCode(204));
        add_headers(&mut response, cors_headers());
        add_headers(
            &mut response,
            vec![header("Access-Control-Max-Age", "86400")],
        );
        let _ = request.respond(response);
        return;
    }

    let path = request.url().split('?').next().unwrap_or("");
    let mut parts = path.trim_start_matches('/').split('/');
    let prefix = parts.next();
    let request_token = parts.next();
    let media_id = parts.next();
    let trailing = parts.next();

    if prefix != Some("media")
        || trailing.is_some()
        || request_token != Some(token)
        || media_id.is_none()
    {
        let _ = request.respond(with_cors(Response::empty(StatusCode(404))));
        return;
    }
    let media_id = media_id.unwrap_or_default();

    let file_path = {
        let registry = lock_registry(registry);
        registry.by_id.get(media_id).cloned()
    };
    let Some(file_path) = file_path else {
        let _ = request.respond(with_cors(Response::empty(StatusCode(404))));
        return;
    };

    let file = match File::open(&file_path) {
        Ok(file) => file,
        Err(_) => {
            let _ = request.respond(with_cors(Response::empty(StatusCode(404))));
            return;
        }
    };
    let file_len = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            let _ = request.respond(with_cors(Response::empty(StatusCode(500))));
            return;
        }
    };
    let mime = mime_for(&file_path);

    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str());

    media_log(&format!(
        "{} {} Range: {:?} (file: {} bytes)",
        method.as_str(),
        request.url(),
        range_header,
        file_len
    ));

    if matches!(method, Method::Head) {
        let mut response = Response::empty(StatusCode(200));
        add_headers(&mut response, cors_headers());
        add_headers(
            &mut response,
            vec![
                header("Content-Type", mime),
                header("Accept-Ranges", "bytes"),
                header("Content-Length", &file_len.to_string()),
            ],
        );
        let _ = request.respond(response);
        return;
    }

    match parse_range(range_header, file_len) {
        RangeSpec::Full => {
            if file_len > MAX_RANGE_CHUNK && mime.starts_with("video/") {
                // For large videos without a Range header, serve the first chunk as 206 Partial Content
                // (RFC 7233 § 4.1) so the server never streams multi-gigabyte files into an open socket.
                respond_partial(request, file, file_len, mime, 0, MAX_RANGE_CHUNK - 1)
            } else {
                respond_full(request, file, file_len, mime)
            }
        }
        RangeSpec::Partial { start, end } => {
            respond_partial(request, file, file_len, mime, start, end)
        }
        RangeSpec::Unsatisfiable => {
            let mut response = Response::empty(StatusCode(416));
            add_headers(&mut response, cors_headers());
            add_headers(
                &mut response,
                vec![
                    header("Accept-Ranges", "bytes"),
                    header("Content-Range", &format!("bytes */{file_len}")),
                ],
            );
            let _ = request.respond(response);
        }
    }
}

fn respond_full(request: Request, file: File, file_len: u64, mime: &str) {
    let mut response = Response::new(
        StatusCode(200),
        media_headers(mime),
        file,
        Some(usize::try_from(file_len).unwrap_or(usize::MAX)),
        None,
    )
    .with_chunked_threshold(usize::MAX);
    add_headers(&mut response, cors_headers());
    add_headers(
        &mut response,
        vec![header("Content-Length", &file_len.to_string())],
    );
    let _ = request.respond(response);
}

fn respond_partial(
    request: Request,
    mut file: File,
    file_len: u64,
    mime: &str,
    start: u64,
    end: u64,
) {
    if file.seek(SeekFrom::Start(start)).is_err() {
        let _ = request.respond(with_cors(Response::empty(StatusCode(500))));
        return;
    }
    let length = end.saturating_sub(start).saturating_add(1);

    let mut response = Response::new(
        StatusCode(206),
        media_headers(mime),
        file.take(length),
        Some(usize::try_from(length).unwrap_or(usize::MAX)),
        None,
    )
    .with_chunked_threshold(usize::MAX);
    add_headers(&mut response, cors_headers());
    add_headers(
        &mut response,
        vec![
            header("Content-Length", &length.to_string()),
            header(
                "Content-Range",
                &format!("bytes {start}-{end}/{file_len}"),
            ),
        ],
    );
    let _ = request.respond(response);
}

fn with_cors<R: Read>(mut response: Response<R>) -> Response<R> {
    add_headers(&mut response, cors_headers());
    response
}

fn media_headers(mime: &str) -> Vec<Header> {
    vec![
        header("Content-Type", mime),
        header("Accept-Ranges", "bytes"),
        header("Cache-Control", "no-store"),
    ]
}

fn cors_headers() -> Vec<Header> {
    vec![
        header("Access-Control-Allow-Origin", "*"),
        header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
        header(
            "Access-Control-Allow-Headers",
            "Range, Content-Type, Accept, Origin",
        ),
        header(
            "Access-Control-Expose-Headers",
            "Content-Length, Content-Range, Accept-Ranges",
        ),
        header("Cross-Origin-Resource-Policy", "cross-origin"),
    ]
}

fn add_headers<R: Read>(response: &mut Response<R>, headers: Vec<Header>) {
    for header in headers {
        response.add_header(header);
    }
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes())
        .expect("static media server header names/values are ASCII")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RangeSpec {
    /// No usable Range header; send the entire file with 200.
    Full,
    /// Inclusive byte range, already clamped to the file length.
    Partial { start: u64, end: u64 },
    /// Well-formed range that starts beyond EOF; send 416.
    Unsatisfiable,
}

/// 1回のRangeリクエストで転送する最大チャンクサイズ (8 MB)。
/// 開放型Range (bytes=0-) で巨大ファイル全体を一度に読み込んでUIをフリーズさせるのを防ぐ。
const MAX_RANGE_CHUNK: u64 = 8 * 1024 * 1024;

fn parse_range(header_value: Option<&str>, file_len: u64) -> RangeSpec {
    if file_len == 0 {
        return RangeSpec::Full;
    }
    let Some(value) = header_value else {
        return RangeSpec::Full;
    };
    let Some(spec) = value.trim().strip_prefix("bytes=") else {
        return RangeSpec::Full;
    };
    // Multi-range responses are optional; serving the whole file is valid and
    // keeps seeking behavior predictable.
    if spec.contains(',') {
        return RangeSpec::Full;
    }
    let spec = spec.trim();
    let Some((start_raw, end_raw)) = spec.split_once('-') else {
        return RangeSpec::Full;
    };
    let start_raw = start_raw.trim();
    let end_raw = end_raw.trim();

    if start_raw.is_empty() {
        // Suffix form: bytes=-N => last N bytes.
        let Ok(suffix) = end_raw.parse::<u64>() else {
            return RangeSpec::Full;
        };
        if suffix == 0 {
            return RangeSpec::Unsatisfiable;
        }
        let start = file_len.saturating_sub(suffix);
        return RangeSpec::Partial {
            start,
            end: file_len - 1,
        };
    }

    let Ok(start) = start_raw.parse::<u64>() else {
        return RangeSpec::Full;
    };
    if start >= file_len {
        return RangeSpec::Unsatisfiable;
    }

    let end = if end_raw.is_empty() {
        (start + MAX_RANGE_CHUNK - 1).min(file_len - 1)
    } else {
        let Ok(end) = end_raw.parse::<u64>() else {
            return RangeSpec::Full;
        };
        if end < start {
            return RangeSpec::Unsatisfiable;
        }
        end.min(file_len - 1)
    };

    RangeSpec::Partial { start, end }
}

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("mov") => "video/quicktime",
        Some("ogv") => "video/ogg",
        Some("avi") => "video/x-msvideo",
        Some("m4a") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("aac") => "audio/aac",
        Some("opus") => "audio/ogg; codecs=opus",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use std::net::TcpStream;

    #[test]
    fn parses_common_ranges() {
        assert_eq!(parse_range(None, 100), RangeSpec::Full);
        assert_eq!(
            parse_range(Some("bytes=0-99"), 100),
            RangeSpec::Partial { start: 0, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=10-"), 100),
            RangeSpec::Partial { start: 10, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=-10"), 100),
            RangeSpec::Partial { start: 90, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=90-500"), 100),
            RangeSpec::Partial { start: 90, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=-500"), 100),
            RangeSpec::Partial { start: 0, end: 99 }
        );
    }

    #[test]
    fn rejects_or_ignores_bad_ranges() {
        assert_eq!(
            parse_range(Some("bytes=100-"), 100),
            RangeSpec::Unsatisfiable
        );
        assert_eq!(
            parse_range(Some("bytes=5-4"), 100),
            RangeSpec::Unsatisfiable
        );
        assert_eq!(parse_range(Some("bytes=-0"), 100), RangeSpec::Unsatisfiable);
        assert_eq!(parse_range(Some("items=0-10"), 100), RangeSpec::Full);
        assert_eq!(parse_range(Some("bytes=0-10,20-30"), 100), RangeSpec::Full);
        assert_eq!(parse_range(Some("bytes=abc"), 100), RangeSpec::Full);
        assert_eq!(parse_range(Some("bytes=0-10"), 0), RangeSpec::Full);
    }

    #[test]
    fn maps_media_mime_types() {
        assert_eq!(mime_for(Path::new("/tmp/a.MP4")), "video/mp4");
        assert_eq!(mime_for(Path::new("/tmp/a.webm")), "video/webm");
        assert_eq!(mime_for(Path::new("/tmp/a.wav")), "audio/wav");
        assert_eq!(
            mime_for(Path::new("/tmp/a.unknown")),
            "application/octet-stream"
        );
    }

    fn temp_fixture() -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("voix-media-test-{}.bin", Uuid::new_v4().simple()));
        std::fs::write(&path, b"0123456789").expect("write fixture");
        path
    }

    fn http_request(authority: &str, request_path: &str, range: Option<&str>) -> String {
        let mut stream = TcpStream::connect(authority).expect("connect media server");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set timeout");
        let range_header = range
            .map(|value| format!("Range: {value}\r\n"))
            .unwrap_or_default();
        write!(
            stream,
            "GET /{request_path} HTTP/1.1\r\nHost: {authority}\r\n{range_header}Connection: close\r\n\r\n"
        )
        .expect("send request");
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).expect("read response");
        String::from_utf8_lossy(&raw).into_owned()
    }

    #[test]
    fn serves_range_over_http() {
        let path = temp_fixture();
        let server = MediaServer::start().expect("start media server");
        let url = server
            .url_for(path.to_str().expect("utf-8 fixture path"))
            .expect("register fixture");
        let rest = url.strip_prefix("http://").expect("http url");
        let (authority, request_path) = rest.split_once('/').expect("url path");

        let text = http_request(authority, request_path, Some("bytes=2-4"));

        assert!(
            text.starts_with("HTTP/1.1 206"),
            "unexpected response: {text}"
        );
        assert!(
            text.to_ascii_lowercase()
                .contains("content-range: bytes 2-4/10"),
            "missing content-range: {text}"
        );
        assert!(text.ends_with("234"), "unexpected body: {text}");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn serves_full_file_without_range() {
        let path = temp_fixture();
        let server = MediaServer::start().expect("start media server");
        let url = server
            .url_for(path.to_str().expect("utf-8 fixture path"))
            .expect("register fixture");
        let rest = url.strip_prefix("http://").expect("http url");
        let (authority, request_path) = rest.split_once('/').expect("url path");

        let text = http_request(authority, request_path, None);
        assert!(
            text.starts_with("HTTP/1.1 200"),
            "unexpected response: {text}"
        );
        assert!(text.ends_with("0123456789"), "unexpected body: {text}");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn requires_valid_token_and_media_id() {
        let path = temp_fixture();
        let server = MediaServer::start().expect("start media server");
        let url = server
            .url_for(path.to_str().expect("utf-8 fixture path"))
            .expect("register fixture");
        let rest = url.strip_prefix("http://").expect("http url");
        let (authority, request_path) = rest.split_once('/').expect("url path");
        let (_, media_id) = request_path.rsplit_once('/').expect("media id");
        let zeroes = "0".repeat(32);

        let wrong_token = http_request(authority, &format!("media/{zeroes}/{media_id}"), None);
        assert!(
            wrong_token.starts_with("HTTP/1.1 404"),
            "wrong token was served: {wrong_token}"
        );

        let wrong_id = http_request(authority, &format!("media/{}/{zeroes}", server.token), None);
        assert!(
            wrong_id.starts_with("HTTP/1.1 404"),
            "wrong id was served: {wrong_id}"
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_unregistered_or_non_file_paths() {
        let server = MediaServer::start().expect("start media server");
        assert!(server.url_for("/definitely/not/here.bin").is_err());
        let dir = std::env::temp_dir();
        assert!(
            server
                .url_for(dir.to_str().expect("utf-8 temp dir"))
                .is_err()
        );
    }
}
