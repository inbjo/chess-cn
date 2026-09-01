use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::extract::ws::{Message, WebSocket};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock, broadcast};

use crate::rules::{Board, Color, Move, RuleError, Square};

const MAX_ROOMS: usize = 1024;
const ROOM_TTL_SECS: u64 = 24 * 60 * 60;
const HEARTBEAT_INTERVAL_SECS: u64 = 10;
const HEARTBEAT_TIMEOUT_SECS: u64 = 30;

#[derive(Clone, Default)]
pub struct OnlineHub {
    rooms: Arc<RwLock<HashMap<String, Arc<Room>>>>,
}

struct Room {
    state: Mutex<RoomState>,
    events: broadcast::Sender<ServerMessage>,
}

struct RoomState {
    board: Board,
    moves: Vec<String>,
    red: Seat,
    black: Option<Seat>,
    revision: u64,
    red_restart: bool,
    black_restart: bool,
    touched: Instant,
}

struct Seat {
    token: String,
    connections: usize,
}

#[derive(Debug, Serialize)]
pub struct RoomTicket {
    pub room_id: String,
    pub token: String,
    pub color: Color,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Snapshot {
        room_id: String,
        color: Color,
        moves: Vec<String>,
        turn: Color,
        revision: u64,
        opponent_connected: bool,
        check: bool,
        game_over: bool,
        winner: Option<Color>,
    },
    Move {
        uci: String,
        from: Square,
        to: Square,
        turn: Color,
        revision: u64,
        check: bool,
        game_over: bool,
        winner: Option<Color>,
    },
    Presence {
        red_connected: bool,
        black_connected: bool,
    },
    RestartPending {
        color: Color,
    },
    Restarted {
        turn: Color,
        revision: u64,
    },
    Error {
        code: &'static str,
        message: String,
        revision: u64,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Move { uci: String, revision: u64 },
    Restart,
}

#[derive(Debug, thiserror::Error)]
pub enum OnlineError {
    #[error("房间不存在或已经过期")]
    RoomNotFound,
    #[error("房间已有两名棋手")]
    RoomFull,
    #[error("无效的房间凭证")]
    Unauthorized,
    #[error("房间数量已达上限，请稍后再试")]
    Capacity,
}

impl OnlineHub {
    pub async fn create_room(&self) -> Result<RoomTicket, OnlineError> {
        self.prune().await;
        let mut rooms = self.rooms.write().await;
        if rooms.len() >= MAX_ROOMS {
            return Err(OnlineError::Capacity);
        }
        let room_id = loop {
            let candidate = random_code(6);
            if !rooms.contains_key(&candidate) {
                break candidate;
            }
        };
        let token = random_code(32);
        let (events, _) = broadcast::channel(64);
        rooms.insert(
            room_id.clone(),
            Arc::new(Room {
                state: Mutex::new(RoomState {
                    board: Board::initial(),
                    moves: Vec::new(),
                    red: Seat {
                        token: token.clone(),
                        connections: 0,
                    },
                    black: None,
                    revision: 0,
                    red_restart: false,
                    black_restart: false,
                    touched: Instant::now(),
                }),
                events,
            }),
        );
        Ok(RoomTicket {
            room_id,
            token,
            color: Color::Red,
        })
    }

    pub async fn join_room(&self, room_id: &str) -> Result<RoomTicket, OnlineError> {
        let room_id = normalize_room_id(room_id);
        let room = self.room(&room_id).await?;
        let mut state = room.state.lock().await;
        if state.black.is_some() {
            return Err(OnlineError::RoomFull);
        }
        let token = random_code(32);
        state.black = Some(Seat {
            token: token.clone(),
            connections: 0,
        });
        state.touched = Instant::now();
        Ok(RoomTicket {
            room_id,
            token,
            color: Color::Black,
        })
    }

    pub async fn serve_socket(&self, room_id: String, token: String, mut socket: WebSocket) {
        let room_id = normalize_room_id(&room_id);
        let Ok(room) = self.room(&room_id).await else {
            let _ = send_direct(
                &mut socket,
                &ServerMessage::Error {
                    code: "room_not_found",
                    message: OnlineError::RoomNotFound.to_string(),
                    revision: 0,
                },
            )
            .await;
            return;
        };
        let mut receiver = room.events.subscribe();
        let color;
        let snapshot;
        {
            let mut state = room.state.lock().await;
            let Ok(auth_color) = state.authorize(&token) else {
                let _ = send_direct(
                    &mut socket,
                    &ServerMessage::Error {
                        code: "unauthorized",
                        message: OnlineError::Unauthorized.to_string(),
                        revision: state.revision,
                    },
                )
                .await;
                return;
            };
            color = auth_color;
            state.set_connected(color, true);
            state.touched = Instant::now();
            snapshot = state.snapshot(room_id.clone(), color);
        }
        if send_direct(&mut socket, &snapshot).await.is_err() {
            let mut state = room.state.lock().await;
            state.set_connected(color, false);
            return;
        }
        broadcast_presence(&room).await;

        let mut heartbeat = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        heartbeat.tick().await;
        let mut last_seen = Instant::now();

        loop {
            tokio::select! {
                incoming = socket.recv() => {
                    let Some(Ok(message)) = incoming else { break };
                    last_seen = Instant::now();
                    match message {
                        Message::Text(text) => {
                            if text.len() > 1024 {
                                let revision = room.state.lock().await.revision;
                                let error = ServerMessage::Error {
                                    code: "message_too_large",
                                    message: "联机指令过长".to_owned(),
                                    revision,
                                };
                                if send_direct(&mut socket, &error).await.is_err() { break; }
                                continue;
                            }
                            match serde_json::from_str::<ClientMessage>(&text) {
                                Ok(command) => {
                                    if let Some(error) = self.handle_command(&room, color, command).await
                                        && send_direct(&mut socket, &error).await.is_err()
                                    {
                                        break;
                                    }
                                }
                                Err(_) => {
                                    let revision = room.state.lock().await.revision;
                                    let error = ServerMessage::Error {
                                        code: "invalid_message",
                                        message: "无法识别的联机指令".to_owned(),
                                        revision,
                                    };
                                    if send_direct(&mut socket, &error).await.is_err() { break; }
                                }
                            }
                        }
                        Message::Ping(payload) => {
                            if socket.send(Message::Pong(payload)).await.is_err() { break; }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
                _ = heartbeat.tick() => {
                    if last_seen.elapsed() >= Duration::from_secs(HEARTBEAT_TIMEOUT_SECS) {
                        break;
                    }
                    if socket.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
                }
                event = receiver.recv() => {
                    match event {
                        Ok(event) => {
                            if send_direct(&mut socket, &event).await.is_err() { break; }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            let state = room.state.lock().await;
                            let fresh = state.snapshot(room_id.clone(), color);
                            drop(state);
                            if send_direct(&mut socket, &fresh).await.is_err() { break; }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            }
        }

        {
            let mut state = room.state.lock().await;
            state.set_connected(color, false);
            state.touched = Instant::now();
        }
        broadcast_presence(&room).await;
    }

    async fn handle_command(
        &self,
        room: &Arc<Room>,
        color: Color,
        command: ClientMessage,
    ) -> Option<ServerMessage> {
        let event = {
            let mut state = room.state.lock().await;
            state.touched = Instant::now();
            match command {
                ClientMessage::Move { uci, revision } => {
                    if revision != state.revision {
                        ServerMessage::Error {
                            code: "stale_revision",
                            message: "棋局状态已变化，正在重新同步".to_owned(),
                            revision: state.revision,
                        }
                    } else if state.black.is_none() {
                        ServerMessage::Error {
                            code: "waiting_opponent",
                            message: "请等待对手加入房间".to_owned(),
                            revision: state.revision,
                        }
                    } else if state.board.turn != color {
                        ServerMessage::Error {
                            code: "wrong_turn",
                            message: "尚未轮到你行棋".to_owned(),
                            revision: state.revision,
                        }
                    } else {
                        match apply_online_move(&mut state, &uci) {
                            Ok(message) => message,
                            Err(error) => ServerMessage::Error {
                                code: "illegal_move",
                                message: error.to_string(),
                                revision: state.revision,
                            },
                        }
                    }
                }
                ClientMessage::Restart => {
                    match color {
                        Color::Red => state.red_restart = true,
                        Color::Black => state.black_restart = true,
                    }
                    if state.red_restart && state.black_restart {
                        state.board = Board::initial();
                        state.moves.clear();
                        state.revision += 1;
                        state.red_restart = false;
                        state.black_restart = false;
                        ServerMessage::Restarted {
                            turn: state.board.turn,
                            revision: state.revision,
                        }
                    } else {
                        ServerMessage::RestartPending { color }
                    }
                }
            }
        };
        if matches!(event, ServerMessage::Error { .. }) {
            Some(event)
        } else {
            let _ = room.events.send(event);
            None
        }
    }

    async fn room(&self, room_id: &str) -> Result<Arc<Room>, OnlineError> {
        self.rooms
            .read()
            .await
            .get(room_id)
            .cloned()
            .ok_or(OnlineError::RoomNotFound)
    }

    async fn prune(&self) {
        let mut rooms = self.rooms.write().await;
        rooms.retain(|_, room| {
            room.state
                .try_lock()
                .map(|state| state.touched.elapsed().as_secs() < ROOM_TTL_SECS)
                .unwrap_or(true)
        });
    }
}

impl RoomState {
    fn authorize(&self, token: &str) -> Result<Color, OnlineError> {
        if self.red.token == token {
            Ok(Color::Red)
        } else if self.black.as_ref().is_some_and(|seat| seat.token == token) {
            Ok(Color::Black)
        } else {
            Err(OnlineError::Unauthorized)
        }
    }

    fn set_connected(&mut self, color: Color, connected: bool) {
        let seat = match color {
            Color::Red => Some(&mut self.red),
            Color::Black => self.black.as_mut(),
        };
        if let Some(seat) = seat {
            if connected {
                seat.connections += 1;
            } else {
                seat.connections = seat.connections.saturating_sub(1);
            }
        }
    }

    fn connected(&self, color: Color) -> bool {
        match color {
            Color::Red => self.red.connections > 0,
            Color::Black => self.black.as_ref().is_some_and(|seat| seat.connections > 0),
        }
    }

    fn snapshot(&self, room_id: String, color: Color) -> ServerMessage {
        let game_over = self.board.is_game_over();
        ServerMessage::Snapshot {
            room_id,
            color,
            moves: self.moves.clone(),
            turn: self.board.turn,
            revision: self.revision,
            opponent_connected: self.connected(color.opponent()),
            check: self.board.is_in_check(self.board.turn),
            game_over,
            winner: game_over.then(|| self.board.turn.opponent()),
        }
    }
}

fn apply_online_move(state: &mut RoomState, uci: &str) -> Result<ServerMessage, RuleError> {
    let candidate = Move::from_uci(uci)?;
    state.board.apply_move(candidate)?;
    state.moves.push(candidate.to_uci());
    state.revision += 1;
    state.red_restart = false;
    state.black_restart = false;
    let game_over = state.board.is_game_over();
    Ok(ServerMessage::Move {
        uci: candidate.to_uci(),
        from: candidate.from,
        to: candidate.to,
        turn: state.board.turn,
        revision: state.revision,
        check: state.board.is_in_check(state.board.turn),
        game_over,
        winner: game_over.then(|| state.board.turn.opponent()),
    })
}

async fn broadcast_presence(room: &Arc<Room>) {
    let state = room.state.lock().await;
    let event = ServerMessage::Presence {
        red_connected: state.connected(Color::Red),
        black_connected: state.connected(Color::Black),
    };
    drop(state);
    let _ = room.events.send(event);
}

async fn send_direct(socket: &mut WebSocket, message: &ServerMessage) -> Result<(), axum::Error> {
    let text = serde_json::to_string(message).expect("server messages are serializable");
    socket.send(Message::Text(text.into())).await
}

fn normalize_room_id(value: &str) -> String {
    value.trim().to_ascii_uppercase()
}

fn random_code(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .filter(|byte| !matches!(*byte, b'0' | b'O' | b'1' | b'I' | b'l'))
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_ascii_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn creates_and_joins_room_with_distinct_seats() {
        let hub = OnlineHub::default();
        let red = hub.create_room().await.unwrap();
        let black = hub.join_room(&red.room_id).await.unwrap();
        assert_eq!(red.color, Color::Red);
        assert_eq!(black.color, Color::Black);
        assert_ne!(red.token, black.token);
        assert!(matches!(
            hub.join_room(&red.room_id).await,
            Err(OnlineError::RoomFull)
        ));
    }

    #[test]
    fn server_rejects_wrong_turn_and_applies_legal_move() {
        let mut state = RoomState {
            board: Board::initial(),
            moves: Vec::new(),
            red: Seat {
                token: "red".into(),
                connections: 0,
            },
            black: Some(Seat {
                token: "black".into(),
                connections: 0,
            }),
            revision: 0,
            red_restart: false,
            black_restart: false,
            touched: Instant::now(),
        };
        assert!(apply_online_move(&mut state, "b2e2").is_ok());
        assert_eq!(state.board.turn, Color::Black);
        assert_eq!(state.revision, 1);
        assert!(apply_online_move(&mut state, "b2e2").is_err());
    }
}
