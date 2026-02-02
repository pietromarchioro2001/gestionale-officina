const BACKEND_URL = "https://script.google.com/macros/s/AKfycby7hUf8Kd1l4oRQKUFs8ZSZfLketxKpLpBTzAxyY2MzRnfo8YG15_du8HDDEVXfL4PW/exec";

function testBackend() {
  fetch(BACKEND_URL)
    .then(r => r.text())
    .then(t => {
      document.getElementById("output").textContent = t;
    })
    .catch(e => {
      document.getElementById("output").textContent = e;
    });
}

// PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
