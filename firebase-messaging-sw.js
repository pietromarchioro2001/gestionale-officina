importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC4OPs05sPxSb5H6LQSwV9b4-bMrGfMYjY",
  authDomain: "goldencar-notifiche.firebaseapp.com",
  projectId: "goldencar-notifiche",
  storageBucket: "goldencar-notifiche.firebasestorage.app",
  messagingSenderId: "932662604015",
  appId: "1:932662604015:web:2d3a38bcbdd9c12253ab1a"
});

const messaging = firebase.messaging();

// 🔔 gestione notifiche in background
messaging.onBackgroundMessage(function(payload) {
  console.log('Notifica ricevuta:', payload);

  const title = payload.notification.title;
  const options = {
    body: payload.notification.body,
    icon: "/icons/icon-192.png" // metti una tua icona
  };

  self.registration.showNotification(title, options);
});
