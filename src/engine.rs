use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::{Mutex, Semaphore},
    time::timeout,
};

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    #[default]
    Medium,
    Hard,
    Master,
}

impl Difficulty {
    fn movetime_ms(self) -> u64 {
        match self {
            Self::Easy => 90,
            Self::Medium => 350,
            Self::Hard => 900,
            Self::Master => 2_000,
        }
    }

    fn multipv(self) -> usize {
        match self {
            Self::Easy => 4,
            Self::Medium => 2,
            Self::Hard | Self::Master => 1,
        }
    }

    fn choose(self, best: String, candidates: &BTreeMap<usize, String>) -> String {
        let width = match self {
            Self::Easy => candidates.len().min(4),
            Self::Medium => candidates.len().min(2),
            Self::Hard | Self::Master => 1,
        };
        if width <= 1 {
            return best;
        }
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos() as usize;
        candidates
            .get(&(nanos % width + 1))
            .cloned()
            .unwrap_or(best)
    }
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Pikafish 未安装或无法启动: {0}")]
    Spawn(String),
    #[error("Pikafish 通信失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("Pikafish 响应超时")]
    Timeout,
    #[error("Pikafish 未返回合法走法")]
    MissingMove,
}

#[derive(Clone)]
pub struct EnginePool {
    config: Arc<EngineConfig>,
    idle: Arc<Mutex<Vec<Pikafish>>>,
    permits: Arc<Semaphore>,
}

struct EngineConfig {
    enabled: bool,
    path: PathBuf,
    nnue: Option<PathBuf>,
    hash_mb: usize,
}

impl EnginePool {
    pub fn from_env() -> Self {
        let enabled = !matches!(
            std::env::var("CHESS_DISABLE_AI").as_deref(),
            Ok("1" | "true" | "yes")
        );
        let (path, nnue) = resolve_engine_paths(
            std::env::var_os("PIKAFISH_PATH").map(PathBuf::from),
            std::env::var_os("PIKAFISH_NNUE").map(PathBuf::from),
            std::env::current_exe().ok().as_deref(),
        );
        let size = std::env::var("CHESS_AI_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2usize)
            .clamp(1, 32);
        let hash_mb = std::env::var("CHESS_AI_HASH_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(32usize)
            .clamp(1, 1024);
        Self {
            config: Arc::new(EngineConfig {
                enabled,
                path,
                nnue,
                hash_mb,
            }),
            idle: Arc::new(Mutex::new(Vec::with_capacity(size))),
            permits: Arc::new(Semaphore::new(size)),
        }
    }

    pub fn configured_path(&self) -> String {
        self.config.path.display().to_string()
    }

    pub fn appears_available(&self) -> bool {
        self.config.enabled && executable_exists(&self.config.path)
    }

    pub async fn best_move(
        &self,
        moves: &[String],
        difficulty: Difficulty,
    ) -> Result<String, EngineError> {
        if !self.config.enabled {
            return Err(EngineError::Spawn("本次启动已禁用 AI".to_owned()));
        }
        let _permit = self
            .permits
            .acquire()
            .await
            .expect("engine semaphore is never closed");
        let mut engine = match self.idle.lock().await.pop() {
            Some(engine) => engine,
            None => Pikafish::spawn(&self.config).await?,
        };
        let result = engine.search(moves, difficulty).await;
        if result.is_ok() {
            self.idle.lock().await.push(engine);
        }
        result
    }
}

#[cfg(windows)]
const PIKAFISH_BINARY: &str = "pikafish.exe";
#[cfg(not(windows))]
const PIKAFISH_BINARY: &str = "pikafish";

fn resolve_engine_paths(
    explicit_path: Option<PathBuf>,
    explicit_nnue: Option<PathBuf>,
    current_exe: Option<&Path>,
) -> (PathBuf, Option<PathBuf>) {
    let bundled_path = current_exe
        .and_then(Path::parent)
        .map(|dir| dir.join("pikafish").join(PIKAFISH_BINARY));
    let path = explicit_path
        .or_else(|| bundled_path.filter(|candidate| candidate.is_file()))
        .unwrap_or_else(|| PathBuf::from(PIKAFISH_BINARY));
    let path = std::fs::canonicalize(&path).unwrap_or(path);

    let sibling_nnue = (path.components().count() > 1)
        .then(|| path.parent().map(|dir| dir.join("pikafish.nnue")))
        .flatten()
        .filter(|candidate| candidate.is_file());
    let nnue = explicit_nnue
        .or(sibling_nnue)
        .map(|path| std::fs::canonicalize(&path).unwrap_or(path));
    (path, nnue)
}

fn executable_exists(path: &Path) -> bool {
    if path.components().count() > 1 {
        return path.is_file();
    }
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(path).is_file()))
}

struct Pikafish {
    _child: Child,
    stdin: ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
}

impl Pikafish {
    async fn spawn(config: &EngineConfig) -> Result<Self, EngineError> {
        let mut command = Command::new(&config.path);
        if let Some(parent) = config.path.parent().filter(|p| !p.as_os_str().is_empty()) {
            command.current_dir(parent);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| EngineError::Spawn(e.to_string()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| EngineError::Spawn("没有 stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| EngineError::Spawn("没有 stdout".into()))?;
        let mut engine = Self {
            _child: child,
            stdin,
            lines: BufReader::new(stdout).lines(),
        };
        engine.send("uci").await?;
        engine.read_until("uciok", Duration::from_secs(5)).await?;
        engine.send("setoption name Threads value 1").await?;
        engine
            .send(&format!("setoption name Hash value {}", config.hash_mb))
            .await?;
        if let Some(nnue) = &config.nnue {
            let nnue_path = nnue.display().to_string();
            if nnue_path.contains(' ') {
                return Err(EngineError::Spawn(format!(
                    "NNUE 路径不能包含空格：{nnue_path}"
                )));
            }
            engine
                .send(&format!("setoption name EvalFile value {}", nnue_path))
                .await?;
        }
        engine.send("isready").await?;
        engine
            .read_until("readyok", Duration::from_secs(10))
            .await?;
        Ok(engine)
    }

    async fn search(
        &mut self,
        moves: &[String],
        difficulty: Difficulty,
    ) -> Result<String, EngineError> {
        self.send(&format!(
            "setoption name MultiPV value {}",
            difficulty.multipv()
        ))
        .await?;
        let position = if moves.is_empty() {
            "position startpos".to_owned()
        } else {
            format!("position startpos moves {}", moves.join(" "))
        };
        self.send(&position).await?;
        self.send(&format!("go movetime {}", difficulty.movetime_ms()))
            .await?;

        let deadline = Duration::from_millis(difficulty.movetime_ms() + 5_000);
        let mut candidates = BTreeMap::new();
        let read = async {
            while let Some(line) = self.lines.next_line().await? {
                if let Some(value) = line.strip_prefix("bestmove ") {
                    let best = value.split_whitespace().next().unwrap_or_default();
                    if best == "(none)" || best == "0000" || best.len() != 4 {
                        return Err(EngineError::MissingMove);
                    }
                    return Ok(difficulty.choose(best.to_owned(), &candidates));
                }
                if line.starts_with("info ") {
                    parse_candidate(&line, &mut candidates);
                }
            }
            Err(EngineError::MissingMove)
        };
        timeout(deadline, read)
            .await
            .map_err(|_| EngineError::Timeout)?
    }

    async fn send(&mut self, command: &str) -> Result<(), EngineError> {
        self.stdin.write_all(command.as_bytes()).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;
        Ok(())
    }

    async fn read_until(&mut self, expected: &str, limit: Duration) -> Result<(), EngineError> {
        let read = async {
            while let Some(line) = self.lines.next_line().await? {
                if line.trim() == expected {
                    return Ok(());
                }
            }
            Err(EngineError::MissingMove)
        };
        timeout(limit, read)
            .await
            .map_err(|_| EngineError::Timeout)?
    }
}

fn parse_candidate(line: &str, candidates: &mut BTreeMap<usize, String>) {
    let tokens: Vec<_> = line.split_whitespace().collect();
    let multipv = tokens.windows(2).find_map(|pair| {
        (pair[0] == "multipv")
            .then(|| pair[1].parse::<usize>().ok())
            .flatten()
    });
    let candidate = tokens
        .windows(2)
        .find_map(|pair| (pair[0] == "pv" && pair[1].len() == 4).then(|| pair[1].to_owned()));
    if let (Some(index), Some(candidate)) = (multipv, candidate) {
        candidates.insert(index, candidate);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_latest_multipv_candidates() {
        let mut candidates = BTreeMap::new();
        parse_candidate(
            "info depth 8 multipv 2 score cp 10 pv h2e2 h7e7",
            &mut candidates,
        );
        parse_candidate(
            "info depth 9 multipv 2 score cp 11 pv b2e2",
            &mut candidates,
        );
        assert_eq!(candidates.get(&2).map(String::as_str), Some("b2e2"));
    }

    #[test]
    fn discovers_engine_and_nnue_next_to_release_binary() {
        let root = std::env::temp_dir().join(format!(
            "chess-cn-engine-discovery-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let engine_dir = root.join("pikafish");
        fs::create_dir_all(&engine_dir).unwrap();
        let engine = engine_dir.join(PIKAFISH_BINARY);
        let nnue = engine_dir.join("pikafish.nnue");
        fs::write(&engine, b"test").unwrap();
        fs::write(&nnue, b"test").unwrap();

        let (resolved_engine, resolved_nnue) =
            resolve_engine_paths(None, None, Some(&root.join("chess-cn-server")));
        assert_eq!(resolved_engine, fs::canonicalize(&engine).unwrap());
        assert_eq!(resolved_nnue, Some(fs::canonicalize(&nnue).unwrap()));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_engine_overrides_bundled_engine() {
        let explicit = PathBuf::from("custom-pikafish");
        let explicit_nnue = PathBuf::from("custom.nnue");
        let (engine, nnue) = resolve_engine_paths(
            Some(explicit.clone()),
            Some(explicit_nnue.clone()),
            Some(Path::new("/ignored/chess-cn-server")),
        );
        assert_eq!(engine, explicit);
        assert_eq!(nnue, Some(explicit_nnue));
    }
}
