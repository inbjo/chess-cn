import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const output = new URL('../dist-cloudflare/', import.meta.url);
const html = readFileSync(new URL('index.html', output), 'utf8');

assert.match(html, /name="chess-deployment" content="cloudflare-static"/);
assert.match(html, /data-mode="ai"/);
assert.match(html, /data-mode="local"/);
assert.doesNotMatch(html, /id="btnModeOnline"/);
assert.match(html, /value="godogpaw"/);
assert.doesNotMatch(html, /value="pikafish"/);

for (const path of [
  'favicon.svg',
  'css/style.css',
  'js/main.js',
  'js/ai-worker.js',
  'assets/godogpaw.wasm',
  'vendor/three/build/three.module.js',
]) {
  assert.equal(existsSync(new URL(path, output)), true, `Cloudflare 产物缺少 ${path}`);
}

console.log('ok - Cloudflare Pages 专版仅保留 godogpaw 人机与本地双人入口');
