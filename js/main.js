// 主程序: 场景搭建、走子交互、动画、HUD、音效
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as R from './rules.js';
import { createPieceMesh } from './pieces.js';
import { createBoard, createMarkers, createEnvironment, squareToWorld } from './board3d.js';
import { FX } from './fx.js';

// ---------- 渲染器 / 场景 ----------
const canvas = document.getElementById('scene');
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

let state = R.createInitialState();
let meshById = new Map();   // pieceId -> THREE.Group
const pieceHitAreas = [];
let selected = null;        // 当前选中棋子
let selectedMoves = [];
let gameOver = false;
let actionPhase = 'idle';
const tweens = [];

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
}

function resetGame() {
  state = R.createInitialState();
  gameOver = false;
  selected = null;
  selectedMoves = [];
  actionPhase = 'idle';
  tweens.length = 0;
  fx.clear();
  while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);
  meshById.clear();
  pieceHitAreas.length = 0;
  markers.clear();
  buildAllPieces();
  document.getElementById('overlay').classList.remove('show');
  refreshHUD();
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
function setOpacity(mesh, v) {
  mesh.traverse(o => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.opacity = v; });
  });
}
function makeFadable(mesh) {
  mesh.traverse(o => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.transparent = true; });
    }
  });
}
// 被吃棋子击飞: 抛起 + 翻滚 + 淡出
function flingPiece(mesh, dir, style, onDone = null) {
  makeFadable(mesh);
  const up = style === 'blast' ? 3.4 : style === 'stomp' ? 0.9 : 1.7;
  const away = style === 'blast' ? 3.6 : style === 'stomp' ? 1.2 : 2.3;
  const to = mesh.position.clone().addScaledVector(dir, away);
  tweens.push({
    mesh, from: mesh.position.clone(), to, t: 0, dur: 0.7, arc: up,
    fade: true, spin: style !== 'stomp',
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

const SLASH_COLOR = {
  general: 0xffe9b0, advisor: 0xcfe4ff, elephant: 0xb8e8c8,
  soldier: 0xffd090, horse: 0xfff0c0, chariot: 0xffe0b0, cannon: 0xffc060,
};
function arcFor(type) {
  return type === 'horse' ? 1.7 : type === 'elephant' ? 0.45 : type === 'soldier' ? 0.85 : 0.7;
}

function doMove(piece, to) {
  const mesh = meshById.get(piece.id);
  const captured = R.applyMove(state, piece, to);
  selected = null;
  selectedMoves = [];
  markers.clear();

  const dst = squareToWorld(to.row, to.col);
  const dstV = new THREE.Vector3(dst.x, dst.y, dst.z);

  const finish = () => {
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
    }
  };

  // 普通移动: 跳跃落位
  if (!captured) {
    actionPhase = 'moving';
    sndMove();
    animateMove(mesh, dstV, arcFor(piece.type), finish);
    return;
  }

  // 吃子: 按兵种演出攻击动画，再落位
  actionPhase = piece.type === 'cannon' ? 'cannon-aim' : 'attacking';
  const capMesh = meshById.get(captured.id);
  const capPos = capMesh.position.clone();
  const dir = dstV.clone().sub(mesh.position).setY(0).normalize();
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
        actionPhase = 'cannon-flight';
        sndFire();
        fx.muzzleFlash(muzzle, dir);
        animateRotation(mesh, barrel, 'x', barrelRest, 0.18);
        fx.cannonShot(muzzle, target, () => {
          actionPhase = 'cannon-impact';
          sndBoom();
          flingPiece(capMesh, dir, 'blast', () => {
            actionPhase = 'cannon-advance';
            animateMove(mesh, dstV, 0.48, finish, 0.52);
          });
        });
      }, 0.16);
    });
  } else if (piece.type === 'chariot') {
    // 车: 全速冲锋撞飞对手，直接冲入该格
    animateMove(mesh, dstV, 0.1, () => {
      sndCapture();
      sndHit();
      fx.impactDust(dstV);
      flingPiece(capMesh, dir, 'ram', finish);
    }, 0.3);
  } else if (piece.type === 'horse') {
    // 马: 高跃践踏
    animateMove(mesh, dstV, 1.9, () => {
      sndCapture();
      sndHit();
      fx.slash(capPos, SLASH_COLOR.horse);
      fx.impactDust(dstV);
      flingPiece(capMesh, dir, 'stomp', finish);
    }, 0.55);
  } else {
    // 帅/仕/相/兵: 武器蓄势挥击，命中后再进占目标位置
    const weapon = mesh.userData.rig?.weapon;
    const rest = weapon?.rotation.z ?? 0;
    animateRotation(mesh, weapon, 'z', rest - 0.62, 0.16, () => {
      animateRotation(mesh, weapon, 'z', rest + 0.76, 0.13, () => {
        sndCapture();
        sndHit();
        fx.slash(capPos, SLASH_COLOR[piece.type]);
        if (piece.type === 'elephant') fx.impactDust(capPos);
        animateRotation(mesh, weapon, 'z', rest, 0.22);
        flingPiece(capMesh, dir, 'slash', () => {
          animateMove(mesh, dstV, arcFor(piece.type), finish, 0.5);
        });
      });
    });
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
  if (gameOver || tweens.length || fx.busy) return;

  const { marker, pieceRoot } = castAt(ev);
  if (marker) {
    doMove(selected, marker.userData.moveTo);
    return;
  }
  if (pieceRoot) {
    const piece = state.pieces.find(p => p.id === pieceRoot.userData.pieceId);
    if (piece && piece.color === state.turn) {
      selected = piece;
      selectedMoves = R.legalMoves(state.pieces, piece);
      markers.clear();
      if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
      markers.selectRing(piece.row, piece.col);
      markers.showMoves(selectedMoves, state.pieces, R.pieceAt);
      sndSelect();
      hint.textContent = `${R.GLYPH[piece.color][piece.type]} · 可走 ${selectedMoves.length} 处`;
      return;
    }
    // 点击敌子: 若是合法吃子目标则直接吃
    if (piece && selected) {
      const m = selectedMoves.find(mv => mv.row === piece.row && mv.col === piece.col);
      if (m) {
        doMove(selected, m);
        return;
      }
    }
  }
  if (selected) { selected = null; markers.clear(); hint.textContent = '点击己方棋子查看可走位置'; }
});

renderer.domElement.addEventListener('pointermove', ev => {
  if (gameOver) return;
  const { marker, pieceRoot } = castAt(ev);
  let hover = !!marker;
  if (!hover && pieceRoot) {
    const piece = state.pieces.find(p => p.id === pieceRoot.userData.pieceId);
    hover = piece && (piece.color === state.turn ||
      (selected && selectedMoves.some(m => m.row === piece.row && m.col === piece.col)));
  }
  renderer.domElement.style.cursor = hover ? 'pointer' : 'grab';
});

// ---------- 按钮 ----------
document.getElementById('btnRestart').addEventListener('click', resetGame);
document.getElementById('btnAgain').addEventListener('click', resetGame);
document.getElementById('btnUndo').addEventListener('click', () => {
  if (tweens.length || fx.busy) return;
  const h = R.undo(state);
  if (!h) return;
  gameOver = false;
  document.getElementById('overlay').classList.remove('show');
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
  selected = null;
  actionPhase = 'idle';
  markers.clear();
  if (state.lastMove) markers.lastMoveMarks(state.lastMove.from, state.lastMove.to);
  refreshHUD();
});

let flipped = false;
document.getElementById('btnCam').addEventListener('click', () => {
  flipped = !flipped;
  const t = { t: 0 };
  const from = camera.position.clone();
  const to = new THREE.Vector3(0, 21, flipped ? -34 : 34);
  const step = () => {
    t.t += 0.04;
    camera.position.lerpVectors(from, to, Math.min(t.t, 1));
    if (t.t < 1) requestAnimationFrame(step);
  };
  step();
});

// ---------- 渲染循环 ----------
const clock = new THREE.Clock();
function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
let simulationTime = 0;

function updateScene(dt) {
  dt = Math.min(Math.max(dt, 0), 0.05);
  simulationTime += dt;
  const time = simulationTime;

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
    if (tweens.some(tw => tw.mesh === mesh)) continue;
    const fig = mesh.userData.figure;
    if (fig) {
      fig.rotation.z = Math.sin(time * 1.3 + mesh.userData.phase) * 0.018;
      fig.position.y = 0.34 + Math.sin(time * 1.3 + mesh.userData.phase) * 0.015;
    }
    const isSel = selected && mesh.userData.pieceId === selected.id;
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
  renderer.render(scene, camera);
  window.__markChessReady?.();
}

function animate() {
  requestAnimationFrame(animate);
  updateScene(clock.getDelta());
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
  gameOver,
  selected: selected ? { id: selected.id, type: selected.type, row: selected.row, col: selected.col } : null,
  legalTargets: selectedMoves.map(m => ({ row: m.row, col: m.col })),
  pieces: state.pieces.map(p => ({ id: p.id, color: p.color, type: p.type, row: p.row, col: p.col })),
});

window.advanceTime = ms => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) updateScene(1 / 60);
};

buildAllPieces();
refreshHUD();
animate();

// 演示钩子: ?demo=cannon 自动走一步炮吃马（用于调试攻击动画）
if (new URLSearchParams(location.search).get('demo') === 'cannon') {
  setTimeout(() => {
    const p = state.pieces.find(p => p.type === 'cannon' && p.color === R.RED && p.col === 1);
    if (p) doMove(p, { row: 0, col: 1 });
  }, 600);
}
