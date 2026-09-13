// CACHE_NAME é uma string literal (não importada) de propósito: o navegador só
// detecta uma versão nova comparando os bytes DESTE arquivo — se o nome do
// cache viesse de um módulo importado, mudar só esse módulo não seria
// percebido como atualização. Suba esse número junto com js/versao.js.
const CACHE_NAME = 'inventario-florestal-shell-v1.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/versao.js',
  './js/atualizacao.js',
  './js/db.js',
  './js/validation.js',
  './js/stats.js',
  './js/export.js',
  './js/reports.js',
  './js/confirmacao.js',
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
  // Sem skipWaiting() aqui: uma versão nova fica "esperando" até o usuário
  // confirmar a atualização explicitamente (ver js/atualizacao.js). Evita
  // trocar o app sozinho no meio de uma coleta em campo.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

// A página manda essa mensagem só depois que o usuário clica em "Atualizar
// agora" — é o único jeito da versão nova passar a valer.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Cache-first para o app shell; nunca intercepta dados (só há IndexedDB local, sem rede de dados).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((resposta) => resposta || fetch(event.request))
  );
});
