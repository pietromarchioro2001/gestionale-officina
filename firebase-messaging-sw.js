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

self.addEventListener('notificationclick', function(event) {

  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.openWindow(url)
  );

});

messaging.onBackgroundMessage(payload => {

  self.registration.showNotification(
    payload.data.title,
    {
      body: payload.data.body,
      icon: "/icon-192.png",
      data: payload.data
    }
  );

});
