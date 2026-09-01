import assert from 'node:assert/strict';
import { WASM_DIFFICULTY, uciToMove } from '../js/ai-engine.js';

assert.deepEqual(uciToMove('b2e2'), {
  from: { row: 7, col: 1 },
  to: { row: 7, col: 4 },
});
assert.throws(() => uciToMove('z9a0'), /无效棋步/);
assert.deepEqual(Object.keys(WASM_DIFFICULTY), ['easy', 'medium', 'hard', 'master']);
assert.deepEqual(WASM_DIFFICULTY.easy, { depth: 2, timeMs: 70 });
assert.ok(WASM_DIFFICULTY.easy.depth < WASM_DIFFICULTY.medium.depth);
assert.ok(WASM_DIFFICULTY.medium.depth < WASM_DIFFICULTY.hard.depth);
assert.ok(WASM_DIFFICULTY.hard.depth < WASM_DIFFICULTY.master.depth);
console.log('ok - WASM AI 坐标与难度配置');
