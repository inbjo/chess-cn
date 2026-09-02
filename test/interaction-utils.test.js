import assert from 'node:assert/strict';
import {
  findSnappedLegalMove,
  isPrimaryPointerActivation,
  nearestBoardSquare,
  pointerTapTolerance,
} from '../js/interaction-utils.js';

const CELL = 2.6;

assert.equal(isPrimaryPointerActivation({ button: 0, isPrimary: true }), true);
assert.equal(isPrimaryPointerActivation({ button: 1, isPrimary: true }), false);
assert.equal(isPrimaryPointerActivation({ button: 2, isPrimary: true }), false);
assert.equal(isPrimaryPointerActivation({ button: 0, isPrimary: false }), false);

assert.equal(pointerTapTolerance('mouse'), 6);
assert.equal(pointerTapTolerance('touch'), 10);

assert.deepEqual(nearestBoardSquare(0, 11.7, CELL), { row: 9, col: 4 });
assert.deepEqual(nearestBoardSquare(1.05, 11.7, CELL), { row: 9, col: 4 });
assert.equal(nearestBoardSquare(1.25, 11.7, CELL), null);
assert.equal(nearestBoardSquare(0, 15, CELL), null);

const legalMoves = [{ row: 8, col: 4 }, { row: 7, col: 4 }];
assert.deepEqual(findSnappedLegalMove(0.9, 9.1, legalMoves, CELL), legalMoves[0]);
assert.equal(findSnappedLegalMove(2.6, 9.1, legalMoves, CELL), null);

console.log('ok - 主键落子与棋盘坐标吸附容错');
