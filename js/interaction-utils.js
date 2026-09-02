// 棋盘指针交互的纯函数，独立于 Three.js，便于覆盖鼠标、触摸和落点容错测试。

export function isPrimaryPointerActivation(event) {
  return event?.isPrimary !== false && event?.button === 0;
}

export function pointerTapTolerance(pointerType) {
  return pointerType === 'touch' ? 10 : 6;
}

export function nearestBoardSquare(x, z, cell, tolerance = cell * 0.46) {
  const col = Math.round(x / cell + 4);
  const row = Math.round(z / cell + 4.5);
  if (row < 0 || row > 9 || col < 0 || col > 8) return null;

  const centerX = (col - 4) * cell;
  const centerZ = (row - 4.5) * cell;
  if (Math.hypot(x - centerX, z - centerZ) > tolerance) return null;
  return { row, col };
}

export function findSnappedLegalMove(x, z, legalMoves, cell, tolerance = cell * 0.46) {
  const square = nearestBoardSquare(x, z, cell, tolerance);
  if (!square) return null;
  return legalMoves.find(move => move.row === square.row && move.col === square.col) || null;
}
