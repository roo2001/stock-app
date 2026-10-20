// sw.js - Service Worker for PWA (v21 캐시 갱신)
const CACHE_NAME = 'stock-shorts-pwa-v21';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './stock_master.js',
  './app.js',
  './watchlist.json',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // 즉시 새 버전 활성화
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  // 이전 구버전 캐시 전부 삭제
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('googleapis.com')) {
    return;
  }
  // 네트워크 우선 시도 후 캐시 폴백 (항상 최신 버전 반영)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

