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

// PWA 离线支持：manifest、Service Worker 与图标必须随产物发布
assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(html, /navigator\.serviceWorker/);

for (const path of [
  'favicon.svg',
  'manifest.webmanifest',
  'sw.js',
  'css/style.css',
  'js/main.js',
  'js/ai-worker.js',
  'assets/godogpaw.wasm',
  'vendor/three/build/three.module.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
]) {
  assert.equal(existsSync(new URL(path, output)), true, `Cloudflare 产物缺少 ${path}`);
}

const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', output), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest 至少包含三枚图标');

const sw = readFileSync(new URL('sw.js', output), 'utf8');
assert.match(sw, /CORE_CACHE/, 'Service Worker 应包含核心缓存逻辑');

console.log('ok - Cloudflare Pages 专版仅保留 godogpaw 人机与本地双人入口，并支持 PWA 离线');
