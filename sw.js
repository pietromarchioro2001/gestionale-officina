const CACHE_NAME = "officina-v3";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/gestionale-officina/logo.png"
];

// INSTALL
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ACTIVATE (pulizia vecchie cache)
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// FETCH
self.addEventListener("fetch", event => {
  const req = event.request;

  // 🔥 PRIORITÀ: logo → cache first (istantaneo)
  if (req.url.includes("logo.png")) {
    event.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
    return;
  }

  // ⚡ STATICI → cache first
  if (STATIC_ASSETS.some(a => req.url.includes(a))) {
    event.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
    return;
  }

  // 🌐 ALTRO → network first
  event.respondWith(
    fetch(req)
      .then(res => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, res.clone());
          return res;
        });
      })
      .catch(() => caches.match(req))
  );
});
