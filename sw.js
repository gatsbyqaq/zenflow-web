/* ZenFlow service worker：缓存静态资源，支持离线使用（仅 http/https 下注册） */
var CACHE = 'zenflow-v20-id';
var ASSETS = ['./', './index.html', './styles.css?v=20', './data.js?v=20', './streak.js?v=20', './app.js?v=20', './cloud.js?v=20', './admin.js?v=20', './config.js?v=20', './vendor/supabase.js?v=20', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.json'];
self.addEventListener('install', function (e) {
  // 安装时绕过浏览器 HTTP 缓存，确保缓存的是最新文件
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // 网络优先，失败时回退缓存（保证更新能及时生效，离线仍可用）
  // 同源请求使用 cache:'no-cache'：每次都向服务器校验，避免浏览器 HTTP 缓存（GitHub Pages max-age=600）返回旧版 CSS/JS
  var same = new URL(e.request.url).origin === location.origin;
  var req = same ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && same) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); }); }));
});
