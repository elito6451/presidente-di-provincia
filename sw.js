const CACHE_NAME = 'presidente-provincia-v6';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/config.js',
  './js/format.js',
  './js/state.js',
  './js/research.js',
  './js/challenges.js',
  './js/storage.js',
  './js/audio.js',
  './js/gacha.js',
  './js/match.js',
  './js/events.js',
  './js/assistant.js',
  './js/cutscenes.js',
  './js/canvas/themes.js',
  './js/canvas/buildings.js',
  './js/canvas/entities.js',
  './js/canvas/stadium.js',
  './js/ui/icons.js',
  './js/ui/hud.js',
  './js/ui/tabs.js',
  './js/ui/modals.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Strategia Network-First con fallback su cache per aggiornamenti immediati + offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
