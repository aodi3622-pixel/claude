// 离线缓存（网页版）：页面、文章和录音时间表在安装时就存好；录音第一次播放时存下，以后断网也能听。
// 修改任何文件后把版本号 +1，手机下次联网打开时会自动更新。
const CACHE = 'yasi-gendu-v6';
importScripts('articles/index.js');          // 文章目录（self.ARTICLES）
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './articles/index.js',
  './audio/words.js',
];
const ARTICLE_FILES = self.ARTICLES.flatMap(a => [`./articles/${a.id}.js`, `./audio/${a.id}/timings.js`]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(CORE).then(() => Promise.all(ARTICLE_FILES.map(f => c.add(f).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && res.status === 200) {               // 录音等：用到时存一份
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    })
  );
});
