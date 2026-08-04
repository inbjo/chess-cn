// 中国象棋规则引擎 —— 纯逻辑，不依赖 DOM / Three.js
// 坐标: row 0..9 (0 = 黑方底线, 9 = 红方底线), col 0..8 (0 = 红方视角左侧)

export const RED = 'red';
export const BLACK = 'black';
export const ROWS = 10;
export const COLS = 9;

export const GLYPH = {
  red:   { general: '帅', advisor: '仕', elephant: '相', horse: '馬', chariot: '車', cannon: '炮', soldier: '兵' },
  black: { general: '將', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' },
};

export const TYPE_NAME = {
  general: '将帅', advisor: '仕士', elephant: '相象', horse: '马',
  chariot: '车', cannon: '炮', soldier: '兵卒',
};

export function createInitialState() {
  const pieces = [];
  let id = 0;
  const back = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];
  for (let c = 0; c < COLS; c++) {
    pieces.push({ id: id++, type: back[c], color: BLACK, row: 0, col: c });
    pieces.push({ id: id++, type: back[c], color: RED, row: 9, col: c });
  }
  pieces.push({ id: id++, type: 'cannon', color: BLACK, row: 2, col: 1 });
  pieces.push({ id: id++, type: 'cannon', color: BLACK, row: 2, col: 7 });
  pieces.push({ id: id++, type: 'cannon', color: RED, row: 7, col: 1 });
  pieces.push({ id: id++, type: 'cannon', color: RED, row: 7, col: 7 });
  for (const c of [0, 2, 4, 6, 8]) {
    pieces.push({ id: id++, type: 'soldier', color: BLACK, row: 3, col: c });
    pieces.push({ id: id++, type: 'soldier', color: RED, row: 6, col: c });
  }
  return { pieces, turn: RED, history: [], lastMove: null };
}

export function pieceAt(pieces, row, col) {
  for (const p of pieces) if (p.row === row && p.col === col) return p;
  return null;
}

function onBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

function inPalace(color, r, c) {
  if (c < 3 || c > 5) return false;
  return color === BLACK ? (r >= 0 && r <= 2) : (r >= 7 && r <= 9);
}

// 伪合法走法（不检验走后己方将帅是否被将军）
export function pseudoMoves(pieces, piece) {
  const moves = [];
  const push = (r, c) => {
    if (!onBoard(r, c)) return;
    const t = pieceAt(pieces, r, c);
    if (t && t.color === piece.color) return;
    moves.push({ row: r, col: c });
  };

  switch (piece.type) {
    case 'general': {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = piece.row + dr, c = piece.col + dc;
        if (inPalace(piece.color, r, c)) push(r, c);
      }
      // 飞将: 同列无遮挡可直接吃对方将帅
      const enemy = pieces.find(p => p.type === 'general' && p.color !== piece.color);
      if (enemy && enemy.col === piece.col) {
        const step = enemy.row > piece.row ? 1 : -1;
        let clear = true;
        for (let r = piece.row + step; r !== enemy.row; r += step) {
          if (pieceAt(pieces, r, piece.col)) { clear = false; break; }
        }
        if (clear) moves.push({ row: enemy.row, col: enemy.col });
      }
      break;
    }
    case 'advisor': {
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const r = piece.row + dr, c = piece.col + dc;
        if (inPalace(piece.color, r, c)) push(r, c);
      }
      break;
    }
    case 'elephant': {
      for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const r = piece.row + dr, c = piece.col + dc;
        if (!onBoard(r, c)) continue;
        if (piece.color === RED && r < 5) continue;   // 不过河
        if (piece.color === BLACK && r > 4) continue;
        if (pieceAt(pieces, piece.row + dr / 2, piece.col + dc / 2)) continue; // 塞象眼
        push(r, c);
      }
      break;
    }
    case 'horse': {
      // dr, dc, 蹩马腿 lr, lc
      const legs = [
        [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
      ];
      for (const [dr, dc, lr, lc] of legs) {
        if (pieceAt(pieces, piece.row + lr, piece.col + lc)) continue;
        push(piece.row + dr, piece.col + dc);
      }
      break;
    }
    case 'chariot': {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let r = piece.row + dr, c = piece.col + dc;
        while (onBoard(r, c)) {
          const t = pieceAt(pieces, r, c);
          if (!t) moves.push({ row: r, col: c });
          else { if (t.color !== piece.color) moves.push({ row: r, col: c }); break; }
          r += dr; c += dc;
        }
      }
      break;
    }
    case 'cannon': {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let r = piece.row + dr, c = piece.col + dc, jumped = false;
        while (onBoard(r, c)) {
          const t = pieceAt(pieces, r, c);
          if (!jumped) {
            if (!t) moves.push({ row: r, col: c });
            else jumped = true;
          } else if (t) {
            if (t.color !== piece.color) moves.push({ row: r, col: c });
            break;
          }
          r += dr; c += dc;
        }
      }
      break;
    }
    case 'soldier': {
      const fwd = piece.color === RED ? -1 : 1;
      push(piece.row + fwd, piece.col);
      const crossed = piece.color === RED ? piece.row <= 4 : piece.row >= 5;
      if (crossed) { push(piece.row, piece.col - 1); push(piece.row, piece.col + 1); }
      break;
    }
  }
  return moves;
}

export function isInCheck(pieces, color) {
  const gen = pieces.find(p => p.type === 'general' && p.color === color);
  if (!gen) return true;
  for (const p of pieces) {
    if (p.color === color) continue;
    for (const m of pseudoMoves(pieces, p)) {
      if (m.row === gen.row && m.col === gen.col) return true;
    }
  }
  return false;
}

// 合法走法: 过滤掉走后己方被将军的着法
export function legalMoves(pieces, piece) {
  const res = [];
  for (const m of pseudoMoves(pieces, piece)) {
    const idx = pieces.findIndex(p => p !== piece && p.row === m.row && p.col === m.col);
    let captured = null;
    if (idx >= 0) captured = pieces.splice(idx, 1)[0];
    const fr = piece.row, fc = piece.col;
    piece.row = m.row; piece.col = m.col;
    const ok = !isInCheck(pieces, piece.color);
    piece.row = fr; piece.col = fc;
    if (captured) pieces.splice(idx, 0, captured);
    if (ok) res.push(m);
  }
  return res;
}

export function hasLegalMoves(pieces, color) {
  return pieces.some(p => p.color === color && legalMoves(pieces, p).length > 0);
}

// 执行走法（原地修改 state），返回被吃棋子或 null
export function applyMove(state, piece, to) {
  const captured = pieceAt(state.pieces, to.row, to.col);
  if (captured) state.pieces.splice(state.pieces.indexOf(captured), 1);
  const from = { row: piece.row, col: piece.col };
  state.history.push({ pieceId: piece.id, from, to: { ...to }, captured });
  piece.row = to.row; piece.col = to.col;
  state.lastMove = { pieceId: piece.id, from, to: { ...to } };
  state.turn = state.turn === RED ? BLACK : RED;
  return captured;
}

export function undo(state) {
  const h = state.history.pop();
  if (!h) return null;
  const piece = state.pieces.find(p => p.id === h.pieceId);
  piece.row = h.from.row; piece.col = h.from.col;
  if (h.captured) state.pieces.push(h.captured);
  state.lastMove = state.history.length
    ? { pieceId: state.history[state.history.length - 1].pieceId, from: state.history[state.history.length - 1].from, to: state.history[state.history.length - 1].to }
    : null;
  state.turn = state.turn === RED ? BLACK : RED;
  return h;
}

// 当前行棋方状态: check=被将军, over=无棋可走(绝杀/困毙皆负), winner
export function gameStatus(state) {
  const color = state.turn;
  const check = isInCheck(state.pieces, color);
  const any = hasLegalMoves(state.pieces, color);
  return { check, over: !any, winner: any ? null : (color === RED ? BLACK : RED) };
}
