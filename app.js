const BACKEND_URL = "https://script.google.com/macros/s/AKfycbyQkoinsAke8ffIxpd-UAVUTpPBVa6GfOKLFagt9AILxYo8OzMPs8m7o4J2CGSBtuo1/exec";

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

function caricaClienti() {
  const s = document.createElement("script");

  window.cbClienti = data => {
    document.getElementById("output").textContent =
      JSON.stringify(data, null, 2);
    s.remove();
  };

  s.src = BACKEND_URL + "?action=clienti&callback=cbClienti";
  document.body.appendChild(s);
}


