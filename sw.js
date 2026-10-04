/* ZenFlow service worker：缓存静态资源，支持离线使用（仅 http/https 下注册） */
var CACHE = 'zenflow-v7-solid';
var ASSETS = ['./', './index.html', './styles.css', './data.js', './app.js', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.json'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // 网络优先，失败时回退缓存（保证更新能及时生效，离线仍可用）
  e.respondWith(fetch(e.request).then(function (res) {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); }); }));
});
