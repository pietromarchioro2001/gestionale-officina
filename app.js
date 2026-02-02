const BACKEND_URL = "https://script.google.com/macros/s/AKfycbydH35oTvp5Stne8ei7JsNHq8kaunWROtKWdRBMnwltHm3Z7lghMivlLnqGntRQMC21/exec";

// test semplice
function testBackend() {
  const s = document.createElement("script");

  window.testCallback = function (data) {
    document.getElementById("output").textContent =
      JSON.stringify(data, null, 2);
    s.remove();
  };

  s.src = BACKEND_URL + "?callback=testCallback";
  document.body.appendChild(s);
}

// clienti
function caricaClienti() {
  const s = document.createElement("script");

  window.clientiCallback = function (data) {
    document.getElementById("output").textContent =
      JSON.stringify(data, null, 2);
    s.remove();
  };

  s.src = BACKEND_URL + "?action=clienti&callback=clientiCallback";
  document.body.appendChild(s);
}





