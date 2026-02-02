const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxd3waQJf7MbKCCzQaSvjuV-3vHDcLI_PEdk-zCDr2YnNV11exMB39CSRAbXtlMfokj/exec";

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

