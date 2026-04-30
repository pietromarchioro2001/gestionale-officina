importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIza...",
  authDomain: "goldencar-notifiche.firebaseapp.com",
  projectId: "goldencar-notifiche",
  messagingSenderId: "932662604015",
  appId: "1:932662604015:web:2d3a38bcbdd9c12253ab1a"
});

const messaging = firebase.messaging();


// 🔥 NOTIFICHE BACKGROUND
messaging.onBackgroundMessage(payload => {

  const { title, body, url } = payload.data || {};

  self.registration.showNotification(title, {
    body: body,
    icon: "https://pietromarchioro2001.github.io/gestionale-officina/icon-192.png",
    badge: "https://pietromarchioro2001.github.io/gestionale-officina/icon-192.png",
    vibrate: [200, 100, 200], 
    data: { url }
  });

});


// 🔥 CLICK NOTIFICA
self.addEventListener("notificationclick", function(event) {

  event.notification.close();

  const url = event.notification.data?.url || "https://pietromarchioro2001.github.io/gestionale-officina/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(windowClients => {

        for (let client of windowClients) {
          if (client.url.includes("gestionale-officina")) {
            client.focus();
            client.navigate(url);
            return;
          }
        }

        return clients.openWindow(url);
      })
  );

});
