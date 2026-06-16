const CACHE_NAME = 'otsetee-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Paigaldamine ja failide vahemällu lisamine
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Vana vahemälu puhastamine
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Päringute vahendamine (Network-first strateegia dünaamilise kaardi jaoks)
self.addEventListener('fetch', (event) => {
  // Kaardiruute ja API päringuid ei hakka staatiliselt vahemällu suruma
  if (event.request.url.includes('tile.basemaps.cartocdn.com') || event.request.url.includes('nominatim')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Kui võrk toimib, uuendame vahemälu ja tagastame vastuse
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Kui võrku pole, võtame vahemälust (offline režiim)
        return caches.match(event.request);
      })
  );
});
