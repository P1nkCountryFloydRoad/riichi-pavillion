/* 离线支持：联网时总是取最新文件并顺手更新缓存，断网时回退到缓存。 */
const CACHE = 'queting-v5';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'icon.svg', 'css/style.css',
  'js/core.js', 'js/store.js', 'js/game.js', 'js/ai.js', 'js/mjai.js', 'js/records.js', 'js/settings.js', 'js/render.js', 'js/sound.js', 'js/ui.js', 'js/tutorial.js', 'js/main.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
