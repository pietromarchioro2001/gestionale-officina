// 🔥 IMPORT FIREBASE
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// 🔥 CONFIG FIREBASE (METTI I TUOI DATI REALI)
firebase.initializeApp({
  apiKey: "AIzaSyC4OPs05sPxSb5H6LQSwV9b4-bMrGfMYjY",
  authDomain: "goldencar-notifiche.firebaseapp.com",
  projectId: "goldencar-notifiche",
  storageBucket: "goldencar-notifiche.firebasestorage.app",
  messagingSenderId: "932662604015",
  appId: "1:932662604015:web:2d3a38bcbdd9c12253ab1a"
});

const messaging = firebase.messaging();


// =============================
// 🔥 CACHE OFFLINE (PWA)
// =============================

const CACHE = "officina-v2";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/style.css",
        "/app.js",
        "/logo.png"
      ]);
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});


// =============================
// 🔔 NOTIFICHE FIREBASE
// =============================

messaging.onBackgroundMessage(function(payload) {

  console.log("🔔 Notifica ricevuta:", payload);

  const title = payload.notification?.title || "Notifica";
  
  const options = {
    body: payload.notification?.body || "",
    icon: "/icon-192.png",
    badge: "/icon-96.png"
  };

  self.registration.showNotification(title, options);
});
