import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

// index.html 必须声明 manifest 与 Service Worker 注册
const html = readFileSync(new URL('index.html', root), 'utf8');
assert.match(html, /rel="manifest" href="manifest\.webmanifest"/, 'index.html 缺少 manifest 链接');
assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/, 'index.html 缺少 apple-touch-icon');
assert.match(html, /name="theme-color" content="#6f1713"/, 'index.html 缺少 theme-color');
assert.match(html, /navigator\.serviceWorker/, 'index.html 未注册 Service Worker');
assert.doesNotMatch(html, /fonts\.googleapis\.com/, '不应再依赖 Google Fonts 服务器');
assert.match(html, /css\/fonts\.css/, '应引用本地字体样式表');

// manifest 字段校验
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
assert.equal(manifest.name, '楚河漢界 · 3D 中国象棋');
assert.equal(manifest.short_name, '楚河漢界');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'zh-CN');
assert.equal(manifest.scope, './');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest 至少包含三枚图标');
assert.ok(
  manifest.icons.some((icon) => icon.purpose === 'maskable'),
  'manifest 必须包含 maskable 图标以适配各系统图标裁剪',
);

// Service Worker 必须实现核心缓存与离线回退逻辑
const sw = readFileSync(new URL('sw.js', root), 'utf8');
assert.match(sw, /CORE_CACHE/, 'Service Worker 缺少核心缓存常量');
assert.match(sw, /handleNavigation/, 'Service Worker 缺少导航回退逻辑');
assert.match(sw, /addEventListener\('install'/, 'Service Worker 缺少 install 事件');
assert.match(sw, /addEventListener\('activate'/, 'Service Worker 缺少 activate 事件');
assert.match(sw, /addEventListener\('fetch'/, 'Service Worker 缺少 fetch 事件');
assert.match(sw, /godogpaw\.wasm/, 'Service Worker 预缓存列表应包含 WASM 引擎');
assert.match(sw, /NotoSerifSC\.woff2/, 'Service Worker 预缓存列表应包含本地字体');
assert.match(sw, /fresh\.ok/, 'Service Worker 导航缓存应仅缓存 2xx 响应');

console.log('ok - PWA 离线支持（manifest、Service Worker、图标）配置完整');
