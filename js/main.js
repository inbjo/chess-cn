// 主程序: 场景搭建、走子交互、动画、HUD、音效
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as R from './rules.js?v=20260901.3';
import { createPieceMesh } from './pieces.js?v=20260901.3';
import { preloadPieceModels } from './model-assets.js?v=20260901.3';
import { createBoard, createMarkers, createEnvironment, squareToWorld } from './board3d.js?v=20260901.3';
import { FX } from './fx.js?v=20260901.3';
import { probeWasmAi, resetWasmAi, searchWasmAi, uciToMove } from './ai-engine.js?v=20260901.3';

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`界面资源版本不一致，缺少 #${id}，请强制刷新页面`);
  return element;
}

// ---------- 渲染器 / 场景 ----------
const canvas = requiredElement('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  window.__showBootError?.(`无法创建 WebGL 战场：${error.message}`);
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.35 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  window.__showBootError?.('图形上下文已中断，请刷新页面重新进入战场');
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a120c);
scene.fog = new THREE.Fog(0x1a120c, 46, 108);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 21, 34);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, -1);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 14;
controls.maxDistance = 70;
controls.maxPolarAngle = 1.35;

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xc7d5ef, 0x5a351d, 1.25));
const key = new THREE.DirectionalLight(0xffd6a1, 2.65);
key.position.set(16, 26, 12);
key.castShadow = true;
key.shadow.mapSize.set(window.innerWidth < 760 ? 1024 : 1536, window.innerWidth < 760 ? 1024 : 1536);
key.shadow.camera.left = key.shadow.camera.bottom = -22;
key.shadow.camera.right = key.shadow.camera.top = 22;
key.shadow.camera.far = 80;
key.shadow.bias = -0.0008;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb8ff, 1.15);
rim.position.set(-14, 12, -20);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xf0b36d, 0.7);
fill.position.set(-18, 10, 22);
scene.add(fill);
const accent = new THREE.PointLight(0xff6038, 14, 44, 1.7);
accent.position.set(0, 7, 0);
scene.add(accent);

// ---------- 棋盘 / 环境 ----------
scene.add(createBoard());
const env = createEnvironment();
scene.add(env.group);
const markers = createMarkers();
scene.add(markers.group);
const fx = new FX(scene);

// ---------- 游戏状态 ----------
const piecesGroup = new THREE.Group();
scene.add(piecesGroup);

const pageParams = new URLSearchParams(location.search);
const demoType = pageParams.get('demo');
const demoSide = pageParams.get('side') === R.BLACK ? R.BLACK : R.RED;
const deterministicTestMode = pageParams.get('test') === '1';
const DEMO_TYPES = new Set(['general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon', 'soldier']);

function createAttackDemoState(type, attackingColor = R.RED) {
  const redGeneral = { id: 80, type: 'general', color: R.RED, row: 9, col: 4 };
  const blackGeneral = { id: 90, type: 'general', color: R.BLACK, row: 0, col: 4 };
  const fixtures = {
    general: attackingColor === R.BLACK ? [
      { id: 10, type: 'general', color: R.BLACK, row: 1, col: 4 },
      { id: 20, type: 'cannon', color: R.RED, row: 2, col: 4 },
      redGeneral,
      { id: 30, type: 'soldier', color: R.RED, row: 5, col: 4 },
    ] : [
      { id: 10, type: 'general', color: R.RED, row: 8, col: 4 },
      { id: 20, type: 'cannon', color: R.BLACK, row: 7, col: 4 },
      blackGeneral,
      { id: 30, type: 'soldier', color: R.BLACK, row: 4, col: 4 },
    ],
    advisor: [
      { id: 10, type: 'advisor', color: R.RED, row: 8, col: 4 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 7, col: 3 },
      redGeneral, blackGeneral,
      { id: 30, type: 'soldier', color: R.RED, row: 5, col: 4 },
    ],
    elephant: [
      { id: 10, type: 'elephant', color: R.RED, row: 7, col: 2 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 5, col: 4 },
      redGeneral, blackGeneral,
    ],
    horse: [
      { id: 10, type: 'horse', color: R.RED, row: 6, col: 3 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 4, col: 4 },
      redGeneral, blackGeneral,
    ],
    chariot: [
      { id: 10, type: 'chariot', color: R.RED, row: 7, col: 3 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 3, col: 3 },
      redGeneral, blackGeneral,
      { id: 30, type: 'soldier', color: R.RED, row: 5, col: 4 },
    ],
    cannon: [
      { id: 10, type: 'cannon', color: R.RED, row: 7, col: 3 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 2, col: 3 },
      redGeneral, blackGeneral,
      { id: 30, type: 'soldier', color: R.RED, row: 5, col: 3 },
      { id: 31, type: 'soldier', color: R.RED, row: 5, col: 4 },
    ],
    soldier: [
      { id: 10, type: 'soldier', color: R.RED, row: 5, col: 5 },
      { id: 20, type: 'soldier', color: R.BLACK, row: 4, col: 5 },
      redGeneral, blackGeneral,
      { id: 30, type: 'soldier', color: R.RED, row: 5, col: 4 },
    ],
  };
  return { pieces: fixtures[type].map(piece => ({ ...piece })), turn: attackingColor, history: [], lastMove: null };
}

let state = DEMO_TYPES.has(demoType) ? createAttackDemoState(demoType, demoSide) : R.createInitialState();
let meshById = new Map();   // pieceId -> THREE.Group
const pieceHitAreas = [];
let selected = null;        // 当前选中棋子
let selectedMoves = [];
let gameOver = false;
let actionPhase = 'idle';
let lastAttackType = null;
let gameMode = 'ai';
let aiEngine = 'godogpaw';
let aiDifficulty = 'easy';
let aiThinking = false;
let aiRequestVersion = 0;
let online = null;
let onlineReconnectTimer = null;
let onlineMovePending = false;
const onlineEventQueue = [];
const tweens = [];
const generalCinematicEl = document.getElementById('generalCinematic');
const cinematicGlyph = document.getElementById('cinematicGlyph');
let generalCinematic = null;

function buildAllPieces() {
  for (const p of state.pieces) {
    const mesh = createPieceMesh(p.type, p.color);
    mesh.rotation.y = p.color === R.RED ? Math.PI : 0; // 面向对方
    const { x, y, z } = squareToWorld(p.row, p.col);
    mesh.position.set(x, y, z);
    mesh.userData.pieceId = p.id;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    mesh.userData.baseFacing = p.color === R.RED ? Math.PI : 0;
    piecesGroup.add(mesh);
    meshById.set(p.id, mesh);
    pieceHitAreas.push(mesh.userData.hitArea);
  }
  renderer.shadowMap.needsUpdate = true;
}

function disposeOwnedPieceMaterials(mesh) {
  for (const material of mesh.userData.ownedMaterials || []) material.dispose();
  mesh.userData.ownedMaterials = [];
}

function installGameState(nextState) {
  cancelGeneralCinematic();
  aiRequestVersion++;
  resetWasmAi();
  aiThinking = false;
  state = nextState;
  gameOver = false;
  selected = null;
  selectedMoves = [];
  actionPhase = 'idle';
  lastAttackType = null;
  tweens.length = 0;
  fx.clear();
  for (const mesh of meshById.values()) disposeOwnedPieceMaterials(mesh);
  while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);
  meshById.clear();
  pieceHitAreas.length = 0;
  markers.clear();
  buildAllPieces();
  document.getElementById('overlay').classList.remove('show');
  refreshHUD();
  refreshBattleControls();
}

function resetGame() {
  installGameState(R.createInitialState());
}

// ---------- HUD ----------
const turnBadge = document.getElementById('turnBadge');
const checkBanner = document.getElementById('checkBanner');
const hint = document.getElementById('hint');

function refreshHUD() {
  const red = state.turn === R.RED;
  turnBadge.textContent = red ? '红方行棋' : '黑方行棋';
  turnBadge.className = 'turn ' + (red ? 'red' : 'black');
  accent.color.set(red ? 0xff5030 : 0x3f7fff);
  // 战利品: 初始各 16 子，缺员即被对方所吃
  const capRed = [], capBlack = []; // 红方吃掉的黑子 / 黑方吃掉的红子
  const blacks = state.pieces.filter(p => p.color === R.BLACK);
  const reds = state.pieces.filter(p => p.color === R.RED);
  capRed.push(...missing(R.BLACK, blacks));
  capBlack.push(...missing(R.RED, reds));
  document.getElementById('capRed').innerHTML = capRed.map(g => `<span class="chip black">${g}</span>`).join('') || '<span class="none">—</span>';
  document.getElementById('capBlack').innerHTML = capBlack.map(g => `<span class="chip red">${g}</span>`).join('') || '<span class="none">—</span>';
}

const modeButtons = [...document.querySelectorAll('.mode-option')];
if (modeButtons.length !== 3) throw new Error('界面资源版本不一致，缺少对弈模式按钮，请强制刷新页面');
const aiControls = requiredElement('aiControls');
const aiEngineSelect = requiredElement('aiEngineSelect');
const aiDifficultySelect = requiredElement('aiDifficultySelect');
const aiStatus = requiredElement('aiStatus');
const difficultyNames = { easy: '入门', medium: '中等', hard: '困难', master: '大师' };

function aiEngineName(engine = aiEngine) {
  return engine === 'pikafish' ? 'Pikafish' : 'godogpaw WASM';
}

function refreshBattleControls(status = null) {
  const aiMode = gameMode === 'ai';
  const onlineMode = gameMode === 'online';
  for (const button of modeButtons) {
    const active = button.dataset.mode === gameMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  aiControls.hidden = !aiMode;
  aiEngineSelect.value = aiEngine;
  aiDifficultySelect.value = aiDifficulty;
  aiEngineSelect.disabled = aiThinking;
  aiDifficultySelect.disabled = aiThinking;
  aiStatus.className = 'ai-status';
  aiStatus.title = aiMode ? `正在检测 ${aiEngineName()}` : onlineMode ? '正在连接联机房间' : '本地双人模式';
  if (onlineMode) {
    const ready = online?.connected && online?.opponentConnected;
    aiStatus.classList.add(ready ? 'online' : 'waiting');
    aiStatus.title = ready ? '双方已连接' : online ? '等待对手或正在重连' : '请选择创建或加入房间';
    return;
  }
  if (aiThinking) {
    aiStatus.classList.add('thinking');
    aiStatus.title = `${aiEngineName()} 正在推演`;
  } else if (status === 'ready') {
    aiStatus.classList.add('ready');
    aiStatus.title = `${aiEngineName()} 已就绪`;
  } else if (status === 'error') {
    aiStatus.classList.add('error');
    aiStatus.title = `${aiEngineName()} 不可用`;
  }
}

let hintTimer = null;
function battleHint(message, error = false) {
  clearTimeout(hintTimer);
  hint.textContent = message;
  hint.classList.toggle('error', error);
  hintTimer = setTimeout(() => {
    hint.textContent = !gameOver && isHumanTurn() && R.isInCheck(state.pieces, state.turn)
      ? '当前被将军 · 请移动绿色高亮棋子解将'
      : gameMode === 'ai'
        ? '你执红先行 · 黑方由电脑应战'
        : gameMode === 'online'
          ? onlineHintText()
          : '点击己方棋子查看可走位置 · 拖拽旋转视角';
    hint.classList.remove('error');
  }, 3200);
}

function moveToUci(move) {
  const square = pos => String.fromCharCode(97 + pos.col) + (9 - pos.row);
  return square(move.from) + square(move.to);
}

function isHumanTurn() {
  if (gameMode === 'ai') return state.turn === R.RED;
  if (gameMode === 'online') {
    return !!online?.connected && !!online.opponentConnected && !onlineMovePending && state.turn === online.color;
  }
  return true;
}

function onlineHintText() {
  if (!online?.connected) return '联机中断 · 正在重连军帐';
  if (!online.opponentConnected) return `军帐 ${online.roomId} · 等待对手加入`;
  return state.turn === online.color ? `军帐 ${online.roomId} · 轮到你行棋` : `军帐 ${online.roomId} · 等待对手落子`;
}

function parseUci(uci) {
  const square = (file, rank) => ({ col: file.charCodeAt(0) - 97, row: 9 - Number(rank) });
  return { from: square(uci[0], uci[1]), to: square(uci[2], uci[3]) };
}

function stateFromMoves(moves) {
  const next = R.createInitialState();
  for (const uci of moves) {
    const move = parseUci(uci);
    const piece = R.pieceAt(next.pieces, move.from.row, move.from.col);
    if (!piece || !R.legalMoves(next.pieces, piece).some(m => m.row === move.to.row && m.col === move.to.col)) {
      throw new Error(`服务端棋谱无法重放：${uci}`);
    }
    R.applyMove(next, piece, move.to);
  }
  return next;
}

const onlineDialog = document.getElementById('onlineDialog');
const onlineMessage = document.getElementById('onlineMessage');
const roomCodeInput = document.getElementById('roomCode');
const roomTicket = document.getElementById('roomTicket');
const activeRoomCode = document.getElementById('activeRoomCode');
const roomSeat = document.getElementById('roomSeat');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const joinRoomForm = document.getElementById('joinRoomForm');

function showOnlineDialog() {
  onlineDialog.classList.add('show');
  onlineDialog.setAttribute('aria-hidden', 'false');
  onlineMessage.classList.remove('error');
  if (online) showRoomTicket();
  else roomTicket.hidden = true;
}

function hideOnlineDialog() {
  onlineDialog.classList.remove('show');
  onlineDialog.setAttribute('aria-hidden', 'true');
}

function showRoomTicket() {
  if (!online) return;
  roomTicket.hidden = false;
  activeRoomCode.textContent = online.roomId;
  const side = online.color === R.RED ? '红方' : '黑方';
  roomSeat.textContent = `${side} · ${online.opponentConnected ? '敌军已入帐' : '等待敌军'}`;
}

function setOnlineBusy(busy) {
  btnCreateRoom.disabled = busy;
  joinRoomForm.querySelector('button').disabled = busy;
}

async function requestRoom(path) {
  setOnlineBusy(true);
  onlineMessage.classList.remove('error');
  onlineMessage.textContent = '正在传递军令……';
  try {
    const response = await fetch(path, { method: 'POST', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    connectOnline(payload);
  } catch (error) {
    onlineMessage.textContent = error.message || '联机军令传递失败';
    onlineMessage.classList.add('error');
    showOnlineDialog();
  } finally {
    setOnlineBusy(false);
  }
}

function connectOnline(ticket) {
  leaveOnline(false);
  gameMode = 'online';
  online = {
    roomId: ticket.room_id,
    token: ticket.token,
    color: ticket.color,
    revision: 0,
    connected: false,
    opponentConnected: false,
    socket: null,
    reconnectAttempt: 0,
  };
  sessionStorage.setItem(`chess-room-${online.roomId}`, JSON.stringify(ticket));
  const url = new URL(location.href);
  url.searchParams.set('room', online.roomId);
  history.replaceState(null, '', url);
  installGameState(R.createInitialState());
  showRoomTicket();
  openOnlineSocket();
}

function leaveOnline(clearUrl = true) {
  clearTimeout(onlineReconnectTimer);
  onlineReconnectTimer = null;
  if (online?.socket) {
    online.socket.onclose = null;
    online.socket.close();
  }
  online = null;
  onlineMovePending = false;
  onlineEventQueue.length = 0;
  if (clearUrl) {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
}

function openOnlineSocket() {
  if (!online || gameMode !== 'online') return;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${scheme}//${location.host}/api/rooms/${online.roomId}/ws?token=${encodeURIComponent(online.token)}`);
  online.socket = socket;
  refreshBattleControls();
  socket.addEventListener('open', () => {
    if (!online || online.socket !== socket) return;
    online.connected = true;
    online.reconnectAttempt = 0;
    refreshBattleControls();
  });
  socket.addEventListener('message', event => {
    if (!online || online.socket !== socket) return;
    try { handleOnlineEvent(JSON.parse(event.data)); }
    catch (error) { battleHint(error.message || '联机消息解析失败', true); }
  });
  socket.addEventListener('close', () => {
    if (!online || online.socket !== socket || gameMode !== 'online') return;
    online.connected = false;
    onlineMovePending = false;
    refreshBattleControls();
    battleHint('联机中断，正在重新连接……', true);
    const delay = Math.min(8000, 700 * (2 ** online.reconnectAttempt++));
    onlineReconnectTimer = setTimeout(openOnlineSocket, delay);
  });
}

function handleOnlineEvent(event) {
  if (!online) return;
  if (event.type === 'snapshot') {
    online.revision = event.revision;
    online.color = event.color;
    online.opponentConnected = event.opponent_connected;
    onlineMovePending = false;
    onlineEventQueue.length = 0;
    installGameState(stateFromMoves(event.moves));
    showRoomTicket();
    setCameraForSide(online.color);
    if (online.color === R.BLACK || online.opponentConnected) hideOnlineDialog();
    battleHint(onlineHintText());
    if (event.game_over) showOnlineResult(event);
  } else if (event.type === 'presence') {
    online.opponentConnected = online.color === R.RED ? event.black_connected : event.red_connected;
    showRoomTicket();
    if (online.opponentConnected) hideOnlineDialog();
    refreshBattleControls();
    battleHint(onlineHintText());
  } else if (event.type === 'move') {
    if (event.revision <= online.revision) return;
    online.revision = event.revision;
    onlineMovePending = false;
    onlineEventQueue.push(event);
    drainOnlineMoves();
  } else if (event.type === 'restarted') {
    online.revision = event.revision;
    onlineMovePending = false;
    onlineEventQueue.length = 0;
    installGameState(R.createInitialState());
    battleHint('双方军令已齐，新局开始');
  } else if (event.type === 'restart_pending') {
    const mine = event.color === online.color;
    battleHint(mine ? '已请求重开，等待对手同意' : '对手请求重开，点击“重开”同意');
  } else if (event.type === 'error') {
    onlineMovePending = false;
    battleHint(event.message || '联机操作失败', true);
    if (event.code === 'stale_revision') {
      online.socket?.close();
    } else if (event.code === 'unauthorized' || event.code === 'room_not_found') {
      online.socket.onclose = null;
      online.socket.close();
      online.connected = false;
      onlineMessage.textContent = event.message || '房间凭证已经失效';
      onlineMessage.classList.add('error');
      showOnlineDialog();
    }
  }
  refreshBattleControls();
}

function drainOnlineMoves() {
  const event = onlineEventQueue[0];
  if (!event) return;
  if (actionPhase !== 'idle' || tweens.length) {
    setTimeout(drainOnlineMoves, 80);
    return;
  }
  onlineEventQueue.shift();
  const piece = R.pieceAt(state.pieces, event.from.row, event.from.col);
  if (!piece) {
    battleHint('本地棋盘与房间不同步，正在重连', true);
    online.socket?.close();
    return;
  }
  doMove(piece, event.to);
  setTimeout(drainOnlineMoves, 80);
}

function showOnlineResult(event) {
  showResult({ winner: event.winner, check: event.check });
}

function sendOnlineMove(piece, to) {
  if (!online?.connected || online.socket?.readyState !== WebSocket.OPEN) {
    battleHint('尚未连接到联机军帐', true);
    return;
  }
  onlineMovePending = true;
  online.socket.send(JSON.stringify({
    type: 'move',
    uci: moveToUci({ from: piece, to }),
    revision: online.revision,
  }));
  selected = null;
  selectedMoves = [];
  markers.clear();
  battleHint('军令已发出 · 等待服务端裁决');
}

async function probeAi() {
  const engine = aiEngine;
  const difficulty = aiDifficulty;
  try {
    if (engine === 'godogpaw') {
      await probeWasmAi();
      if (gameMode !== 'ai' || engine !== aiEngine || difficulty !== aiDifficulty) return false;
      refreshBattleControls('ready');
      return true;
    }
    const response = await fetch('/api/ai/status', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Pikafish 需要 Rust 服务');
    const status = await response.json();
    if (gameMode !== 'ai' || engine !== aiEngine || difficulty !== aiDifficulty) return false;
    refreshBattleControls(status.available ? 'ready' : 'error');
    if (!status.available) battleHint('未找到 Pikafish，请配置 PIKAFISH_PATH', true);
    return status.available;
  } catch (error) {
    if (gameMode !== 'ai' || engine !== aiEngine || difficulty !== aiDifficulty) return false;
    refreshBattleControls('error');
    battleHint(error.message || `${aiEngineName(engine)} 不可用`, true);
    return false;
  }
}

async function maybeRequestAiMove() {
  if (gameMode !== 'ai' || state.turn !== R.BLACK || gameOver || aiThinking) return;
  const requestVersion = ++aiRequestVersion;
  const engine = aiEngine;
  const difficulty = aiDifficulty;
  const moves = state.history.map(moveToUci);
  aiThinking = true;
  actionPhase = 'ai-thinking';
  refreshBattleControls();
  battleHint('黑方军师正在推演……');
  try {
    let result;
    if (engine === 'pikafish') {
      const response = await fetch('/api/ai/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ moves, difficulty }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `AI 请求失败（${response.status}）`);
      result = { from: payload.from, to: payload.to };
    } else {
      result = uciToMove(await searchWasmAi(moves, difficulty));
    }
    if (requestVersion !== aiRequestVersion || gameMode !== 'ai' || engine !== aiEngine || difficulty !== aiDifficulty) return;
    const { from, to } = result;
    const piece = state.pieces.find(p => p.row === from.row && p.col === from.col && p.color === R.BLACK);
    const legal = piece && R.legalMoves(state.pieces, piece)
      .some(move => move.row === to.row && move.col === to.col);
    if (!piece || !legal) throw new Error('AI 返回的棋步与前端状态不一致');
    aiThinking = false;
    actionPhase = 'idle';
    refreshBattleControls('ready');
    doMove(piece, to);
  } catch (error) {
    if (requestVersion !== aiRequestVersion) return;
    aiThinking = false;
    actionPhase = 'idle';
    refreshBattleControls('error');
    battleHint(error.message || '军师暂时无法落子', true);
  }
}

function missing(color, present) {
  const init = { general: 1, advisor: 2, elephant: 2, horse: 2, chariot: 2, cannon: 2, soldier: 5 };
  for (const p of present) init[p.type]--;
  const out = [];
  for (const [type, n] of Object.entries(init)) {
    for (let i = 0; i < n; i++) out.push(R.GLYPH[color][type]);
  }
  return out;
}

let bannerTimer = null;
function showCheckBanner() {
  checkBanner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => checkBanner.classList.remove('show'), 1600);
}

function showResult(status) {
  gameOver = true;
  const redWin = status.winner === R.RED;
  document.getElementById('resultText').textContent = redWin ? '紅方大勝' : '黑方大勝';
  document.getElementById('resultText').style.color = redWin ? '#ff6a55' : '#7fa8ff';
  document.getElementById('resultSub').textContent = status.check ? '绝杀无解' : '困毙无棋';
  document.getElementById('overlay').classList.add('show');
}

function legalResponsePieces() {
  return state.pieces.filter(piece => piece.color === state.turn && R.legalMoves(state.pieces, piece).length);
}

function showCheckResponses(prefix = '将军') {
  const responses = legalResponsePieces();
  if (!responses.length) {
    showResult(R.gameStatus(state));
    return responses;
  }
  markers.responsePieces(responses);
  const names = [...new Set(responses.map(piece => R.GLYPH[piece.color][piece.type]))].join('、');
  battleHint(`${prefix} · 仅绿色高亮棋子可以解将：${names}`);
  return responses;
}

// ---------- 音效 (WebAudio 合成) ----------
let AC = null;
function audio() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'triangle', gain = 0.12, delay = 0) {
  try {
    const ac = audio();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    const t0 = ac.currentTime + delay;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (_) { /* 无音频环境时静默 */ }
}
const sndSelect = () => tone(640, 0.08, 'triangle', 0.08);
const sndMove = () => { tone(220, 0.12, 'square', 0.06); tone(440, 0.1, 'triangle', 0.08, 0.05); };
const sndCapture = () => { tone(90, 0.3, 'sawtooth', 0.14); tone(180, 0.2, 'square', 0.08, 0.04); };
const sndFire = () => { tone(72, 0.22, 'square', 0.17); tone(210, 0.11, 'sawtooth', 0.1); tone(620, 0.05, 'triangle', 0.08); };
const sndBoom = () => { tone(55, 0.62, 'sawtooth', 0.24); tone(38, 0.7, 'square', 0.13, 0.04); tone(420, 0.09, 'triangle', 0.1); };
const sndHit = () => { tone(150, 0.14, 'square', 0.11); tone(310, 0.1, 'triangle', 0.09, 0.03); };
const sndGeneral = () => { tone(118, 0.28, 'square', 0.1); tone(760, 0.16, 'triangle', 0.12, 0.05); };
const sndAdvisor = () => { tone(740, 0.08, 'triangle', 0.08); tone(980, 0.09, 'triangle', 0.08, 0.1); };
const sndElephant = () => { tone(72, 0.38, 'sine', 0.2); tone(128, 0.2, 'square', 0.08, 0.02); };
const sndHorse = () => { tone(460, 0.08, 'sawtooth', 0.09); tone(105, 0.2, 'square', 0.1, 0.08); };
const sndChariot = () => { tone(82, 0.3, 'sawtooth', 0.12); tone(190, 0.13, 'square', 0.1, 0.1); };
const sndSoldier = () => { tone(260, 0.08, 'square', 0.08); tone(520, 0.07, 'triangle', 0.07, 0.08); };
const sndCheck = () => { tone(520, 0.16, 'triangle', 0.14); tone(784, 0.22, 'triangle', 0.14, 0.14); };

// ---------- 走子 / 攻击动画 ----------
function animateMove(mesh, to, arc, onDone, dur = 0.5, delay = 0) {
  tweens.push({ mesh, from: mesh.position.clone(), to, t: 0, dur, arc, delay, onDone });
}
function schedule(delay, onDone) {
  tweens.push({ t: 0, dur: Math.max(delay, 0.001), delay: 0, onDone });
}
function animateRotation(owner, node, axis, to, dur = 0.18, onDone = null, delay = 0) {
  if (!node) { schedule(delay + dur, onDone); return; }
  const from = node.rotation[axis];
  tweens.push({
    mesh: owner, t: 0, dur, delay, onDone,
    update: e => { node.rotation[axis] = THREE.MathUtils.lerp(from, to, e); },
  });
}
function animatePosition(owner, node, axis, to, dur = 0.18, onDone = null, delay = 0) {
  if (!node) { schedule(delay + dur, onDone); return; }
  const from = node.position[axis];
  tweens.push({
    mesh: owner, t: 0, dur, delay, onDone,
    update: e => { node.position[axis] = THREE.MathUtils.lerp(from, to, e); },
  });
}
function setOpacity(mesh, v) {
  mesh.traverse(o => {
    if (o.isMesh || o.isSprite) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.opacity = v; });
  });
}
function makeFadable(mesh) {
  if (mesh.userData.hasFadableMaterials) return;
  const ownedMaterials = mesh.userData.ownedMaterials || [];
  mesh.traverse(o => {
    if (o.isMesh || o.isSprite) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        m.transparent = true;
        ownedMaterials.push(m);
      });
    }
  });
  mesh.userData.ownedMaterials = ownedMaterials;
  mesh.userData.hasFadableMaterials = true;
}
// 被吃棋子击飞: 抛起 + 翻滚 + 淡出
function flingPiece(mesh, dir, style, onDone = null) {
  makeFadable(mesh);
  const profiles = {
    blast:   { up: 3.4, away: 3.6, dur: 0.7, spin: true },
    general: { up: 1.8, away: 2.45, dur: 0.72, spin: true },
    advisor: { up: 1.15, away: 1.65, dur: 0.58, spin: true },
    quake:   { up: 0.62, away: 0.95, dur: 0.66, spin: false },
    pierce:  { up: 0.82, away: 2.55, dur: 0.58, spin: false },
    ram:     { up: 1.45, away: 3.1, dur: 0.64, spin: true },
    soldier: { up: 0.68, away: 1.5, dur: 0.5, spin: false },
    stomp:   { up: 0.9, away: 1.2, dur: 0.7, spin: false },
    slash:   { up: 1.7, away: 2.3, dur: 0.7, spin: true },
  };
  const profile = profiles[style] || profiles.slash;
  const { up, away } = profile;
  const to = mesh.position.clone().addScaledVector(dir, away);
  tweens.push({
    mesh, from: mesh.position.clone(), to, t: 0, dur: profile.dur, arc: up,
    fade: true, spin: profile.spin,
    onDone: () => {
      piecesGroup.remove(mesh);
      const hitIndex = pieceHitAreas.indexOf(mesh.userData.hitArea);
      if (hitIndex >= 0) pieceHitAreas.splice(hitIndex, 1);
      onDone?.();
    },
  });
}

function faceDirection(mesh, dir) {
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
}

function restoreFacing(mesh) {
  mesh.rotation.y = mesh.userData.baseFacing;
}

function startGeneralCinematic(attacker, target, color) {
  cancelGeneralCinematic();
  const direction = target.position.clone().sub(attacker.position).setY(0).normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x)
    .multiplyScalar(color === R.RED ? 1 : -1);
  // 特写以主将胸口为中心，而不是攻击双方的中点；否则棋盘会占据大部分画面。
  const focus = attacker.position.clone().addScaledVector(direction, 0.28);
  focus.y = squareToWorld(0, 0).y + 1.5;
  generalCinematic = {
    attacker,
    target,
    direction,
    side,
    focus,
    elapsed: 0,
    impactTime: -1,
    returning: false,
    returnTime: 0,
    savedPosition: camera.position.clone(),
    savedTarget: controls.target.clone(),
    savedFov: camera.fov,
    savedExposure: renderer.toneMappingExposure,
    controlsEnabled: controls.enabled,
    onDone: null,
  };
  controls.enabled = false;
  generalCinematicEl.dataset.side = color;
  cinematicGlyph.textContent = color === R.RED ? '帥' : '將';
  generalCinematicEl.classList.remove('impact');
  generalCinematicEl.classList.add('active');
  generalCinematicEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('general-cinematic-active');
}

function triggerGeneralImpact() {
  if (!generalCinematic) return;
  generalCinematic.impactTime = 0;
  generalCinematicEl.classList.remove('impact');
  // 允许连续演示时重新触发闪光与震屏动画。
  void generalCinematicEl.offsetWidth;
  generalCinematicEl.classList.add('impact');
}

function endGeneralCinematic(onDone) {
  if (!generalCinematic) {
    onDone?.();
    return;
  }
  generalCinematic.returning = true;
  generalCinematic.returnTime = 0;
  generalCinematic.returnPosition = camera.position.clone();
  generalCinematic.returnTarget = generalCinematic.focus.clone();
  generalCinematic.returnFov = camera.fov;
  generalCinematic.returnExposure = renderer.toneMappingExposure;
  generalCinematic.onDone = onDone;
  generalCinematicEl.classList.remove('impact');
}

function cancelGeneralCinematic() {
  if (!generalCinematic) return;
  camera.position.copy(generalCinematic.savedPosition);
  camera.fov = generalCinematic.savedFov;
  camera.updateProjectionMatrix();
  renderer.toneMappingExposure = generalCinematic.savedExposure;
  controls.target.copy(generalCinematic.savedTarget);
  controls.enabled = generalCinematic.controlsEnabled;
  generalCinematic = null;
  generalCinematicEl.classList.remove('active', 'impact');
  generalCinematicEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('general-cinematic-active');
}

function updateGeneralCinematic(dt) {
  const cinematic = generalCinematic;
  if (!cinematic) return;

  if (cinematic.returning) {
    cinematic.returnTime += dt;
    const p = Math.min(cinematic.returnTime / 0.62, 1);
    const e = easeInOut(p);
    camera.position.lerpVectors(cinematic.returnPosition, cinematic.savedPosition, e);
    const lookAt = cinematic.returnTarget.clone().lerp(cinematic.savedTarget, e);
    camera.fov = THREE.MathUtils.lerp(cinematic.returnFov, cinematic.savedFov, e);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(cinematic.returnExposure, cinematic.savedExposure, e);
    camera.updateProjectionMatrix();
    camera.lookAt(lookAt);
    if (p < 1) return;

    const done = cinematic.onDone;
    camera.position.copy(cinematic.savedPosition);
    camera.fov = cinematic.savedFov;
    camera.updateProjectionMatrix();
    renderer.toneMappingExposure = cinematic.savedExposure;
    controls.target.copy(cinematic.savedTarget);
    controls.enabled = cinematic.controlsEnabled;
    generalCinematic = null;
    generalCinematicEl.classList.remove('active', 'impact');
    generalCinematicEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('general-cinematic-active');
    done?.();
    return;
  }

  cinematic.elapsed += dt;
  const intro = Math.min(cinematic.elapsed / 0.28, 1);
  const orbit = Math.min(Math.max((cinematic.elapsed - 0.16) / 0.62, 0), 1);
  const orbitEase = easeInOut(orbit);
  if (cinematic.impactTime >= 0) {
    // 命中后锁定获胜主将的上半身，不追随被击飞目标。
    const heroFocus = cinematic.attacker.position.clone().addScaledVector(cinematic.direction, 0.18);
    heroFocus.y = squareToWorld(0, 0).y + 1.62;
    cinematic.focus.lerp(heroFocus, Math.min(dt * 7.2, 1));
  }
  const impactPush = cinematic.impactTime < 0
    ? 0
    : easeOut(Math.min(cinematic.impactTime / 0.22, 1));
  const portraitCompensation = camera.aspect < 0.9 ? 1.22 : 1;
  // 主体在蓄力时约占 75% 屏高，命中后继续推进至近乎满屏。
  const sideDistance = THREE.MathUtils.lerp(6.2, 4.8, orbitEase)
    * THREE.MathUtils.lerp(1, 0.82, impactPush)
    * portraitCompensation;
  // 机位越过目标一侧回拍主将，确保特写看到面部而不是后脑与背甲。
  const alongDistance = THREE.MathUtils.lerp(5.5, 4.3, orbitEase)
    * THREE.MathUtils.lerp(1, 0.82, impactPush);
  const height = THREE.MathUtils.lerp(3.2, 2.3, orbitEase)
    - 0.1 * impactPush;
  const shotPosition = cinematic.focus.clone()
    .addScaledVector(cinematic.side, sideDistance)
    .addScaledVector(cinematic.direction, alongDistance);
  shotPosition.y += height;
  const cameraPosition = cinematic.savedPosition.clone().lerp(shotPosition, easeInOut(intro));

  if (cinematic.impactTime >= 0) {
    cinematic.impactTime += dt;
    const shakeP = Math.min(cinematic.impactTime / 0.3, 1);
    const strength = (1 - shakeP) * 0.24;
    cameraPosition.addScaledVector(cinematic.side, Math.sin(shakeP * 79) * strength);
    cameraPosition.y += Math.sin(shakeP * 113) * strength * 0.55;
  }

  camera.position.copy(cameraPosition);
  const closeupFov = THREE.MathUtils.lerp(32, 27, impactPush);
  camera.fov = THREE.MathUtils.lerp(cinematic.savedFov, closeupFov, easeInOut(intro));
  camera.updateProjectionMatrix();
  camera.lookAt(cinematic.focus);
  const flash = cinematic.impactTime >= 0 ? Math.max(0, 1 - cinematic.impactTime / 0.22) : 0;
  renderer.toneMappingExposure = cinematic.savedExposure * (1 + 0.13 * intro + 0.22 * flash);
}

const ATTACK_COLOR = {
  red: {
    general: 0xffd36a, advisor: 0xffd7b0, elephant: 0x91d0a5,
    horse: 0xffefc2, chariot: 0xffa95c, cannon: 0xffc060, soldier: 0xff6650,
  },
  black: {
    general: 0xb9d9ff, advisor: 0xcfe8ff, elephant: 0x8fcbb8,
    horse: 0xbddcff, chariot: 0x85b7e8, cannon: 0x9fc8ff, soldier: 0x78aee8,
  },
};

function setAttackPhase(type, stage) {
  lastAttackType = type;
  actionPhase = `${type}-${stage}`;
}
function arcFor(type) {
  return type === 'horse' ? 1.7 : type === 'elephant' ? 0.45 : type === 'soldier' ? 0.85 : 0.7;
}

function doMove(piece, to) {
  const mesh = meshById.get(piece.id);
  if (!mesh) {
    console.error(`Missing visual mesh for piece ${piece.id}`);
    return;
  }
  const captured = R.applyMove(state, piece, to);
  selected = null;
  selectedMoves = [];
  markers.clear();

  const dst = squareToWorld(to.row, to.col);
  const dstV = new THREE.Vector3(dst.x, dst.y, dst.z);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    restoreFacing(mesh);
    actionPhase = 'idle';
    const status = R.gameStatus(state);
    refreshHUD();
    markers.clear();
    if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
    if (status.over) {
      sndCheck();
      showResult(status);
    } else if (status.check) {
      sndCheck();
      showCheckBanner();
      if (isHumanTurn()) showCheckResponses();
    }
    if (!status.over) maybeRequestAiMove();
  };

  // 普通移动: 跳跃落位
  if (!captured) {
    actionPhase = 'moving';
    sndMove();
    animateMove(mesh, dstV, arcFor(piece.type), finish);
    return;
  }

  // 吃子: 按兵种演出攻击动画，再落位
  setAttackPhase(piece.type, 'windup');
  const capMesh = meshById.get(captured.id);
  if (!capMesh) {
    console.error(`Missing visual mesh for captured piece ${captured.id}`);
    mesh.position.copy(dstV);
    finish();
    return;
  }
  const capPos = capMesh.position.clone();
  const dir = dstV.clone().sub(mesh.position).setY(0).normalize();
  const effectColor = ATTACK_COLOR[piece.color][piece.type];
  faceDirection(mesh, dir);

  if (piece.type === 'cannon') {
    // 炮: 瞄准蓄势 -> 后座点火 -> 炮弹命中 -> 敌子消散 -> 炮再推进落位
    const rig = mesh.userData.rig || {};
    const barrel = rig.barrel;
    const barrelRest = barrel?.rotation.x ?? 0;
    const backPos = mesh.position.clone().addScaledVector(dir, -0.42);
    const target = capPos.clone();
    target.y += 1.15;

    animateRotation(mesh, barrel, 'x', barrelRest - 0.1, 0.14, () => {
      animateMove(mesh, backPos, 0.08, () => {
        const muzzle = new THREE.Vector3();
        if (rig.muzzle) {
          rig.muzzle.getWorldPosition(muzzle);
        } else {
          muzzle.copy(mesh.position).addScaledVector(dir, 1.15);
          muzzle.y += 1.65;
        }
        setAttackPhase('cannon', 'flight');
        sndFire();
        fx.muzzleFlash(muzzle, dir);
        animateRotation(mesh, barrel, 'x', barrelRest, 0.18);
        fx.cannonShot(muzzle, target, () => {
          setAttackPhase('cannon', 'impact');
          sndBoom();
          flingPiece(capMesh, dir, 'blast', () => {
            setAttackPhase('cannon', 'advance');
            animateMove(mesh, dstV, 0.48, finish, 0.52);
          });
        });
      }, 0.16);
    });
  } else if (piece.type === 'chariot') {
    // 车: 轮辙速度线 -> 贴地冲锋 -> 扇形撞击波
    setAttackPhase('chariot', 'charge');
    fx.chariotTrail(mesh, dir, effectColor, 0.62);
    animateMove(mesh, dstV, 0.1, () => {
      setAttackPhase('chariot', 'impact');
      sndChariot();
      fx.chariotRam(dstV, dir, effectColor);
      flingPiece(capMesh, dir, 'ram', finish);
    }, 0.34);
  } else if (piece.type === 'horse') {
    // 马: 高跃压身 -> 空中挺槊 -> 枪芒贯穿 -> 踏入目标格
    setAttackPhase('horse', 'leap');
    const strikePos = dstV.clone().addScaledVector(dir, -0.9);
    animateMove(mesh, strikePos, 1.95, () => {
      setAttackPhase('horse', 'lance');
      sndHorse();
      fx.horseLance(capPos, dir, effectColor);
      flingPiece(capMesh, dir, 'pierce', () => {
        setAttackPhase('horse', 'advance');
        animateMove(mesh, dstV, 0.24, finish, 0.24);
      });
    }, 0.55);
  } else if (piece.type === 'general') {
    // 帅/将: 全屏推镜侧绕 -> 双手举剑蓄力 -> 金色重劈 -> 将令震环 -> 回镜
    startGeneralCinematic(mesh, capMesh, piece.color);
    const weapon = mesh.userData.rig?.weapon;
    const rest = weapon?.rotation.z ?? 0;
    animateRotation(mesh, weapon, 'z', rest - 0.86, 0.22, () => {
      setAttackPhase('general', 'cleave');
      animateRotation(mesh, weapon, 'z', rest + 0.54, 0.16, () => {
        triggerGeneralImpact();
        sndGeneral();
        sndHit();
        fx.generalCleave(capPos, dir, effectColor);
        animateRotation(mesh, weapon, 'z', rest, 0.26);
        flingPiece(capMesh, dir, 'general', () => {
          setAttackPhase('general', 'advance');
          animateMove(mesh, dstV, 0.6, () => endGeneralCinematic(finish), 0.52);
        });
      });
    });
  } else if (piece.type === 'advisor') {
    // 仕/士: 侧身抽剑 -> 双燕交叉快斩 -> 八角护印
    const weapon = mesh.userData.rig?.weapon;
    const rest = weapon?.rotation.z ?? 0;
    animateRotation(mesh, weapon, 'z', rest - 0.36, 0.11, () => {
      setAttackPhase('advisor', 'cross-cut');
      animateRotation(mesh, weapon, 'z', rest + 0.58, 0.1, () => {
        animateRotation(mesh, weapon, 'z', rest - 0.24, 0.09, () => {
          sndAdvisor();
          fx.advisorCrossCut(capPos, dir, effectColor);
          animateRotation(mesh, weapon, 'z', rest, 0.18);
          flingPiece(capMesh, dir, 'advisor', () => {
            setAttackPhase('advisor', 'advance');
            animateMove(mesh, dstV, 0.4, finish, 0.42);
          });
        });
      });
    });
  } else if (piece.type === 'elephant') {
    // 相/象: 举杖蓄势 -> 象足/朝杖撼地 -> 玉色震环与飞石
    const weapon = mesh.userData.rig?.weapon;
    const rest = weapon?.rotation.z ?? 0;
    animateRotation(mesh, weapon, 'z', rest + 0.46, 0.2, () => {
      setAttackPhase('elephant', 'quake');
      animateRotation(mesh, weapon, 'z', rest - 0.82, 0.16, () => {
        sndElephant();
        fx.elephantQuake(capPos, effectColor);
        animateRotation(mesh, weapon, 'z', rest, 0.25);
        flingPiece(capMesh, dir, 'quake', () => {
          setAttackPhase('elephant', 'advance');
          animateMove(mesh, dstV, 0.32, finish, 0.48);
        });
      });
    });
  } else if (piece.type === 'soldier') {
    // 兵/卒: 举盾前顶 -> 整体短冲 -> 阵营色枪芒直刺
    const weapon = mesh.userData.rig?.weapon;
    const weaponRest = weapon?.position.z ?? 0;
    const lungePos = dstV.clone().addScaledVector(dir, -0.72);
    setAttackPhase('soldier', 'shield-rush');
    animateMove(mesh, lungePos, 0.16, () => {
      setAttackPhase('soldier', 'thrust');
      animatePosition(mesh, weapon, 'z', weaponRest + 0.42, 0.12, () => {
        sndSoldier();
        fx.soldierThrust(mesh.position, capPos, dir, effectColor);
        animatePosition(mesh, weapon, 'z', weaponRest, 0.18);
        flingPiece(capMesh, dir, 'soldier', () => {
          setAttackPhase('soldier', 'advance');
          animateMove(mesh, dstV, 0.18, finish, 0.3);
        });
      });
    }, 0.2);
  } else {
    // 新增兵种或异常数据也必须完成回合，避免攻击流程永久锁住。
    sndCapture();
    fx.slash(capPos, effectColor || 0xfff0c0);
    flingPiece(capMesh, dir, 'slash', () => animateMove(mesh, dstV, 0.5, finish, 0.45));
  }
}

// ---------- 交互 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

function findPieceRoot(obj) {
  while (obj) {
    if (obj.userData && obj.userData.pieceId !== undefined) return obj;
    obj = obj.parent;
  }
  return null;
}

function castAt(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hitMarker = raycaster.intersectObjects(markers.group.children, false)[0];
  if (hitMarker && hitMarker.object.userData.moveTo) return { marker: hitMarker.object };
  const hitPiece = raycaster.intersectObjects(pieceHitAreas, false)[0];
  if (hitPiece) {
    const root = findPieceRoot(hitPiece.object);
    if (root) return { pieceRoot: root };
  }
  return {};
}

renderer.domElement.addEventListener('pointerdown', ev => { downPos = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener('pointerup', ev => {
  if (!downPos) return;
  const dx = ev.clientX - downPos[0], dy = ev.clientY - downPos[1];
  downPos = null;
  if (dx * dx + dy * dy > 36) return; // 拖拽视角不算点击
  if (gameOver || actionPhase !== 'idle' || tweens.length) return;
  const currentStatus = R.gameStatus(state);
  if (currentStatus.over) {
    showResult(currentStatus);
    return;
  }

  const { marker, pieceRoot } = castAt(ev);
  if (marker) {
    if (gameMode === 'online') sendOnlineMove(selected, marker.userData.moveTo);
    else doMove(selected, marker.userData.moveTo);
    return;
  }
  if (pieceRoot) {
    const piece = state.pieces.find(p => p.id === pieceRoot.userData.pieceId);
    if (piece && piece.color === state.turn && isHumanTurn()) {
      selected = piece;
      selectedMoves = R.legalMoves(state.pieces, piece);
      markers.clear();
      if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
      markers.selectRing(piece.row, piece.col);
      markers.showMoves(selectedMoves, state.pieces, R.pieceAt);
      sndSelect();
      if (selectedMoves.length) {
        hint.textContent = `${R.GLYPH[piece.color][piece.type]} · 可走 ${selectedMoves.length} 处`;
      } else if (R.isInCheck(state.pieces, piece.color)) {
        showCheckResponses(`${R.GLYPH[piece.color][piece.type]}无法解将`);
      } else if (R.pseudoMoves(state.pieces, piece).length) {
        hint.textContent = `${R.GLYPH[piece.color][piece.type]} · 此棋被牵制，移动会暴露将帅`;
      } else {
        hint.textContent = `${R.GLYPH[piece.color][piece.type]} · 当前无可走位置`;
      }
      return;
    }
    // 点击敌子: 若是合法吃子目标则直接吃
    if (piece && selected) {
      const m = selectedMoves.find(mv => mv.row === piece.row && mv.col === piece.col);
      if (m) {
        if (gameMode === 'online') sendOnlineMove(selected, m);
        else doMove(selected, m);
        return;
      }
    }
  }
  if (selected) {
    selected = null;
    markers.clear();
    if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
    if (isHumanTurn() && R.isInCheck(state.pieces, state.turn)) showCheckResponses();
    else hint.textContent = '点击己方棋子查看可走位置';
  }
});

let hoverFrame = 0;
let hoverPoint = null;
renderer.domElement.addEventListener('pointermove', ev => {
  hoverPoint = { clientX: ev.clientX, clientY: ev.clientY };
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    if (gameOver || !hoverPoint) return;
    const { marker, pieceRoot } = castAt(hoverPoint);
    let hover = !!marker;
    if (!hover && pieceRoot) {
      const piece = state.pieces.find(p => p.id === pieceRoot.userData.pieceId);
      hover = piece && ((piece.color === state.turn && isHumanTurn()) ||
        (selected && selectedMoves.some(m => m.row === piece.row && m.col === piece.col)));
    }
    renderer.domElement.style.cursor = hover ? 'pointer' : 'grab';
  });
});
renderer.domElement.addEventListener('pointerleave', () => {
  hoverPoint = null;
  renderer.domElement.style.cursor = 'grab';
});

// ---------- 按钮 ----------
function requestRestart() {
  if (gameMode === 'online') {
    if (online?.socket?.readyState === WebSocket.OPEN) {
      online.socket.send(JSON.stringify({ type: 'restart' }));
    } else {
      battleHint('联机尚未恢复，无法发送重开军令', true);
    }
    return;
  }
  resetGame();
}

document.getElementById('btnRestart').addEventListener('click', requestRestart);
document.getElementById('btnAgain').addEventListener('click', requestRestart);
async function selectGameMode(nextMode) {
  if (DEMO_TYPES.has(demoType) || !['ai', 'local', 'online'].includes(nextMode)) return;
  if (nextMode === gameMode) {
    if (nextMode === 'online') showOnlineDialog();
    return;
  }
  hideOnlineDialog();
  if (gameMode === 'online') leaveOnline();
  gameMode = nextMode;
  resetGame();
  if (nextMode === 'ai') {
    battleHint('你执红先行 · 黑方由电脑应战');
    await probeAi();
  } else if (nextMode === 'local') {
    battleHint('已切换为本地双人对弈');
  } else {
    showOnlineDialog();
    battleHint('请选择创建军帐或输入编号加入');
  }
}
for (const button of modeButtons) {
  button.addEventListener('click', () => void selectGameMode(button.dataset.mode));
}
aiEngineSelect.addEventListener('change', async () => {
  if (!['godogpaw', 'pikafish'].includes(aiEngineSelect.value)) return;
  aiRequestVersion++;
  resetWasmAi();
  aiEngine = aiEngineSelect.value;
  refreshBattleControls();
  battleHint(`人机引擎切换为：${aiEngineName()}`);
  await probeAi();
});
aiDifficultySelect.addEventListener('change', async () => {
  if (!Object.hasOwn(difficultyNames, aiDifficultySelect.value)) return;
  aiRequestVersion++;
  aiDifficulty = aiDifficultySelect.value;
  refreshBattleControls();
  battleHint(`敌军谋略调整为：${difficultyNames[aiDifficulty]}`);
  await probeAi();
});
document.getElementById('btnUndo').addEventListener('click', () => {
  if (actionPhase !== 'idle' || tweens.length) return;
  if (gameMode === 'online') {
    battleHint('联机对局暂不支持悔棋');
    return;
  }
  const plies = gameMode === 'ai' && state.turn === R.RED ? 2 : 1;
  let undone = false;
  gameOver = false;
  document.getElementById('overlay').classList.remove('show');
  for (let i = 0; i < plies; i++) {
    const h = R.undo(state);
    if (!h) break;
    undone = true;
    const mesh = meshById.get(h.pieceId);
    restoreFacing(mesh);
    const back = squareToWorld(h.from.row, h.from.col);
    mesh.position.set(back.x, back.y, back.z);
    if (h.captured) {
      const cm = meshById.get(h.captured.id);
      setOpacity(cm, 1);
      cm.rotation.set(0, h.captured.color === R.RED ? Math.PI : 0, 0); // 复位击飞翻滚
      const cp = squareToWorld(h.captured.row, h.captured.col);
      cm.position.set(cp.x, cp.y, cp.z);
      piecesGroup.add(cm);
      if (!pieceHitAreas.includes(cm.userData.hitArea)) pieceHitAreas.push(cm.userData.hitArea);
    }
  }
  if (!undone) return;
  selected = null;
  actionPhase = 'idle';
  markers.clear();
  if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
  refreshHUD();
});

let flipped = false;
function setCameraForSide(color) {
  setCameraFlipped(color === R.BLACK);
}

function setCameraFlipped(nextFlipped = !flipped) {
  if (generalCinematic || actionPhase !== 'idle') return;
  flipped = nextFlipped;
  const t = { t: 0 };
  const from = camera.position.clone();
  const to = new THREE.Vector3(0, 21, flipped ? -34 : 34);
  const step = () => {
    t.t += 0.04;
    camera.position.lerpVectors(from, to, Math.min(t.t, 1));
    if (t.t < 1) requestAnimationFrame(step);
  };
  step();
}

document.getElementById('btnCam').addEventListener('click', () => setCameraFlipped());

document.getElementById('btnOnlineClose').addEventListener('click', hideOnlineDialog);
document.getElementById('btnBackToAi').addEventListener('click', () => void selectGameMode('ai'));
onlineDialog.addEventListener('click', event => {
  if (event.target === onlineDialog) hideOnlineDialog();
});
btnCreateRoom.addEventListener('click', () => requestRoom('/api/rooms'));
joinRoomForm.addEventListener('submit', event => {
  event.preventDefault();
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomId)) {
    onlineMessage.textContent = '请输入 6 位军帐编号';
    onlineMessage.classList.add('error');
    return;
  }
  requestRoom(`/api/rooms/${encodeURIComponent(roomId)}/join`);
});
document.getElementById('btnCopyInvite').addEventListener('click', async () => {
  if (!online) return;
  const invite = new URL(location.href);
  invite.searchParams.set('room', online.roomId);
  try {
    await navigator.clipboard.writeText(invite.toString());
    battleHint(`军帐 ${online.roomId} 的邀请链接已复制`);
  } catch (_) {
    onlineMessage.textContent = invite.toString();
  }
});

// ---------- 渲染循环 ----------
const clock = new THREE.Clock();
function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
let simulationTime = 0;
let shadowUpdateFrame = 0;

function updateScene(dt, renderFrame = true) {
  dt = Math.min(Math.max(dt, 0), 0.05);
  simulationTime += dt;
  const time = simulationTime;

  const shadowsWereAnimating = tweens.length > 0;

  // 走子/击飞动画（支持 delay / fade / spin 组合）
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (tw.delay > 0) { tw.delay -= dt; continue; }
    tw.t += dt;
    const p = Math.min(tw.t / tw.dur, 1);
    const e = easeInOut(p);
    if (tw.update) {
      tw.update(e, p);
    } else if (tw.to) {
      tw.mesh.position.lerpVectors(tw.from, tw.to, e);
      if (tw.arc) tw.mesh.position.y += Math.sin(Math.PI * e) * tw.arc;
    }
    if (tw.fade) setOpacity(tw.mesh, 1 - p);
    if (tw.spin) {
      tw.mesh.rotation.x += dt * 6;
      tw.mesh.rotation.z += dt * 4.5;
    }
    if (p >= 1) {
      tweens.splice(i, 1);
      tw.onDone && tw.onDone();
    }
  }

  // 战斗特效
  fx.update(dt);

  // 待机呼吸 + 选中浮动
  for (const mesh of piecesGroup.children) {
    const badge = mesh.userData.identityBadge;
    if (badge) badge.visible = !generalCinematic;
    if (tweens.some(tw => tw.mesh === mesh)) continue;
    const fig = mesh.userData.figure;
    if (fig) {
      fig.rotation.z = Math.sin(time * 1.3 + mesh.userData.phase) * 0.018;
      fig.position.y = 0.34 + Math.sin(time * 1.3 + mesh.userData.phase) * 0.015;
    }
    const isSel = selected && mesh.userData.pieceId === selected.id;
    if (badge) {
      const pulse = isSel ? 1.14 + Math.sin(time * 4) * 0.035 : 1;
      const targetScale = badge.userData.baseScale * pulse;
      badge.scale.x += (targetScale - badge.scale.x) * Math.min(dt * 10, 1);
      badge.scale.y += (targetScale - badge.scale.y) * Math.min(dt * 10, 1);
      badge.material.opacity += ((isSel ? 1 : 0.92) - badge.material.opacity) * Math.min(dt * 9, 1);
    }
    const baseY = squareToWorld(0, 0).y;
    if (isSel) {
      mesh.position.y = baseY + 0.18 + Math.sin(time * 4) * 0.05;
    } else if (Math.abs(mesh.position.y - baseY) > 0.001) {
      mesh.position.y += (baseY - mesh.position.y) * Math.min(dt * 8, 1);
    }
  }

  // 战旗挥舞
  for (const b of env.banners) {
    const attr = b.cloth.geometry.attributes.position;
    const base = b.base;
    for (let i = 0; i < attr.count; i++) {
      const x = base[i * 3];
      const f = Math.max(0, (x - 0.1) / b.width);
      attr.setZ(i, Math.sin(x * 2.2 + time * 3.4 + b.phase) * 0.34 * f + Math.sin(time * 7.3 + x * 5) * 0.07 * f);
    }
    attr.needsUpdate = true;
  }

  // 火盆摇曳
  for (const f of env.fires) {
    f.light.intensity = 9 + Math.sin(time * 11 + f.phase) * 2.4 + Math.sin(time * 23.7 + f.phase * 2) * 1.4;
    f.flame.scale.y = 1 + Math.sin(time * 9 + f.phase) * 0.18;
    f.flame.rotation.y = time * 2 + f.phase;
  }

  // 余烬缓升
  const pos = env.embers.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) + dt * 0.5;
    if (y > 15) y = -1;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;

  controls.update();
  updateGeneralCinematic(dt);
  if (shadowsWereAnimating && (shadowUpdateFrame++ % 2 === 0 || tweens.length === 0)) {
    renderer.shadowMap.needsUpdate = true;
  }
  if (renderFrame) {
    renderer.render(scene, camera);
    window.__markChessReady?.();
  }
}

let deterministicFrameRendered = false;
let lastAnimationFrame = -Infinity;

function restoreRenderingAfterPause() {
  clock.start();
  lastAnimationFrame = -Infinity;
  renderer.shadowMap.needsUpdate = true;
  requestAnimationFrame(() => {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.stop();
  else restoreRenderingAfterPause();
});
canvas.addEventListener('webglcontextrestored', restoreRenderingAfterPause);

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  const minFrameInterval = window.innerWidth < 760 ? 1000 / 30 : 1000 / 60;
  if (!deterministicTestMode && now - lastAnimationFrame < minFrameInterval - 1) return;
  lastAnimationFrame = now;
  const dt = clock.getDelta();
  if (!deterministicTestMode) updateScene(dt);
  else if (!deterministicFrameRendered) {
    deterministicFrameRendered = true;
    updateScene(0);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.35 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'f') return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

// 自动化与无障碍调试钩子：提供简洁、可机器读取的当前棋局。
window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: 'row 0 is black home rank; row increases toward red; col 0 is left from red view',
  turn: state.turn,
  phase: actionPhase,
  lastAttackType,
  gameOver,
  gameMode,
  aiEngine,
  aiDifficulty,
  aiThinking,
  online: online ? {
    roomId: online.roomId,
    color: online.color,
    connected: online.connected,
    opponentConnected: online.opponentConnected,
    revision: online.revision,
  } : null,
  attack: DEMO_TYPES.has(demoType) ? {
    type: lastAttackType || demoType,
    stage: actionPhase.includes('-') ? actionPhase.slice(actionPhase.indexOf('-') + 1) : actionPhase,
    effectKey: lastAttackType || demoType,
    attackerId: 10,
    targetId: 20,
    targetVisualAlive: meshById.get(20)?.parent === piecesGroup,
  } : null,
  tweenCount: tweens.length,
  effectsBusy: fx.busy,
  cinematic: generalCinematic ? {
    active: true,
    returning: generalCinematic.returning,
    impact: generalCinematic.impactTime >= 0,
  } : { active: false, returning: false, impact: false },
  modelAssets: window.__tripoModelCount || 0,
  selected: selected ? { id: selected.id, type: selected.type, row: selected.row, col: selected.col } : null,
  legalTargets: selectedMoves.map(m => ({ row: m.row, col: m.col })),
  responseHintCount: markers.group.children.filter(child => child.userData.isResponseHint).length,
  pieces: state.pieces.map(p => ({ id: p.id, color: p.color, type: p.type, row: p.row, col: p.col })),
});

window.advanceTime = ms => {
  if (!deterministicTestMode || !Number.isFinite(ms) || ms <= 0) return;
  const steps = Math.min(600, Math.max(1, Math.round(ms / (1000 / 60))));
  for (let i = 0; i < steps; i++) updateScene(1 / 60, i === steps - 1);
};

window.install_test_state = nextState => {
  if (!deterministicTestMode || !nextState?.pieces || !nextState.turn) return false;
  installGameState({
    pieces: nextState.pieces.map(piece => ({ ...piece })),
    turn: nextState.turn,
    history: [],
    lastMove: null,
  });
  const status = R.gameStatus(state);
  if (status.over) showResult(status);
  else if (status.check) showCheckResponses();
  updateScene(0);
  return true;
};

const bootText = document.getElementById('bootText');
window.__tripoModelCount = await preloadPieceModels((completed, total) => {
  if (bootText) bootText.textContent = `正在点将 · 重塑战阵 ${completed}/${total}`;
});
buildAllPieces();
refreshHUD();
refreshBattleControls();
animate();

if (!DEMO_TYPES.has(demoType)) {
  const invitedRoom = pageParams.get('room')?.trim().toUpperCase();
  if (invitedRoom && /^[A-Z0-9]{6}$/.test(invitedRoom)) {
    roomCodeInput.value = invitedRoom;
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(`chess-room-${invitedRoom}`)); }
    catch (_) { /* 损坏的会话记录按新玩家处理 */ }
    if (stored?.room_id === invitedRoom && stored?.token) connectOnline(stored);
    else {
      gameMode = 'online';
      resetGame();
      showOnlineDialog();
      requestRoom(`/api/rooms/${encodeURIComponent(invitedRoom)}/join`);
    }
  } else {
    probeAi();
  }
}

// 七类攻击演示：?demo=general|advisor|elephant|horse|chariot|cannon|soldier
if (DEMO_TYPES.has(demoType)) {
  let demoStarted = false;
  const trigger = document.createElement('button');
  trigger.id = 'demoTrigger';
  trigger.className = 'demo-trigger';
  trigger.textContent = `演示 · ${R.GLYPH[demoSide][demoType]}攻`;
  trigger.addEventListener('click', () => {
    if (demoStarted) return;
    demoStarted = true;
    trigger.remove();
    const attacker = state.pieces.find(piece => piece.id === 10);
    const target = state.pieces.find(piece => piece.id === 20);
    const move = attacker && target && R.legalMoves(state.pieces, attacker)
      .find(candidate => candidate.row === target.row && candidate.col === target.col);
    if (!move) {
      console.error(`Invalid ${demoType} attack demo fixture`);
      return;
    }
    doMove(attacker, move);
  });
  document.body.appendChild(trigger);
  window.__attackDemo = { type: demoType, start: () => trigger.click() };
  if (!deterministicTestMode) setTimeout(() => trigger.click(), 700);
}
