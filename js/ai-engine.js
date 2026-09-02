export const WASM_DIFFICULTY = Object.freeze({
  easy: Object.freeze({ depth: 1, timeMs: 40 }),
  medium: Object.freeze({ depth: 4, timeMs: 220 }),
  hard: Object.freeze({ depth: 8, timeMs: 600 }),
  master: Object.freeze({ depth: 10, timeMs: 1300 }),
});

export function uciToMove(uci) {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) throw new Error(`AI 返回了无效棋步：${uci}`);
  const square = (file, rank) => ({ col: file.charCodeAt(0) - 97, row: 9 - Number(rank) });
  return { from: square(uci[0], uci[1]), to: square(uci[2], uci[3]) };
}

let worker = null;
let readyPromise = null;
let readyResolve = null;
let readyReject = null;
let nextId = 1;
const pending = new Map();

function stopWorker(error) {
  const active = worker;
  worker = null;
  readyPromise = null;
  readyResolve = null;
  readyReject = null;
  active?.terminate();
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}

function ensureWorker() {
  if (worker) return readyPromise;
  worker = new Worker(new URL('./ai-worker.js?v=20260901.3', import.meta.url));
  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  worker.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'ready') {
      readyResolve?.();
      return;
    }
    if (message.type === 'init-error') {
      const error = new Error(message.error || 'WASM AI 初始化失败');
      readyReject?.(error);
      stopWorker(error);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === 'result') request.resolve(message.move);
    else request.reject(new Error(message.error || 'WASM AI 搜索失败'));
  });
  worker.addEventListener('error', event => {
    const error = new Error(event.message || 'WASM AI Worker 异常');
    readyReject?.(error);
    stopWorker(error);
  });
  return readyPromise;
}

export async function probeWasmAi() {
  await ensureWorker();
  return true;
}

export async function searchWasmAi(moves, difficulty) {
  const limits = WASM_DIFFICULTY[difficulty];
  if (!limits) throw new Error(`WASM AI 不支持难度：${difficulty}`);
  await ensureWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('WASM AI 响应超时');
      stopWorker(error);
    }, limits.timeMs + 5000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ type: 'search', id, moves, ...limits });
  });
}

export function resetWasmAi() {
  if (worker) stopWorker(new Error('WASM AI 请求已取消'));
}
