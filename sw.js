// ==== SERVICE WORKER: PRESENSI DIGITAL PWA ====
const CACHE_NAME = 'presensi-pwa-v2.4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './input-absensi.html',
  './master-data.html',
  './laporan.html',
  './pengaturan.html',
  './absen-siswa.html',
  './kelola-admin.html',
  './log-aktivitas.html',
  './notifikasi.html',
  './manifest.json',
  './favicon.svg',
  './favicon.ico',
  './img/logo-sekolah.png',
  './img/logo-riau.png',
  './js/config.js',
  './js/tailwind-config.js',
  './js/logo-sekolah.js',
  './js/indexeddb-storage.js',
  './js/analytics-worker.js'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching PWA App Shell...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-While-Revalidate for Static Assets, Network-First for API
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests or Google Apps Script API calls
  if (req.method !== 'GET' || url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(req);

      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[SW] Offline fetch fallback:', req.url);
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
