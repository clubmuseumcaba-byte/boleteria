// Guarda la app en el teléfono para que abra sin internet.
// Al publicar una versión nueva, cambiar VERSION para que los teléfonos la descarguen.
const VERSION = 'boleteria-v1';
const ARCHIVOS = [
  './', 'index.html', 'estilo.css', 'logica.js', 'exportar.js', 'app.js', 'manifest.webmanifest',
  'logo.jpg', 'logo-pdf.jpg', 'icono-180.png', 'icono-192.png', 'icono-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero lo guardado (abre al instante aunque no haya señal) y de fondo se actualiza desde internet.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardado = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; })
        .catch(() => guardado);
      if (guardado) { e.waitUntil(red); return guardado; }
      return red;
    }),
  );
});
