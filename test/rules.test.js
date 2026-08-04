import assert from 'node:assert/strict';
import {
  RED, BLACK, createInitialState, pieceAt, pseudoMoves, legalMoves,
  isInCheck, applyMove, undo, gameStatus, hasLegalMoves,
} from '../js/rules.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok -', name); }

// ---- 初始局面 ----
t('初始 32 子，红方先行', () => {
  const s = createInitialState();
  assert.equal(s.pieces.length, 32);
  assert.equal(s.turn, RED);
  assert.equal(s.pieces.filter(p => p.color === RED).length, 16);
});

t('开局红方合法着法 = 44', () => {
  const s = createInitialState();
  let n = 0;
  for (const p of s.pieces.filter(p => p.color === RED)) n += legalMoves(s.pieces, p).length;
  assert.equal(n, 44);
});

t('开局黑方合法着法 = 44', () => {
  const s = createInitialState();
  let n = 0;
  for (const p of s.pieces.filter(p => p.color === BLACK)) n += legalMoves(s.pieces, p).length;
  assert.equal(n, 44);
});

// ---- 各兵种 ----
t('马蹩腿', () => {
  const s = createInitialState();
  const horse = pieceAt(s.pieces, 9, 1); // 红马
  let m = pseudoMoves(s.pieces, horse).map(x => `${x.row},${x.col}`).sort();
  assert.deepEqual(m, ['7,0', '7,2']); // 兵挡住正前方? 红马在(9,1): 正上(8,1)空 -> 可跳(7,0)(7,2); 横向被兵(6,?..)无关
  // 在马正前方放一个子堵住
  s.pieces.push({ id: 99, type: 'soldier', color: RED, row: 8, col: 1 });
  m = pseudoMoves(s.pieces, horse).map(x => `${x.row},${x.col}`).sort();
  assert.deepEqual(m, []); // 前方被堵，横向 (9,0)(9,2) 是己方车/相? col0=车 col2=相 挡腿
});

t('象不过河且塞象眼', () => {
  const s = createInitialState();
  const el = pieceAt(s.pieces, 9, 2); // 红相
  let m = pseudoMoves(s.pieces, el).map(x => `${x.row},${x.col}`).sort();
  assert.deepEqual(m, ['7,0', '7,4']);
  s.pieces.push({ id: 99, type: 'soldier', color: BLACK, row: 8, col: 1 }); // 塞眼
  m = pseudoMoves(s.pieces, el).map(x => `${x.row},${x.col}`).sort();
  assert.deepEqual(m, ['7,4']);
});

t('炮的翻山吃子', () => {
  const s = createInitialState();
  const cannon = pieceAt(s.pieces, 7, 1); // 红炮
  // 正前方黑炮在 (2,1)，中间无子 -> 不能吃
  let targets = pseudoMoves(s.pieces, cannon).filter(m => m.row === 2 && m.col === 1);
  assert.equal(targets.length, 0);
  // 红炮前进到 (5,1) 后仍无炮架
  cannon.row = 5;
  targets = pseudoMoves(s.pieces, cannon).filter(m => m.row === 2 && m.col === 1);
  assert.equal(targets.length, 0);
  // 在 (3,1) 放炮架
  s.pieces.push({ id: 99, type: 'soldier', color: RED, row: 3, col: 1 });
  targets = pseudoMoves(s.pieces, cannon).filter(m => m.row === 2 && m.col === 1);
  assert.equal(targets.length, 1);
});

t('兵过河前后走法', () => {
  const s = createInitialState();
  const sol = pieceAt(s.pieces, 6, 0); // 红兵
  assert.deepEqual(pseudoMoves(s.pieces, sol).map(x => `${x.row},${x.col}`), ['5,0']);
  sol.row = 4; // 过河
  const m = pseudoMoves(s.pieces, sol).map(x => `${x.row},${x.col}`).sort();
  assert.deepEqual(m, ['3,0', '4,1']);
});

t('将不出九宫 + 飞将', () => {
  const s = createInitialState();
  const gen = pieceAt(s.pieces, 9, 4);
  const m = pseudoMoves(s.pieces, gen).map(x => `${x.row},${x.col}`);
  assert.equal(m.length, 1); // 只能向前 (8,4)
  assert.deepEqual(m, ['8,4']);
  // 清空中路 -> 飞将可直接吃黑将
  for (const p of [...s.pieces]) {
    if (p.col === 4 && p.type !== 'general') s.pieces.splice(s.pieces.indexOf(p), 1);
  }
  const m2 = pseudoMoves(s.pieces, gen).map(x => `${x.row},${x.col}`).sort();
  assert.ok(m2.includes('0,4'));
});

t('飞将构成将军（白脸将）', () => {
  const s = createInitialState();
  for (const p of [...s.pieces]) {
    if (p.col === 4 && p.type !== 'general') s.pieces.splice(s.pieces.indexOf(p), 1);
  }
  assert.ok(isInCheck(s.pieces, BLACK));
  assert.ok(isInCheck(s.pieces, RED));
});

t('不能送将（非法着法被过滤）', () => {
  const s = createInitialState();
  // 中路清空，红帅与黑将照面；同时清掉红方双仕以便横移
  for (const p of [...s.pieces]) {
    if (p.type !== 'general' && (p.col === 4 || (p.color === RED && p.row === 9 && (p.col === 3 || p.col === 5)))) {
      s.pieces.splice(s.pieces.indexOf(p), 1);
    }
  }
  const gen = pieceAt(s.pieces, 9, 4);
  // 红帅走到 (8,4) 仍在同列 -> 走后仍被飞将 -> 非法
  const legal = legalMoves(s.pieces, gen).map(x => `${x.row},${x.col}`).sort();
  assert.ok(!legal.includes('8,4'));
  assert.ok(legal.includes('9,3') || legal.includes('9,5'));
});

// ---- 将杀 ----
t('中炮锁将+车封底线绝杀', () => {
  // 红炮(5,4)以红兵(3,4)为架将军；红车(0,0)封住 (0,3)/(0,5)
  const pieces = [
    { id: 1, type: 'general', color: BLACK, row: 0, col: 4 },
    { id: 2, type: 'general', color: RED, row: 9, col: 4 },
    { id: 3, type: 'cannon', color: RED, row: 5, col: 4 },
    { id: 4, type: 'soldier', color: RED, row: 3, col: 4 },
    { id: 5, type: 'chariot', color: RED, row: 0, col: 0 },
  ];
  const s = { pieces, turn: BLACK, history: [], lastMove: null };
  assert.ok(isInCheck(s.pieces, BLACK));
  const gen = pieces[0];
  // (0,3)/(0,5) 被车封，(1,4) 仍被炮封 -> 无任何合法着法
  assert.equal(legalMoves(s.pieces, gen).length, 0);
  const st = gameStatus(s);
  assert.ok(st.check);
  assert.ok(st.over);
  assert.equal(st.winner, RED);
});

t('困毙也算负（无子可动即败）', () => {
  const pieces = [
    { id: 1, type: 'general', color: BLACK, row: 0, col: 4 },
    { id: 2, type: 'general', color: RED, row: 9, col: 4 },
    { id: 3, type: 'chariot', color: RED, row: 1, col: 3 }, // 封 (0,3)(1,4)
    { id: 4, type: 'chariot', color: RED, row: 1, col: 5 }, // 封 (0,5)(1,4)
    { id: 5, type: 'soldier', color: RED, row: 5, col: 4 }, // 挡住中路避免飞将互吃
  ];
  // 黑将可走到 (0,3)? 被(1,3)车攻击。(0,5)被(1,5)攻击。(1,4)被双车攻击。困毙
  const s = { pieces, turn: BLACK, history: [], lastMove: null };
  const st = gameStatus(s);
  assert.ok(st.over);
  assert.equal(st.winner, RED);
});

// ---- 走子/悔棋 ----
t('applyMove / undo 还原', () => {
  const s = createInitialState();
  const cannon = pieceAt(s.pieces, 7, 1);
  const target = pieceAt(s.pieces, 0, 1); // 黑马
  applyMove(s, cannon, { row: 0, col: 1 }); // 炮八进七吃马? (7,1)->(0,1) 中间(2,1)黑炮作架 合法
  assert.equal(pieceAt(s.pieces, 0, 1).id, cannon.id);
  assert.equal(s.pieces.length, 31);
  assert.equal(s.turn, BLACK);
  undo(s);
  assert.equal(s.pieces.length, 32);
  assert.equal(pieceAt(s.pieces, 7, 1).id, cannon.id);
  assert.equal(pieceAt(s.pieces, 0, 1).id, target.id);
  assert.equal(s.turn, RED);
});

t('完整对局序列不报错', () => {
  const s = createInitialState();
  // 炮二平五 马8进7 马二进三 卒7进1
  const seq = [
    [7, 7, 7, 4], [0, 7, 2, 6], [9, 1, 7, 2], [3, 6, 4, 6],
  ];
  for (const [fr, fc, tr, tc] of seq) {
    const p = pieceAt(s.pieces, fr, fc);
    const legal = legalMoves(s.pieces, p);
    assert.ok(legal.some(m => m.row === tr && m.col === tc), `着法 ${fr},${fc}->${tr},${tc} 应合法`);
    applyMove(s, p, { row: tr, col: tc });
  }
  assert.equal(s.history.length, 4);
  assert.ok(hasLegalMoves(s.pieces, RED));
});

console.log(`\n${passed} 项测试全部通过`);
