importScripts('./wasm_exec.js');

const requiredApis = [
  'engineNewGame',
  'engineDoMoveBySquares',
  'engineSearch',
];

function moveToSquares(move) {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(move)) throw new Error(`无效棋步：${move}`);
  const square = (file, rank) => Number(rank) * 9 + file.charCodeAt(0) - 97;
  return [square(move[0], move[1]), square(move[2], move[3])];
}

async function loadEngine() {
  const go = new Go();
  const response = await fetch('../assets/godogpaw.wasm');
  let result;
  try {
    result = await WebAssembly.instantiateStreaming(response.clone(), go.importObject);
  } catch {
    result = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  }
  void go.run(result.instance);
  await new Promise(resolve => setTimeout(resolve, 0));
  const missing = requiredApis.filter(name => typeof self[name] !== 'function');
  if (missing.length) throw new Error(`WASM 接口缺失：${missing.join(', ')}`);
}

const ready = loadEngine();
ready.then(
  () => postMessage({ type: 'ready' }),
  error => postMessage({ type: 'init-error', error: error.message || String(error) }),
);

self.onmessage = async event => {
  const { id, type, moves, depth, timeMs } = event.data || {};
  if (type !== 'search') return;
  try {
    await ready;
    engineNewGame('');
    for (const move of moves) {
      const [from, to] = moveToSquares(move);
      if (!engineDoMoveBySquares(from, to)) throw new Error(`WASM 无法重放棋步：${move}`);
    }
    const move = await engineSearch(depth, timeMs);
    if (!/^[a-i][0-9][a-i][0-9]$/.test(move)) throw new Error('WASM 未返回合法棋步');
    postMessage({ type: 'result', id, move });
  } catch (error) {
    postMessage({ type: 'search-error', id, error: error.message || String(error) });
  }
};
