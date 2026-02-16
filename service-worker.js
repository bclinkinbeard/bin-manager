const CACHE_NAME = 'binmanager-v5';
const FONT_CACHE = 'binmanager-fonts-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './src/app.js',
  './src/db.js',
  './src/scanner.js',
  './manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const keep = new Set([CACHE_NAME, FONT_CACHE]);
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isGoogleFont(url) {
  return url.origin === 'https://fonts.googleapis.com' ||
         url.origin === 'https://fonts.gstatic.com';
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Google Fonts: stale-while-revalidate
  if (isGoogleFont(url)) {
    e.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const fetched = fetch(e.request)
            .then((response) => {
              cache.put(e.request, response.clone());
              return response;
            })
            .catch(() => cached); // fallback to cache on network failure
          return cached || fetched;
        })
      )
    );
    return;
  }

  // Everything else: cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).catch(() => new Response('Offline', { status: 503 }))
    )
  );
});
