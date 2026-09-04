// 楚河漢界 Service Worker —— 离线缓存策略
// - 导航请求：网络优先，失败回退到缓存的 index.html，确保离线可进入战场
// - 同源静态资源：缓存优先（按去版本号后的路径作为键），未命中时联网并写入缓存
// - 跨源字体等资源：缓存优先，允许 opaque 响应，离线时回退已缓存副本
// - 安装时预缓存核心资源，激活时清理旧版本缓存

const CACHE_VERSION = 'chess-cn-v5';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = './';

// 预缓存的核心资源（路径不含版本查询串，运行时按需匹配带版本号的请求）
const PRECACHE_URLS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './css/style.css',
  './css/fonts.css',
  './assets/fonts/NotoSerifSC.woff2',
  './js/main.js',
  './js/rules.js',
  './js/pieces.js',
  './js/board3d.js',
  './js/fx.js',
  './js/ai-engine.js',
  './js/ai-worker.js',
  './js/model-assets.js',
  './js/online-utils.js',
  './js/interaction-utils.js',
  './js/visual-preferences.js',
  './js/wasm_exec.js',
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/controls/OrbitControls.js',
  './vendor/three/examples/jsm/loaders/GLTFLoader.js',
  './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './assets/godogpaw.wasm',
  './assets/models/general.glb',
  './assets/models/advisor.glb',
  './assets/models/elephant.glb',
  './assets/models/horse.glb',
  './assets/models/chariot.glb',
  './assets/models/cannon.glb',
  './assets/models/soldier.glb',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// 去掉版本查询串（?v=...）后返回纯路径，作为缓存键。
function normalizeCacheKey(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return request.url;
  return url.pathname;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CORE_CACHE);
      // 逐个预缓存，单文件失败不阻断安装；运行时仍可按需补缓存。
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response.clone());
          } catch (_) {
            /* 忽略：运行时缓存会兜底 */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 导航请求：网络优先，离线回退到缓存的入口文档。
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    // 仅缓存成功的 2xx 响应，避免 4xx/5xx 错误页覆盖离线入口
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(OFFLINE_URL, fresh.clone());
    }
    return fresh;
  } catch (_) {
    const core = await caches.open(CORE_CACHE);
    const cached =
      (await core.match(OFFLINE_URL)) ||
      (await core.match('./index.html')) ||
      (await caches.match(request));
    if (cached) return cached;
    return new Response('离线且未缓存入口文档', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// 同源静态资源：缓存优先，未命中联网并写入运行时缓存。
async function handleSameOriginAsset(request) {
  const key = normalizeCacheKey(request);
  const cached = await caches.match(key, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(key, response.clone());
    }
    return response;
  } catch (_) {
    const fallback = await caches.match(key, { ignoreSearch: true });
    if (fallback) return fallback;
    throw _;
  }
}

// 跨源资源（字体等）：缓存优先，允许 opaque 响应，离线回退。
async function handleCrossOrigin(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    // 保留原始 request.mode，避免破坏 no-cors 跨源资源
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 不拦截服务端 API（人机 Pikafish / 联机房间）——离线时这些功能自然不可用，
  // 但本地 godogpaw WASM 引擎与双人模式完全离线可玩。
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // 导航请求走网络优先策略。
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // 同源资源走缓存优先。
  if (url.origin === self.location.origin) {
    event.respondWith(handleSameOriginAsset(request));
    return;
  }

  // 跨源资源（字体等）走缓存优先 + opaque 兜底。
  event.respondWith(handleCrossOrigin(request));
});
