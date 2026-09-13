const CACHE_NAME = 'inventario-florestal-shell-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/validation.js',
  './js/stats.js',
  './js/export.js',
  './js/reports.js',
  './js/screens/projetos.js',
  './js/screens/coleta.js',
  './js/screens/parcelas.js',
  './js/screens/talhoes.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

// Cache-first para o app shell; nunca intercepta dados (só há IndexedDB local, sem rede de dados).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((resposta) => resposta || fetch(event.request))
  );
});
