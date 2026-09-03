mod engine;
mod online;
mod rules;

use std::{
    io,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    process::{Command, Stdio},
    sync::Arc,
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use engine::{Difficulty, EngineError, EnginePool};
use online::{OnlineError, OnlineHub, RoomTicket};
use rules::{Board, Move, RuleError};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{info, warn};

#[derive(Clone)]
struct AppState {
    engines: EnginePool,
    online: OnlineHub,
}

#[derive(Embed)]
#[folder = "."]
#[include = "index.html"]
#[include = "favicon.svg"]
#[include = "manifest.webmanifest"]
#[include = "sw.js"]
#[include = "icons/icon-192.png"]
#[include = "icons/icon-512.png"]
#[include = "icons/icon-maskable-512.png"]
#[include = "icons/apple-touch-icon.png"]
struct RootAssets;

#[derive(Embed)]
#[folder = "css/"]
struct CssAssets;

#[derive(Embed)]
#[folder = "js/"]
struct JsAssets;

#[derive(Embed)]
#[folder = "vendor/"]
struct VendorAssets;

#[derive(Embed)]
#[folder = "assets/"]
struct ModelAssets;

#[derive(Debug, Deserialize)]
struct AiMoveRequest {
    #[serde(default)]
    moves: Vec<String>,
    #[serde(default)]
    difficulty: Difficulty,
}

#[derive(Debug, Serialize)]
struct AiMoveResponse {
    best_move: String,
    from: rules::Square,
    to: rules::Square,
    fen_before: String,
    check: bool,
    game_over: bool,
}

#[derive(Debug, Deserialize)]
struct OnlineSocketQuery {
    token: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let engines = EnginePool::from_env();
    if engines.appears_available() {
        info!(path = %engines.configured_path(), "Pikafish engine configured");
    } else {
        warn!(path = %engines.configured_path(), "Pikafish not found; Pikafish engine selection is unavailable");
    }
    let state = Arc::new(AppState {
        engines,
        online: OnlineHub::default(),
    });
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/ai/status", get(ai_status))
        .route("/api/ai/move", post(ai_move))
        .route("/api/rooms", post(create_room))
        .route("/api/rooms/{room_id}/join", post(join_room))
        .route("/api/rooms/{room_id}/ws", get(online_socket))
        .route("/", get(index))
        .route("/{*path}", get(asset))
        .with_state(state);

    let address: SocketAddr = std::env::var("CHESS_BIND")
        .unwrap_or_else(|_| "0.0.0.0:0".to_owned())
        .parse()
        .expect("CHESS_BIND must be a valid socket address");
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("failed to bind server");
    let bound_address = listener
        .local_addr()
        .expect("failed to read bound server address");
    let browser_url = local_browser_url(bound_address);

    println!();
    println!("楚河漢界 · 3D 中国象棋");
    println!("请访问 {browser_url} 进行对战。");
    println!("按 Ctrl+C 停止服务。");
    println!();

    info!(address = %bound_address, "chess server listening");
    if browser_open_enabled()
        && desktop_session_available()
        && let Err(error) = open_browser(&browser_url)
    {
        warn!(%error, "failed to open the default browser");
        eprintln!("未能自动打开默认浏览器，请手动访问 {browser_url}");
    }
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server failed");
}

fn local_browser_url(address: SocketAddr) -> String {
    let ip = match address.ip() {
        IpAddr::V4(ip) if ip.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(ip) if ip.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        ip => ip,
    };
    format!("http://{}", SocketAddr::new(ip, address.port()))
}

fn browser_open_enabled() -> bool {
    std::env::var("CHESS_OPEN_BROWSER")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "no"
            )
        })
        .unwrap_or(true)
}

fn desktop_session_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

fn open_browser(url: &str) -> io::Result<()> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    return Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "opening a browser is unsupported on this platform",
    ));

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler")
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn ai_status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(json!({
        "available": state.engines.appears_available(),
        "engine": "Pikafish",
        "path": state.engines.configured_path(),
    }))
}

async fn ai_move(
    State(state): State<Arc<AppState>>,
    Json(request): Json<AiMoveRequest>,
) -> Result<Json<AiMoveResponse>, ApiError> {
    if request.moves.len() > 500 {
        return Err(ApiError::bad_request("走子记录过长"));
    }
    let board = Board::replay(&request.moves)?;
    if board.is_game_over() {
        return Err(ApiError::bad_request("棋局已经结束"));
    }
    let fen_before = board.fen();
    let best_move = state
        .engines
        .best_move(&request.moves, request.difficulty)
        .await?;
    let candidate = Move::from_uci(&best_move)?;
    if !board.is_legal(candidate) {
        return Err(ApiError::internal("AI 返回了服务端规则不接受的走法"));
    }
    let mut after = board;
    after.apply_move(candidate)?;
    Ok(Json(AiMoveResponse {
        best_move: candidate.to_uci(),
        from: candidate.from,
        to: candidate.to,
        fen_before,
        check: after.is_in_check(after.turn),
        game_over: after.is_game_over(),
    }))
}

async fn create_room(State(state): State<Arc<AppState>>) -> Result<Json<RoomTicket>, ApiError> {
    Ok(Json(state.online.create_room().await?))
}

async fn join_room(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> Result<Json<RoomTicket>, ApiError> {
    Ok(Json(state.online.join_room(&room_id).await?))
}

async fn online_socket(
    websocket: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Query(query): Query<OnlineSocketQuery>,
) -> impl IntoResponse {
    websocket.on_upgrade(move |socket| async move {
        state
            .online
            .serve_socket(room_id, query.token, socket)
            .await;
    })
}

async fn index() -> Response {
    embedded_response::<RootAssets>("index.html")
}

async fn asset(Path(path): Path<String>) -> Response {
    if let Some(path) = path.strip_prefix("css/") {
        embedded_response::<CssAssets>(path)
    } else if let Some(path) = path.strip_prefix("js/") {
        embedded_response::<JsAssets>(path)
    } else if let Some(path) = path.strip_prefix("vendor/") {
        embedded_response::<VendorAssets>(path)
    } else if let Some(path) = path.strip_prefix("assets/") {
        embedded_response::<ModelAssets>(path)
    } else {
        embedded_response::<RootAssets>(&path)
    }
}

fn embedded_response<T: Embed>(path: &str) -> Response {
    let Some(file) = T::get(path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(
            header::CACHE_CONTROL,
            if path == "index.html" || path.ends_with(".js") || path.ends_with(".css") {
                "no-cache"
            } else {
                "public, max-age=3600"
            },
        )
        .body(Body::from(file.data))
        .expect("valid embedded response")
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl From<RuleError> for ApiError {
    fn from(value: RuleError) -> Self {
        Self::bad_request(value.to_string())
    }
}

impl From<EngineError> for ApiError {
    fn from(value: EngineError) -> Self {
        Self {
            status: match value {
                EngineError::Spawn(_) => StatusCode::SERVICE_UNAVAILABLE,
                EngineError::Timeout => StatusCode::GATEWAY_TIMEOUT,
                EngineError::Io(_) | EngineError::MissingMove => StatusCode::BAD_GATEWAY,
            },
            message: value.to_string(),
        }
    }
}

impl From<OnlineError> for ApiError {
    fn from(value: OnlineError) -> Self {
        Self {
            status: match value {
                OnlineError::RoomNotFound => StatusCode::NOT_FOUND,
                OnlineError::RoomFull => StatusCode::CONFLICT,
                OnlineError::Unauthorized => StatusCode::UNAUTHORIZED,
                OnlineError::Capacity => StatusCode::SERVICE_UNAVAILABLE,
            },
            message: value.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}
