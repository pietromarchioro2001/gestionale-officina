alert("APP.JS CARICATO");
const API_URL = "https://script.google.com/macros/s/AKfycbydH35oTvp5Stne8ei7JsNHq8kaunWROtKWdRBMnwltHm3Z7lghMivlLnqGntRQMC21/exec";
/* =====================================================
   ADAPTER google.script.run
   Serve per far funzionare il codice Apps Script su web
   ===================================================== */

(function () {
  if (window.google && window.google.script && window.google.script.run) {
    // Siamo ancora in Apps Script → non fare nulla
    return;
  }

  window.google = window.google || {};
  google.script = google.script || {};

  let _success = null;
  let _failure = null;

  google.script.run = {
    withSuccessHandler(cb) {
      _success = cb;
      return this;
    },
    withFailureHandler(cb) {
      _failure = cb;
      return this;
    }
  };

  const proxy = new Proxy(google.script.run, {
    get(target, prop) {
      if (prop in target) return target[prop];

      // chiamata backend generica
      return function (...args) {
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: prop,
            args
          })
        })
          .then(r => r.json())
          .then(res => {
            _success && _success(res);
          })
          .catch(err => {
            console.error("Backend error:", err);
            _failure && _failure(err);
          });
      };
    }
  });

  google.script.run = proxy;
})();

document.addEventListener("DOMContentLoaded", () => {
  showSection("home");
});





