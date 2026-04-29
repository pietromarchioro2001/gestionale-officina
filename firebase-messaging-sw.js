importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "QUI_LA_TUA_API_KEY",
  authDomain: "QUI",
  projectId: "QUI",
  storageBucket: "QUI",
  messagingSenderId: "QUI",
  appId: "QUI"
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
