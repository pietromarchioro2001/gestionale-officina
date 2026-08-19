const API_URL = "https://script.google.com/macros/s/AKfycbyjNlr3LBys_7d47ZlZykTrbrY448Cever_Z3cASz04XSqXi_vtUfsQ9qYQy5tkZTJV/exec";

const ICON_CALENDAR = `
<svg viewBox="0 0 24 24">
  <rect x="3" y="5" width="18" height="16" rx="3"/>
  <line x1="16" y1="3" x2="16" y2="7"/>
  <line x1="8" y1="3" x2="8" y2="7"/>
  <line x1="3" y1="11" x2="21" y2="11"/>
</svg>
`;

const UI = {
  error(msg, context = "") {
    const fullMsg = context ? `[${context}] ${msg}` : msg;
    console.error("❌", fullMsg);
    
    // Mostra all'utente (usa la tua showAlert esistente)
    if (typeof showAlert === "function") {
      showAlert("⚠️ " + (msg || "Si è verificato un errore"));
    }
  },
  success(msg) {
    console.log("✅", msg);
    if (typeof showAlert === "function") {
      showAlert("✅ " + msg);
    }
  }
};

let TEMP_LIBRETTO_ID = null;
let TEMP_TARGA_ID = null;
let TEMP_ALTRI_DOCUMENTI = [];
let VEICOLI_ALL = [];
let cacheSchede = null;
let cacheOrdini = null;
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let voceAssistente = null;
let confirmCallback = null;
let promptCallback = null;
let ID_CLIENTE_SCELTO = null;
let TARGA_VEICOLO_ORIGINALE = null;
let CLIENTI_CACHE = [];
let CACHE_REVISIONI = null;
let CLIENTI_VEICOLI_CACHE = [];
let autoOpenSection = false;
let currentSection = "home";
let ORDINI_CACHE = null;
let CLIENTI_CACHE_POPUP = null;
let CLIENTI_CACHE_TS = 0;
let uploadLibrettoInCorso = false;
const CLIENTI_CACHE_TTL = 5 * 60 * 1000; // 5 minuti


function sanitizeInput(str, mode = "text") {
  if (!str && str !== 0) return "";
  
  let s = String(str).trim();
  
  // Modalità specifiche
  if (mode === "targa") {
    // Solo lettere maiuscole e numeri, max 8 caratteri
    return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }
  if (mode === "cf") {
    // Codice fiscale: 16 caratteri alfanumerici maiuscoli
    return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  }
  if (mode === "phone") {
    // Telefono: solo numeri, +, spazi, parentesi
    return s.replace(/[^0-9+\s()-]/g, "").slice(0, 20);
  }
  if (mode === "number") {
    // Numeri decimali
    const num = parseFloat(s.replace(",", "."));
    return isNaN(num) ? "" : num;
  }
  
  // Default: testo normale, rimuovi tag HTML e limita lunghezza
  return s
    .replace(/[<>]/g, "")      // Rimuove < e > per prevenire XSS
    .replace(/\s+/g, " ")      // Collassa spazi multipli
    .slice(0, 500);            // Limite di sicurezza
}

function toggleMicIndicator(state) {

  const mic1 = document.getElementById("micOrdini");
  const mic2 = document.getElementById("micAssistente");

  if (mic1) mic1.classList.toggle("hidden", !state);
  if (mic2) mic2.classList.toggle("hidden", !state);
}

function showConfirm(msg, callback){
  document.getElementById("confirmText").textContent = msg;
  document.getElementById("confirmBox").classList.remove("hidden");
  confirmCallback = callback;
}

function confirmYes(){
  document.getElementById("confirmBox").classList.add("hidden");
  if(confirmCallback) confirmCallback(true);
}

function confirmNo(){
  document.getElementById("confirmBox").classList.add("hidden");
  if(confirmCallback) confirmCallback(false);
}

window.checkNotificheHome = function(){

  callBackend("getNotificheHome")
    .then(res => {

      if(!res) return;

      // ===== ORDINI (NUOVO SISTEMA STABILE)
      const lastOrdineBackend = res.ultimoOrdine
        ? new Date(res.ultimoOrdine).getTime()
        : null;

      const lastOrdineLocal = Number(
        localStorage.getItem("last_created_order")
      );

      const showOrdini =
        lastOrdineLocal &&
        lastOrdineBackend &&
        lastOrdineBackend <= lastOrdineLocal;

      // ===== SCHEDE (backend timestamp)
      const schedaTS = res.ultimaScheda
        ? new Date(res.ultimaScheda).getTime()
        : null;

      let lastSeenSchede = Number(
        localStorage.getItem("schede_last_seen") || 0
      );

      if(!lastSeenSchede && schedaTS){
        localStorage.setItem("schede_last_seen", schedaTS);
        lastSeenSchede = schedaTS;
      }

      const showSchede =
        schedaTS &&
        schedaTS > lastSeenSchede;

      toggleBadgeSchede(!!showSchede);

      // ===== REVISIONI
      toggleWarningRevisioni(!!res.revisioneWarning);

    })
    .catch(err => console.error(err));
};

window.toggleWarningRevisioni = function(show){
  const el = document.getElementById("badgeRevisioni");
  if(!el) return;
  el.classList.toggle("show", show);
};

function showAlert(msg){
  const box = document.getElementById("customAlert");
  const text = document.getElementById("customAlertText");

  text.textContent = msg;
  box.classList.remove("hidden");
}

function showPrompt(callback){

  const box = document.getElementById("promptBox");
  const input = document.getElementById("promptInput");

  if(!box || !input){
  UI.error("Popup ordine non trovato nel DOM", "showPrompt");
  return;
}

  input.value = "";
  box.classList.remove("hidden");

  setTimeout(()=>input.focus(),100);

  promptCallback = callback;
}

function promptOk(){

  const input = document.getElementById("promptInput");
  const val = input.value.trim();

  document.getElementById("promptBox").classList.add("hidden");

  if(promptCallback) promptCallback(val);

}

function promptCancel(){

  document.getElementById("promptBox").classList.add("hidden");

}
function closeAlert(){
  document.getElementById("customAlert").classList.add("hidden");
}

function listaVoci() {
  const voci = speechSynthesis.getVoices();
  voci.forEach(v => console.log(v.name, v.lang));
}

function callBackend(action, args = []) {

  return new Promise((resolve, reject) => {

    const cb = "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    const script = document.createElement("script");

    const cleanup = () => {
      try { delete window[cb]; } catch {}
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout backend"));
    }, 30000);

    window[cb] = function(res) {
  
    clearTimeout(timeout);
    cleanup();
  
    if (
      res &&
      typeof res === "object" &&
      !Array.isArray(res) &&
      res.ok === false
    ) {
  
      reject(
        new Error(
          res.error ||
          "Errore restituito dal backend"
        )
      );
  
      return;
    }
  
    resolve(res);
  };
    script.src =
      `${API_URL}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(JSON.stringify(args))}&callback=${cb}`;

    script.onerror = function() {
      cleanup();
      reject(new Error("Errore caricamento backend"));
    };

    document.body.appendChild(script);

  });
}

function leggiTargaItaliana(targa) {

  const numeri = {
    "0": "zero",
    "1": "uno",
    "2": "due",
    "3": "tre",
    "4": "quattro",
    "5": "cinque",
    "6": "sei",
    "7": "sette",
    "8": "otto",
    "9": "nove"
  };

  let risultato = "";

  for (let c of targa) {

    if (numeri[c]) {
      risultato += numeri[c] + " ";
    } else {
      risultato += c + " ";
    }

  }

  return risultato.trim();

}

function toggleFullscreenMenu() {
  document.getElementById("fullscreenMenu")
    .classList.toggle("active");
}

function goToSection(id) {
  showSection(id);
  toggleFullscreenMenu();
}

function homeCaricaLibrettoGallery() {
  showSection('clienti');
  setTimeout(() => {
    document.getElementById('librettoGallery').click();
  }, 200);
}

function refreshSchede(btn){

  btn.classList.add("loading");

  const lista = document.getElementById("listaSchede");
  if (lista) lista.innerHTML = "";

  caricaSchede(true);

  setTimeout(() => {
    btn.classList.remove("loading");
  }, 800);

}

function refreshOrdini(btn){

  btn.classList.add("loading");

  const lista = document.getElementById("listaOrdini");
  if (lista) lista.innerHTML = "";

  caricaOrdiniUI(true);

  setTimeout(() => {
    btn.classList.remove("loading");
  }, 800);

}

function homeCaricaLibrettoCamera() {
  showSection('clienti');
  setTimeout(() => {
    document.getElementById('librettoCamera').click();
  }, 200);
}

function popolaFormOCR(dati = {}) {

  document.getElementById("nome").value = dati.nomeCliente || "";
  document.getElementById("indirizzo").value = dati.indirizzo || "";
  document.getElementById("data").value = dati.dataNascita || "";
  document.getElementById("cf").value = dati.codiceFiscale || "";

  document.getElementById("veicolo").value = dati.veicolo || "";
  document.getElementById("motore").value = dati.motore || "";
  document.getElementById("targa").value = dati.targa || "";
  document.getElementById("immatricolazione").value =
    dati.immatricolazione || "";
}

function detectMobile() {
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.innerWidth < 900;

  if (isMobile) {
    document.documentElement.classList.add("is-mobile");
    document.body.classList.add("is-mobile");
  } else {
    document.documentElement.classList.remove("is-mobile");
    document.body.classList.remove("is-mobile");
  }
}

window.addEventListener("resize", detectMobile);
document.addEventListener("DOMContentLoaded", detectMobile);

const SIGLE_MAIUSCOLE = [
  "DSG",
  "ABS",
  "ESP",
  "ASR",
  "TDI",
  "TSI",
  "GPL",
  "METANO",
  "EGR",
  "FAP",
  "DPF",
  "AIRBAG",
  "ADAS"
];


let CACHE_ORDINI = null;
let CACHE_TS = 0;
const CACHE_TTL = 10 * 60 * 1000;
let librettoLink;
let targaLink;
let btnCartellaCliente;
let clienteEsistente = false;
let assistenteInChiusura = false;
let rispostaInElaborazione = false;

async function analizza() {

  if (uploadLibrettoInCorso) {
    showAlert("⏳ Attendi: il libretto è ancora in caricamento.");
    return;
  }

  if (!TEMP_LIBRETTO_ID) {
    showAlert("⚠️ Carica prima il libretto e attendi il completamento.");
    return;
  }

  startLoading("loadingOCR");

  try {
    console.log("🔍 Avvio OCR con fileId:", TEMP_LIBRETTO_ID);

    const res = await callBackend("ocrLibrettoDaFile", [TEMP_LIBRETTO_ID]);

    console.log("RISPOSTA OCR:", res);

    if (!res?.ok) {
      throw new Error(res?.error || "OCR fallito");
    }

    const dati = res.datiOCR || {};

    if (dati.targa) {

  const targaNormalizzata =
    String(dati.targa)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const targaCredibile =
    /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(
      targaNormalizzata
    ) ||
    (
      targaNormalizzata.length >= 5 &&
      targaNormalizzata.length <= 8 &&
      /[A-Z]/.test(targaNormalizzata) &&
      /[0-9]/.test(targaNormalizzata)
    );

  dati.targa =
    targaCredibile
      ? targaNormalizzata
      : "";
}

    if (!Object.keys(dati).length) {
      showAlert("⚠️ OCR completato ma non sono stati letti dati utili. Prova una foto più nitida.");
      return;
    }

    if (dati?.targa) {
      const check = await callBackend("checkTargaEsistente", [dati.targa]);

      if (check === true) {
        showAlert("⚠️ Veicolo già esistente nel sistema.");
        cercaVeicoloConTarga(dati.targa);
        return;
      }
    }

    popolaFormOCR(dati);
    showAlert("✅ OCR completato");

  } catch(err) {
    console.error("❌ Errore OCR:", err);
    UI.error("Errore OCR: " + err.message, "analizza");
  } finally {
    stopLoading("loadingOCR");
  }
}

/********************
 * SALVATAGGIO
 ********************/
function salva() {
  
  console.log("TEMP_LIBRETTO_ID:", TEMP_LIBRETTO_ID);
  console.log("TEMP_TARGA_ID:", TEMP_TARGA_ID);
  console.log("ID_CLIENTE_SCELTO:", ID_CLIENTE_SCELTO);
  
  // 🔥 Raccogli i dati dal form
  const dati = raccogliDatiCliente();
  
  // 🔥 Controlli preliminari
  if (!dati.targa || !dati.targa.trim()) {
    showAlert("⚠️ Inserisci la targa del veicolo");
    return;
  }
  
  if (!dati.nomeCliente || !dati.nomeCliente.trim()) {
    showAlert("⚠️ Inserisci il nome del cliente");
    return;
  }
  
  // 🔥 Se NON c'è un cliente selezionato dalla ricerca → chiedi se è nuovo o esistente
  if (!ID_CLIENTE_SCELTO) {
    
    // Se mancano documenti, chiedi conferma
    if (!TEMP_LIBRETTO_ID && !TEMP_TARGA_ID) {
      showConfirm(
        "⚠️ Non hai caricato libretto o targa.\n\n" +
        "È consigliato inserirli per completezza del profilo.\n\n" +
        "Vuoi continuare comunque?",
        conferma => {
          if (!conferma) return;
          apriPopupModalitaSalvataggio(dati);
        }
      );
      return;
    }
    
    // Altrimenti apri direttamente il popup modalità
    apriPopupModalitaSalvataggio(dati);
    return;
  }
  
  // 🔥 Se c'è un cliente selezionato (ID_CLIENTE_SCELTO) → apri popup con le 3 opzioni
  // (l'utente può scegliere se sovrascrivere o aggiungere un nuovo veicolo)
  apriPopupModalitaSalvataggio(dati);
}

function apriPopupCliente() {

  console.log(
    "🗂️ apriPopupCliente chiamata"
  );

  const popup =
    document.getElementById(
      "popupRicercaCliente"
    );

  const input =
    document.getElementById(
      "ricercaClientePopup"
    );

  const lista =
    document.getElementById(
      "listaRicercaCliente"
    );

  if (!popup || !input || !lista) {

    console.error(
      "❌ Elementi popup clienti non trovati",
      {
        popup,
        input,
        lista
      }
    );

    return;
  }

  input.value = "";
  popup.classList.remove("hidden");

  setTimeout(() => {
    input.focus();
  }, 100);

  if (
    CLIENTI_CACHE_POPUP &&
    Date.now() - CLIENTI_CACHE_TS <=
      CLIENTI_CACHE_TTL
  ) {

    renderListaClienti(
      CLIENTI_CACHE_POPUP
    );

  } else {

    caricaClientiPopup(false);
  }

  if (
    !input.dataset.filtroInizializzato
  ) {

    initFiltroClientiPopup();

    input.dataset.filtroInizializzato =
      "true";
  }
}

function chiudiPopupRicerca(){
  document
    .getElementById("popupRicercaCliente")
    .classList.add("hidden");
}

function chiudiPopupCliente() {

  const popup =
    document.getElementById(
      "popupRicercaCliente"
    );

  if (!popup) {
    console.error(
      "❌ Popup #popupRicercaCliente non trovato"
    );
    return;
  }

  popup.classList.add("hidden");
}

function nuovoClientePopup(){

  chiudiPopupCliente();
  inviaSalvataggio();

}

function selezionaClientePopup(idCliente){

  ID_CLIENTE_SCELTO = idCliente;

  chiudiPopupCliente();

  inviaSalvataggio(idCliente);

}

function initFiltroClientiPopup() {
  const input = document.getElementById("ricercaClientePopup");
  if (!input) return;
  
  let debounceTimer = null;
  
  input.addEventListener("input", function() {
    const q = this.value.toLowerCase().trim();
    
    // 🔥 Debounce: aspetta 150ms prima di filtrare
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      
      // Se la query è vuota, mostra tutti
      if (!q) {
        renderListaClienti(CLIENTI_CACHE_POPUP || []);
        return;
      }
      
      // Filtra dalla cache (veloce, niente backend)
      const filtrati = (CLIENTI_CACHE_POPUP || []).filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.indirizzo?.toLowerCase().includes(q) ||
        c.targhe?.join(" ").toLowerCase().includes(q)
      );
      
      console.log("🔍 Filtrati " + filtrati.length + " clienti per '" + q + "'");
      renderListaClienti(filtrati);
      
    }, 150); // 150ms di debounce
  });
}

function caricaClientiPopup(force = false) {
  const now = Date.now();
  const box =
  document.getElementById(
    "listaRicercaCliente"
  );
  
  console.log("🔍 caricaClientiPopup - force:", force, "cache:", !!CLIENTI_CACHE_POPUP);
  
  // 🔥 Mostra subito loading se non c'è cache valida
  if (!CLIENTI_CACHE_POPUP || now - CLIENTI_CACHE_TS > CLIENTI_CACHE_TTL || force) {
    if (box) {
      box.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Caricamento clienti...</div>';
    }
  }
  
  // 🔥 Se c'è cache valida, mostra subito i risultati
  if (CLIENTI_CACHE_POPUP && now - CLIENTI_CACHE_TS <= CLIENTI_CACHE_TTL && !force) {
    console.log("✅ Uso cache clienti (" + CLIENTI_CACHE_POPUP.length + " elementi)");
    renderListaClienti(CLIENTI_CACHE_POPUP);
    return;
  }
  
  // 🔥 Altrimenti carica dal backend
  console.log("📡 Carico clienti dal backend...");
  
  callBackend("listaClientiCompleta", [])
    .then(lista => {
      console.log("✅ Ricevuti " + lista.length + " clienti dal backend");
      
      CLIENTI_CACHE_POPUP = lista;
      CLIENTI_CACHE_TS = now;
      
      renderListaClienti(lista);
    })
    .catch(err => {
      console.error("❌ Errore caricamento clienti:", err);
      if (box) {
        box.innerHTML = '<div style="padding:20px;text-align:center;color:#f44336;">Errore caricamento</div>';
      }
      
      // Fallback: usa cache vecchia se esiste
      if (CLIENTI_CACHE_POPUP) {
        console.log("⚠️ Fallback: uso cache vecchia");
        renderListaClienti(CLIENTI_CACHE_POPUP);
      }
    });
}

function renderListaClienti(lista){
  // 🔥 FIX: Usa l'ID corretto che esiste nell'HTML
  const box = document.getElementById("listaRicercaCliente");
  
  if (!box) {
    console.error("❌ ERRORE: #listaRicercaCliente non trovato nel DOM!");
    return;
  }
  
  box.innerHTML = "";

  lista.forEach(c => {
    const div = document.createElement("div");
    div.className = "cliente-riga-popup";

    div.innerHTML = `
      <strong>${c.nome}</strong><br>
      ${c.indirizzo || "-"}<br>
      <span style="color:#666;font-size:13px">
        ${c.targhe?.join(", ") || "NESSUN VEICOLO"}
      </span>
    `;

    div.onclick = () => selezionaClientePopup(c.id);
    box.appendChild(div);
  });
}

// Nel frontend (app.js), quando raccogli i dati:
function raccogliDatiCliente(){
  const telefonoRaw = document.getElementById("telefono")?.value || "";
  const telefonoSanitized = sanitizeInput(telefonoRaw, "phone");
  
  // 🔥 DEBUG: controlla ID_CLIENTE_SCELTO
  console.log("🔍 ID_CLIENTE_SCELTO (window):", window.ID_CLIENTE_SCELTO);
  console.log("🔍 ID_CLIENTE_SCELTO (locale):", ID_CLIENTE_SCELTO);
  
  const dati = {
    nomeCliente: sanitizeInput(document.getElementById("nome").value),
    indirizzo: sanitizeInput(document.getElementById("indirizzo").value),
    telefono: telefonoSanitized,
    dataNascita: sanitizeInput(document.getElementById("data").value),
    targaOriginale: TARGA_VEICOLO_ORIGINALE || null,
    codiceFiscale: sanitizeInput(document.getElementById("cf").value, "cf"),
    veicolo: sanitizeInput(document.getElementById("veicolo").value),
    motore: sanitizeInput(document.getElementById("motore").value),
    targa: sanitizeInput(document.getElementById("targa").value, "targa"),
    immatricolazione: sanitizeInput(document.getElementById("immatricolazione").value),
    revisione: document.getElementById("revisioneInput")?.dataset.raw || "",
    tempLibrettoId: TEMP_LIBRETTO_ID,
    tempTargaId: TEMP_TARGA_ID,
    altriDocumenti: TEMP_ALTRI_DOCUMENTI,
    
    // 🔥 FIX: Usa ID_CLIENTE_SCELTO direttamente (non window.ID_CLIENTE_SCELTO)
    idClienteForzato: ID_CLIENTE_SCELTO || null
  };
  
  console.log("📦 Dati da inviare:", dati);
  console.log("🔑 idClienteForzato:", dati.idClienteForzato);
  
  return dati;
}

/********************
 * INVIO BACKEND
 ********************/
function inviaSalvataggio(idClienteScelto = null) {

  const dati = raccogliDatiCliente();

  if (idClienteScelto) {
    dati.idClienteForzato = idClienteScelto;
  }

  callBackend("salvaClienteEVeicolo", [dati])
    .then(res => {

      if (!res.ok) {
        if (res.error === "VEICOLO_ESISTENTE") {
          UI.error("Veicolo già esistente: " + dati.targa, "salvaCliente");
          return;
        }
        UI.error("Salvataggio fallito: " + res.error, "salvaCliente");
        return;
      }

      showAlert("✅ Cliente salvato");

      clienteEsistente = true;

      if (res.cartellaVeicoloUrl) {
        window.open(res.cartellaVeicoloUrl, "_blank");
      }

    });

}

function apriPopupRicerca(){

  document
  .getElementById("popupRicercaCliente")
  .classList.remove("hidden");

  renderRicercaClienti(CLIENTI_VEICOLI_CACHE);
    ["searchNome","searchTarga","searchVeicolo"]
  .forEach(id=>{
  
    document.getElementById(id)
    .addEventListener("input", filtraRicercaClienti);
  
  });

}

function filtraRicercaClienti(){

  const nome = document
  .getElementById("searchNome").value.toLowerCase();

  const targa = document
  .getElementById("searchTarga").value.toLowerCase();

  const veicolo = document
  .getElementById("searchVeicolo").value.toLowerCase();

  const filtrati = CLIENTI_VEICOLI_CACHE.filter(r=>{

    return (
      r.nomeCliente.toLowerCase().includes(nome) &&
      r.targa.toLowerCase().includes(targa) &&
      r.veicolo.toLowerCase().includes(veicolo)
    );

  });

  renderRicercaClienti(filtrati);

}

function renderRicercaClienti(lista){

  const box = document.getElementById("listaRicercaCliente");
  box.innerHTML = "";

  lista.forEach(r=>{

    const div = document.createElement("div");
    div.className = "cliente-riga-popup";

    div.innerHTML = `
      <strong>${r.nomeCliente}</strong><br>
      ${r.indirizzo || "-"}<br>
      <span style="color:#666;font-size:13px">
        ${r.targa} — ${r.veicolo}
      </span>
    `;

    div.onclick = ()=>{
      selezionaClienteRicerca(r.targa);
    };

    box.appendChild(div);

  });

}

function selezionaClienteRicerca(targa){

  chiudiPopupRicerca();
  mostraLoadingRicerca();

  callBackend("cercaVeicolo_PROXY", [targa])
  .then(res => {

    if(!res || !res.veicolo){
      showAlert("Veicolo non trovato");
      nascondiLoadingRicerca();
      return;
    }

    const c = res.cliente || {};
    const v = res.veicolo || {};

    TARGA_VEICOLO_ORIGINALE =
  String(v.targa || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

console.log(
  "🚗 Targa originale selezionata:",
  TARGA_VEICOLO_ORIGINALE
);
    
    // 🔥 SALVA ID CLIENTE (fondamentale per il pulsante elimina)
    if (c.id) {
      ID_CLIENTE_SCELTO = c.id;
    }
    
    // Popola campi standard
    document.getElementById("nome").value = c.nome || "";
    document.getElementById("indirizzo").value = c.indirizzo || "";
    document.getElementById("telefono").value = c.telefono || "";
    document.getElementById("data").value = c.dataNascita || "";
    document.getElementById("cf").value = c.codiceFiscale || "";
    
    document.getElementById("veicolo").value = v.veicolo || "";
    document.getElementById("motore").value = v.motore || "";
    document.getElementById("targa").value = v.targa || "";
    document.getElementById("immatricolazione").value = v.immatricolazione || "";
    
    // 🔥 Mostra pulsante elimina SOLO se c'è un ID cliente
    const btnElimina = document.getElementById("btnEliminaCliente");
    if (btnElimina && ID_CLIENTE_SCELTO) {
      btnElimina.classList.remove("hidden");
      btnElimina.dataset.clienteId = ID_CLIENTE_SCELTO;
      console.log("✅ Pulsante elimina mostrato per ID:", ID_CLIENTE_SCELTO);
    }

    // 🔥 FIX REVISIONE: Leggi, formatta e salva dataset.raw
    const revisioneInput = document.getElementById("revisioneInput");
    if (revisioneInput && v.revisione) {
      const rawDate = v.revisione; // Formato backend: yyyy-MM-dd
      
      // Mostra in formato italiano (gg/mm/aaaa)
      revisioneInput.value = formatData(rawDate);
      
      // Salva il formato ISO per il salvataggio futuro
      revisioneInput.dataset.raw = rawDate;
    }

    // Mostra pulsanti documenti se presenti
    // 🔥 Mostra pulsanti documenti se ci sono URL
if (res.librettoUrl) {
  const link = document.getElementById("librettoLink");
  if (link) {
    link.href = res.librettoUrl;  // ← Ora funziona perché è un <a>!
    link.classList.remove("hidden");
  }
}

if (res.targaUrl) {
  const link = document.getElementById("targaLink");
  if (link) {
    link.href = res.targaUrl;
    link.classList.remove("hidden");
  }
}

if (res.cartellaClienteUrl) {
  const link = document.getElementById("btnCartellaCliente");
  if (link) {
    link.href = res.cartellaClienteUrl;
    link.classList.remove("hidden");
  }
}

    clienteEsistente = true;
    nascondiLoadingRicerca();

  })
  .catch(err => {
    nascondiLoadingRicerca();
    UI.error("Errore caricamento cliente: " + err.message, "selezionaClienteRicerca");
  });
}

// 🔥 VARIABILE GLOBALE PER ELIMINAZIONE
let TIPO_ELIMINAZIONE_TEMP = null;


function apriPopupEliminaScelta(e) {
  console.log("🗑️ [DEBUG] apriPopupEliminaScelta chiamata");
  
  // 🔥 FERMA LA PROPAGAZIONE DEL CLICK
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  
  const btnElimina = document.getElementById("btnEliminaCliente");
  console.log("🔍 [DEBUG] btnElimina:", btnElimina);
  
  if (!btnElimina) {
    console.error("❌ [DEBUG] Pulsante btnEliminaCliente NON trovato!");
    showAlert("⚠️ Errore: pulsante elimina non trovato");
    return;
  }
  
  console.log("🔍 [DEBUG] dataset.clienteId:", btnElimina.dataset.clienteId);
  
  if (!btnElimina.dataset.clienteId) {
    console.error("❌ [DEBUG] ID cliente NON presente!");
    showAlert("⚠️ Nessun cliente selezionato");
    return;
  }
  
  const popup = document.getElementById("popupEliminaScelta");
  console.log("🔍 [DEBUG] popupEliminaScelta:", popup);
  
  if (!popup) {
    console.error("❌ [DEBUG] Popup NON trovato!");
    showAlert("⚠️ Errore: popup non trovato");
    return;
  }
  
  // Mostra il popup
  popup.classList.remove("hidden");
  console.log("✅ [DEBUG] Popup mostrato");
  
  // Forza reflow
  void popup.offsetWidth;
}

/**
 * Chiude il popup - VERSIONE DEBUG
 */
function chiudiPopupElimina() {
  console.log("❌ [DEBUG] chiudiPopupElimina chiamata");
  const popup = document.getElementById("popupEliminaScelta");
  if (popup) {
    popup.classList.add("hidden");
    console.log("✅ [DEBUG] Popup nascosto");
  }
  TIPO_ELIMINAZIONE_TEMP = null;
}

/**
 * Gestisce la scelta dell'utente - VERSIONE DEBUG
 */
async function confermaElimina(tipo) {
  console.log(" [DEBUG] confermaElimina chiamata con tipo:", tipo);
  
  TIPO_ELIMINAZIONE_TEMP = tipo;
  chiudiPopupElimina();
  
  const btnElimina = document.getElementById("btnEliminaCliente");
  const idCliente = btnElimina?.dataset.clienteId;
  const targa = document.getElementById("targa")?.value?.trim();
  
  console.log("📋 [DEBUG] Parametri:", { tipo, idCliente, targa });
  
  if (!idCliente) {
    showAlert("⚠️ Errore: ID cliente non trovato");
    return;
  }
  
  showAlert("⏳ Elaborazione in corso...");
  
  try {
    let res;
    
    if (tipo === "veicolo") {
      if (!targa) {
        showAlert("⚠️ Inserisci la targa del veicolo da eliminare");
        return;
      }
      console.log("🚗 [DEBUG] Chiamo eliminaSoloVeicolo");
      res = await callBackend("eliminaSoloVeicolo", [targa, idCliente]);
    } else {
      console.log("👤 [DEBUG] Chiamo eliminaClienteETuttiVeicoli");
      res = await callBackend("eliminaClienteETuttiVeicoli", [idCliente]);
    }
    
    console.log("📩 [DEBUG] Risposta backend:", res);
    
    if (!res.ok) {
      showAlert("❌ Errore: " + (res.error || "Operazione fallita"));
      return;
    }
    
    if (tipo === "veicolo") {
      showAlert("✅ Veicolo eliminato correttamente");
      document.getElementById("veicolo").value = "";
      document.getElementById("motore").value = "";
      document.getElementById("targa").value = "";
      document.getElementById("immatricolazione").value = "";
      document.getElementById("revisioneInput").value = "";
      if (document.getElementById("revisioneInput")) {
        document.getElementById("revisioneInput").dataset.raw = "";
      }
    } else {
      showAlert("✅ Cliente e tutti i veicoli eliminati correttamente");
      resetClienti();
    }
    
  } catch(err) {
    console.error("❌ [DEBUG] Errore eliminazione:", err);
    showAlert("❌ Errore di connessione: " + err.message);
  }
}

// 🔥 Chiudi popup se si clicca FUORI - VERSIONE FIX
document.addEventListener("click", function(e) {
  const popup = document.getElementById("popupEliminaScelta");
  
  if (popup && !popup.classList.contains("hidden")) {
    const box = popup.querySelector(".popup-cliente-box");
    const btnElimina = document.getElementById("btnEliminaCliente");
    
    // 🔥 NON chiudere se:
    // 1. Si clicca dentro il popup
    // 2. Si clicca sul pulsante cestino
    if (box.contains(e.target) || btnElimina.contains(e.target)) {
      console.log("🖱️ [DEBUG] Click dentro popup o sul pulsante, NON chiudo");
      return;
    }
    
    console.log("🖱️ [DEBUG] Click fuori dal popup, chiudo");
    chiudiPopupElimina();
  }
});

function mostraLoadingRicerca(){
  const el = document.getElementById("ricercaLoading");
  if(el) el.classList.remove("hidden");
}

function nascondiLoadingRicerca(){
  const el = document.getElementById("ricercaLoading");
  if(el) el.classList.add("hidden");
}
/********************
 * CONTATORE FILE (X file)
 ********************/
function bindFileCount(inputId, countId, linkId){

  const input = document.getElementById(inputId);
  const label = document.getElementById(countId);
  const link = document.getElementById(linkId);

  if (!input) return;

  input.addEventListener("change", () => {

    const file = input.files?.[0];

    // contatore solo altri documenti
    if (label && countId === "altriCount"){

      const n = input.files.length;

      label.textContent =
        n > 0 ? `${n} file caricati` : "";

    }

    // preview libretto / targa
    if (link && file){

      const url = URL.createObjectURL(file);

      link.style.display = "inline-block";

      link.onclick = () =>
        window.open(url, "_blank");

    }
    else if (link){

      link.style.display = "none";

    }

  });

}

/********************
 * INIT
 ********************/
  preloadSchede();
  preloadOrdini();
  preloadRevisioni();
  preloadClientiVeicoli();
  librettoLink = document.getElementById("librettoLink");
  targaLink = document.getElementById("targaLink");
  btnCartellaCliente = document.getElementById("btnCartellaCliente");

  if (librettoLink) librettoLink.style.display = "none";
  if (targaLink) targaLink.style.display = "none";
  if (btnCartellaCliente) btnCartellaCliente.style.display = "none";

  document.getElementById("btnAnalizza")?.addEventListener("click", analizza);
  document.getElementById("btnSalva")?.addEventListener("click", salva);
  document.getElementById("btnRefreshClienti")?.addEventListener("click", resetClienti);
  document.getElementById("btnCerca").addEventListener("click", apriPopupRicerca);

  document.getElementById("altriDocumenti")?.addEventListener("change", uploadAltriDocumenti);

  document.addEventListener("input", function(e) {

  const clientiSection =
    document.getElementById("clienti");

  if (!clientiSection) return;

  const input = e.target;

  const tipiDaEscludere = [
    "file",
    "date",
    "checkbox",
    "radio"
  ];

  if (
    !clientiSection.contains(input) ||
    input.tagName !== "INPUT" ||
    tipiDaEscludere.includes(input.type)
  ) {
    return;
  }

  input.value = input.value.toUpperCase();
});

  abilitaPreview("librettoGallery", "librettoLink");
  abilitaPreview("librettoCamera", "librettoLink");
  
  abilitaPreview("targaGallery", "targaLink");
  abilitaPreview("targaCamera", "targaLink");

  bindFileCount("librettoGallery", "librettoCount", "librettoLink");
  bindFileCount("librettoCamera", "librettoCount", "librettoLink");

  document.getElementById("librettoGallery")
    ?.addEventListener("change", uploadLibretto);
  
  document.getElementById("librettoCamera")
    ?.addEventListener("change", uploadLibretto);

  bindFileCount("targaGallery", "targaCount", "targaLink");
  bindFileCount("targaCamera", "targaCount", "targaLink");

  document.getElementById("targaGallery")
  ?.addEventListener("change", e => {

    const file = e.target.files[0];
    if (file) uploadTargaFile(file);

  });

document.getElementById("targaCamera")
  ?.addEventListener("change", e => {

    const file = e.target.files[0];
    if (file) uploadTargaFile(file);

  });

  bindFileCount("altriDocumenti", "altriCount");

  

  // ==========================
  // ASSISTENTE (TESTO)
  // ==========================
  const input = document.getElementById("assistenteInput");
  if (input) {
    input.onkeydown = e => {
      if (e.key === "Enter" && e.target.value.trim()) {
        const testo = e.target.value.trim();
        e.target.value = "";
        messaggioUtente(testo);
        gestisciRisposta(testo);
      }
    };
  }

  // ==========================
  // 🔥 MICROFONO ASSISTENTE
  // ==========================
  // ==========================
// 🔥 MICROFONO ASSISTENTE (MANUALE - SOLO UNA RISPOSTA)
// ==========================
document.getElementById("btnMic")?.addEventListener("click", () => {
  // 🔥 NON cambiare modalità! Attiva solo il microfono UNA volta
  sbloccaAudio();
  bipMicrofono();
  
  // Avvia recognition solo per questa risposta
  if (!recognition) initVoce();
  if (ascoltoAttivo) return;
  
  try {
    recognition.start();
    console.log("🎤 Microfono manuale attivato (singola risposta)");
  } catch (e) {
    console.warn("Mic non avviato:", e);
  }
});



  // ==========================
  // ALTRI BOTTONI
  // ==========================
  document.getElementById("btnApriCartella")?.addEventListener("click", () => {
    window.open(
      "https://drive.google.com/drive/folders/1qFPSHURqe_vAXuJ2A6_Ta2eLloLWRkod",
      "_blank"
    );
  });

  document
    .getElementById("btnOrdineVocale")
    ?.addEventListener("click", avviaOrdineVocale);

// ==========================
// TOGGLE APPUNTAMENTI HOME
// ==========================
const toggleBtn = document.getElementById("toggleOggi");
const oggiBox = document.getElementById("oggiEventi");

if (toggleBtn && oggiBox) {

  toggleBtn.addEventListener("click", () => {

    const expanded = oggiBox.classList.toggle("expanded");

    if (expanded) {
      toggleBtn.textContent = "▲";
    } else {
      toggleBtn.textContent = "▼";
    }

  });

}

  const hash = window.location.hash.replace("#","");

  if(hash){
    showSection(hash);
  }else{
    showSection("home");
  }

let sessioneAssistente = {
  schedaId: null,
  step: null,
  stepQueue: [],
  inRipresa: false,

  listaProblemi: [],
  listaLavori: [],
  listaProdotti: [],

  ultimoProblema: null,
  ultimoLavoro: null,
  ultimoProdotto: null,

  valoriEsistenti: {},

  // Storico delle risposte inserite durante la sessione
  storicoStep: [],

  // Gestione comando CORREGGI
  correzioneAttiva: false,
  campoInCorrezione: null,
  stepDaRiprendere: null
};

async function uploadTargaFile(file){

  startLoading("loadingTarga");

  try{

    if (!file) return;

    console.log("Upload targa avviato...");

    const base64 = await fileToBase64(file);

    const form = new FormData();

    form.append("action", "uploadTempFile");
    form.append("base64", base64);
    form.append("nomeFile", "TARGA.jpg");
    form.append("mimeType", file.type || "image/jpeg");

    const res = await fetch(API_URL, {
      method: "POST",
      body: form
    });

    const json = await res.json();

    if (!json.ok)
      throw new Error(json.error);

    TEMP_TARGA_ID = json.fileId;

    console.log("Upload targa OK:", TEMP_TARGA_ID);

    stopLoading("loadingTarga");

  }
  catch(err){
  UI.error("Errore upload targa: " + err.message, "uploadTargaFile");
  stopLoading("loadingTarga");
}

}

function preparaVoceAssistente() {

  const voci = speechSynthesis.getVoices();

  if (!voci.length) return;

  voceAssistente =
    voci.find(v => v.name.includes("Google") && v.lang.startsWith("it")) ||
    voci.find(v => v.name.includes("Microsoft") && v.lang.startsWith("it")) ||
    voci.find(v => v.name.includes("Apple") && v.lang.startsWith("it")) ||
    voci.find(v => v.lang.startsWith("it")) ||
    null;

  console.log("Voce assistente:", voceAssistente?.name);

}

speechSynthesis.onvoiceschanged = preparaVoceAssistente;
setTimeout(preparaVoceAssistente, 500);

function scrollAssistenteBottom() {

  const chat = document.getElementById("assistenteChat");
  if (!chat) return;

  setTimeout(() => {
    chat.scrollTop = 0;
  }, 100);

}

const assistenteInput = document.getElementById("assistenteInput");

if (assistenteInput) {
  assistenteInput.addEventListener("focus", scrollAssistenteBottom);
}

async function uploadAltriDocumenti(e){

  startLoading("loadingAltri");

  try{

    const files = e.target.files;

    if(!files || files.length === 0){
      stopLoading("loadingAltri");
      return;
    }

    console.log("Upload altri documenti...");
    console.log("Numero file:", files.length);

    // 🔥 Upload parallelo (molto più veloce)
    const uploadPromises = Array.from(files).map(async file => {

      console.log("Processing:", file.name);

      const base64 = await fileToBase64(file);

      const form = new FormData();
      form.append("action", "uploadTempFile");
      form.append("base64", base64);
      form.append("nomeFile", file.name);
      form.append("mimeType", file.type || "image/jpeg");

      const res = await fetch(API_URL, {
        method: "POST",
        body: form
      });

      if (!res.ok)
        throw new Error("Errore HTTP upload");

      const json = await res.json();

      if(!json.ok)
        throw new Error(json.error || "Errore backend upload");

      console.log("Upload OK:", file.name);

      return {
        fileId: json.fileId,
        nome: file.name
      };

    });

    // 🔥 Attende tutti gli upload
    TEMP_ALTRI_DOCUMENTI = await Promise.all(uploadPromises);

    // UI aggiornata
    const label = document.getElementById("altriCount");

    if (label) {
      label.textContent =
        TEMP_ALTRI_DOCUMENTI.length > 0
          ? `${TEMP_ALTRI_DOCUMENTI.length} file caricati`
          : "";
    }

    console.log("TEMP_ALTRI_DOCUMENTI finale:", TEMP_ALTRI_DOCUMENTI);

  }
  catch(err){
  UI.error("Errore upload documenti: " + err.message, "uploadAltriDocumenti");
}
  finally{

    stopLoading("loadingAltri");

  }

}

function fileToBase64(file){

  return new Promise((resolve, reject)=>{

    if (!file.type.startsWith("image/")) {

      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {

      img.onload = () => {

        const MAX_SIZE = 1600; // 🔥 lato massimo ideale per OCR

        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas
          .toDataURL("image/jpeg", 0.85)
          .split(",")[1];

        resolve(base64);
      };

      img.onerror = reject;
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);

  });

}

async function uploadLibretto(e){

  startLoading("loadingLibretto");
  uploadLibrettoInCorso = true;
  TEMP_LIBRETTO_ID = null;

  try {
    const file = e.target.files[0];

    if (!file) {
      return;
    }

    console.log("Upload libretto avviato...");

    const base64 = await fileToBase64(file);

    const form = new FormData();
    form.append("action", "uploadTempFile");
    form.append("base64", base64);
    form.append("nomeFile", file.name || "LIBRETTO.jpg");
    form.append("mimeType", file.type || "image/jpeg");

    const res = await fetch(API_URL, {
      method: "POST",
      body: form
    });

    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || "Upload libretto fallito");
    }

    TEMP_LIBRETTO_ID = json.fileId;

    console.log("✅ Upload Drive OK:", TEMP_LIBRETTO_ID);
    showAlert("✅ Libretto caricato. Ora puoi fare OCR.");

  } catch(err) {
    TEMP_LIBRETTO_ID = null;
    UI.error("Errore upload libretto: " + err.message, "uploadLibretto");
  } finally {
    uploadLibrettoInCorso = false;
    stopLoading("loadingLibretto");
  }
}

function resetClienti() {
  console.log("Reset clienti...");

  // reset variabili globali
  clienteEsistente = false;
  TEMP_LIBRETTO_ID = null;
  TEMP_TARGA_ID = null;
  ID_CLIENTE_SCELTO = null;
  TARGA_VEICOLO_ORIGINALE = null;

  // reset tutti gli input
  document.querySelectorAll("#clienti input").forEach(input => {
  try {
    input.value = "";
  } catch (e) {
    console.warn("Input non resettabile:", input.id, input.type);
  }
});

  // 🔥 NASCONDI PULSANTI DOCUMENTI (usa classList, non style.display)
  const librettoLink = document.getElementById("librettoLink");
  if (librettoLink) {
    librettoLink.classList.add("hidden");  // ← FIX
    librettoLink.href = "#";
  }

  const targaLink = document.getElementById("targaLink");
  if (targaLink) {
    targaLink.classList.add("hidden");  // ← FIX
    targaLink.href = "#";
  }

  const btnCartella = document.getElementById("btnCartellaCliente");
  if (btnCartella) {
    btnCartella.classList.add("hidden");  // ← FIX
  }

  // 🔥 NASCONDI PULSANTE ELIMINA
  const btnElimina = document.getElementById("btnEliminaCliente");
  if (btnElimina) {
    btnElimina.classList.add("hidden");
    delete btnElimina.dataset.clienteId;
  }

  // reset contatore documenti
  const altriCount = document.getElementById("altriCount");
  if (altriCount) {
    altriCount.textContent = "";
  }

  // reset messaggi
  const esito = document.getElementById("esitoRicerca");
  if (esito) esito.textContent = "";

  const stato = document.getElementById("stato");
  if (stato) stato.textContent = "";
}

function messaggioBot(testo) {
  const chat = document.getElementById("assistenteChat");
  const div = document.createElement("div");
  div.className = "msg bot";
  div.textContent = testo;
  chat.prepend(div);
  chat.scrollTop = 0;

  scrollAssistenteBottom(); 
}

function avviaMicrofono() {
  if (!recognition) initVoce();
  if (ascoltoAttivo) return;

  try {
    recognition.start();
    console.log("🎤 recognition.start()");
  } catch (e) {
    console.warn("Mic non avviato:", e);
  }
}

function parlaEDopoAscolta(testo) {
  if (modalitaAssistente !== "vocale") return;

  botStaParlando = true;
  const utter = new SpeechSynthesisUtterance(testo);
  utter.lang = "it-IT";

  utter.onend = () => {
    botStaParlando = false;
    bipMicrofono();
    setTimeout(() => {
      if (!ascoltoAttivo) recognition.start();
    }, 300);
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function avviaAscolto() {
  if (modalitaAssistente !== "vocale") return;
  if (!recognition) initVoce();
  if (ascoltoAttivo) return;

  bipMicrofono();

}

function faiDomanda(testo) {

  messaggioBot(testo);

  if (modalitaAssistente !== "vocale") return;

  parlaTesto(testo, () => {

    setTimeout(() => {

      bipMicrofono();

      try {
        recognition.start();
      } catch {}

    }, 400);

  });

}

function preloadSchede() {

  if (cacheSchede && cacheSchede.length) return;

  console.log("Preload schede...");

  callBackend("listaSchede")
    .then(res => {

      const lista = Array.isArray(res)
        ? res
        : res?.data || [];

      cacheSchede = lista;

      console.log("Preload schede completato");

    })
    .catch(err => {
      console.warn("Preload schede fallito", err);
    });
}

function messaggioUtente(testo) {
  const chat = document.getElementById("assistenteChat");
  if (!chat) return;

  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = testo;
  chat.prepend(div);
  chat.scrollTop = 0;
}

function showSection(id) {
  currentSection = id; 
  console.log("➡️ showSection:", id);

  // nascondi tutte le pagine
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  // mostra pagina richiesta
  const page = document.getElementById(id);
  if (page) page.classList.add("active");

  // attiva bottone menu
  document.querySelectorAll(".menu button, .mobile-drawer button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === id);
  });

  // INIT SEZIONI
  switch (id) {
    case "home":
      caricaAppuntamentiOggi();
      if (!autoOpenSection) checkNotificheHome();
      break;

    case "ordini":
      if (!autoOpenSection) {
        toggleBadgeOrdini(false);
        caricaOrdiniUI(true);
      }
      break;

    case "schede":
      if (!autoOpenSection) {
        callBackend("getNotificheHome").then(r => {
          if (r?.ultimaScheda) {
            localStorage.setItem("schede_last_seen", new Date(r.ultimaScheda).getTime());
          }
        });
        toggleBadgeSchede(false);
      }
      caricaSchede();
      break;

    case "clienti":
      // 🔥 PRELOAD CLIENTI quando apri la sezione
      if (!CLIENTI_CACHE_POPUP || Date.now() - CLIENTI_CACHE_TS > CLIENTI_CACHE_TTL) {
        console.log("🔄 Preload clienti in background...");
        caricaClientiPopup(false); // Carica in background, non blocca
      }
      break;

    case "appuntamenti":
      if (window.innerWidth <= 768) caricaAgendaSettimanale?.();
      break;

    case "revisioni":
      caricaRevisioni();
      break;
  }
}

function apriRevisioniConReset(){
  showSection("revisioni");
}

function toggleBadgeOrdini(show){
  document.getElementById("badgeOrdini")
    ?.classList.toggle("show", show);
}

function toggleBadgeSchede(show){
  document.getElementById("badgeSchede")
    ?.classList.toggle("show", show);
}

function isComandoUscita(testo) {
  const t = testo.toUpperCase();

  return (
    t === "STOP" ||
    t === "SALTA" ||
    t === "SUCCESSIVO" ||
    t === "NO" ||
    t === "NESSUNO" ||
    t === "AVANTI" ||
    t === "PROSEGUI"
  );
}

function normalizzaOre(testo) {

  let t = String(testo || "")
    .toUpperCase()
    .trim();

  if (!t || isComandoUscita(t)) {
    return "";
  }

  t = t
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const numeriLettere = {
    ZERO: 0,
    UN: 1,
    UNO: 1,
    UNA: 1,
    DUE: 2,
    TRE: 3,
    QUATTRO: 4,
    CINQUE: 5,
    SEI: 6,
    SETTE: 7,
    OTTO: 8,
    NOVE: 9,
    DIECI: 10,
    UNDICI: 11,
    DODICI: 12
  };

  function trovaNumero(parte) {

    const numeroCifre =
      parte.match(/\d+(?:[.,]\d+)?/);

    if (numeroCifre) {
      return parseFloat(
        numeroCifre[0].replace(",", ".")
      );
    }

    for (const [parola, numero] of Object.entries(
      numeriLettere
    )) {

      const regex =
        new RegExp(`\\b${parola}\\b`);

      if (regex.test(parte)) {
        return numero;
      }
    }

    return null;
  }

  // Mezz'ora
  if (
    /\bMEZZORA\b/.test(t) ||
    /\bMEZZA ORA\b/.test(t) ||
    t === "MEZZA"
  ) {
    return "0.5";
  }

  let ore = 0;
  let minuti = 0;
  let riconosciuto = false;

  // Parte riferita alle ore
  const matchOre = t.match(
    /(.+?)\s+OR(?:A|E)\b/
  );

  if (matchOre) {

    const numeroOre =
      trovaNumero(matchOre[1]);

    if (numeroOre !== null) {
      ore = numeroOre;
      riconosciuto = true;
    }
  }

  // Parte riferita ai minuti
  const matchMinuti = t.match(
    /(\d+|ZERO|UN|UNO|UNA|DUE|TRE|QUATTRO|CINQUE|SEI|SETTE|OTTO|NOVE|DIECI|UNDICI|DODICI|TREDICI|QUATTORDICI|QUINDICI|SEDICI|DICIASSETTE|DICIOTTO|DICIANNOVE|VENTI|TRENTA|QUARANTA|CINQUANTA)\s+MINUT[OI]/
  );

  if (matchMinuti) {

    const minutiNumerici =
      trovaNumero(matchMinuti[1]);

    if (minutiNumerici !== null) {
      minuti = minutiNumerici;
      riconosciuto = true;
    } else {

      const minutiParole = {
        TREDICI: 13,
        QUATTORDICI: 14,
        QUINDICI: 15,
        SEDICI: 16,
        DICIASSETTE: 17,
        DICIOTTO: 18,
        DICIANNOVE: 19,
        VENTI: 20,
        TRENTA: 30,
        QUARANTA: 40,
        CINQUANTA: 50
      };

      minuti =
        minutiParole[matchMinuti[1]] || 0;

      riconosciuto = true;
    }
  }

  // Frazioni pronunciate
  if (
    /\bMEZZ[AO]\b/.test(t) &&
    !/\bMEZZORA\b/.test(t)
  ) {
    minuti += 30;
    riconosciuto = true;
  }

  if (
    /\bUN QUARTO\b/.test(t) ||
    /\bQUARTO D ORA\b/.test(t)
  ) {
    minuti += 15;
    riconosciuto = true;
  }

  if (
    /\bTRE QUARTI\b/.test(t) ||
    /\bTRE QUARTI D ORA\b/.test(t)
  ) {
    minuti += 45;
    riconosciuto = true;
  }

  // Solo minuti: "30 minuti"
  if (
    !matchOre &&
    matchMinuti
  ) {
    ore = 0;
  }

  // Numero decimale semplice: "2,5"
  if (!riconosciuto) {

    const numeroSemplice =
      trovaNumero(t);

    if (numeroSemplice !== null) {
      return String(numeroSemplice);
    }

    return "";
  }

  const totale =
    ore + minuti / 60;

  if (
    !Number.isFinite(totale) ||
    totale < 0
  ) {
    return "";
  }

  return String(
    Math.round(totale * 100) / 100
  );
}

function normalizzaChilometri(testo) {
  const t = testo.toUpperCase();

  // prende solo cifre e separatori
  const cifre = t.replace(/[^\d]/g, "");

  if (!cifre) return "";

  // niente punti/virgole nei km
  return parseInt(cifre, 10);
}

function renderSchede(lista) {

  const container = document.getElementById("listaSchede");
  container.innerHTML = "";

  [...lista].reverse().forEach(s => {

    const card = document.createElement("div");
    card.className = `scheda-card stato-${s.stato?.toLowerCase()}`;

    card.innerHTML = `
      <div class="scheda-left">
        <div class="scheda-cliente">
          #${s.numero} ${s.cliente}
        </div>
        <div class="scheda-data">${formattaData(s.data)}</div>
      </div>

      <div class="scheda-center">
        ${
          s.stato === "CHIUSA"
            ? `<button class="btn-scheda"
                 onclick="apriDocumento('${s.linkDoc}')">
                 SCHEDA
               </button>`
            : `<button class="btn-riprendi"
                 onclick="riprendiScheda('${s.id}')">
                 RIPRENDI
               </button>`
        }
      </div>

      <div class="scheda-right">

        <span class="scheda-stato">
          ${s.stato}
        </span>
      
        <div class="scheda-menu">
      
          <button class="scheda-menu-btn"
            onclick="toggleMenu(this)">
            ⋮
          </button>
      
          <div class="scheda-menu-popup">
            <button class="scheda-delete"
              onclick="eliminaScheda(
                '${s.id}',
                '${s.stato}',
                '${s.linkDoc}'
              )">
              Elimina
            </button>
          </div>
      
        </div>
      
      </div>
    `;

    container.appendChild(card);
  });
}

function formattaData(data) {
  if (!data) return "";
  const d = new Date(data);
  return d.toLocaleDateString("it-IT");
}
function apriDocumento(link) {
  if (!link) return;
  window.open(link, "_blank");
}

function apriAssistente() {

  showSection("assistente");

  Object.assign(sessioneAssistente, {
    schedaId: null,
    inRipresa: false,

    step: "TARGA",
    stepQueue: [],

    listaProblemi: [],
    listaLavori: [],
    listaProdotti: [],

    valoriEsistenti: {},

    // Storico delle domande completate
    storicoStep: [],

    // Valore presente prima di iniziare la domanda corrente
    snapshotStep: null,

    // Gestione comando CORREGGI
    correzioneAttiva: false,
    campoInCorrezione: null,
    stepDaRiprendere: null,

    dati: {
      targa: "",
      nomeCliente: "",
      veicolo: "",
      chilometri: "",
      problemi: [],
      lavori: [],
      prodotti: [],
      ore: "",
      note: ""
    }
  });

  rispostaInElaborazione = false;

  const chat =
    document.getElementById("assistenteChat");

  if (chat) {
    chat.innerHTML = "";
  }

  document
    .getElementById("statoSchedaBox")
    ?.classList.add("hidden");

  setTimeout(scrollAssistenteBottom, 200);

  if (
    modalitaAssistente === "vocale" &&
    !recognition
  ) {
    initVoce();
  }

  const input =
    document.getElementById("assistenteInput");

  if (input) {
    input.disabled = false;
    input.focus();
  }

  messaggioBot("Inserisci la targa del veicolo.");
}

function testoInLista(testo) {

  if (!testo) return [];

  return String(testo)
    .split("\n")
    .map(elemento =>
      elemento
        .trim()
        .replace(/^•\s*/, "")
        .replace(/^-\s*/, "")
        .trim()
    )
    .filter(Boolean);
}

function esciAssistente() {

  try {
    recognition?.abort();
  } catch {}

  ascoltoAttivo = false;
  botStaParlando = false;

  speechSynthesis.cancel();

  resetModalitaAssistente();

  const assistente = document.getElementById("assistente");
  assistente.classList.remove("active");   // ⭐ QUESTO MANCAVA

  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  document.getElementById("statoSchedaBox")?.classList.add("hidden");

  showSection("schede");
  caricaSchede();
}

function resetModalitaAssistente() {
  modalitaAssistente = "manuale";

  const switchVocale = document.getElementById("modeSwitch");
  if (switchVocale) {
    switchVocale.checked = false;
  }
}

function riprendiScheda(id) {

  showSection("assistente");

  setTimeout(() => {

    const chat =
      document.getElementById("assistenteChat");

    if (!chat) {
      console.error("assistenteChat non trovato");
      return;
    }

    chat.innerHTML = "";

    Object.assign(sessioneAssistente, {
      schedaId: id,
      inRipresa: true,

      step: null,
      stepQueue: [],

      listaProblemi: [],
      listaLavori: [],
      listaProdotti: [],

      valoriEsistenti: {},

      storicoStep: [],
      snapshotStep: null,

      correzioneAttiva: false,
      campoInCorrezione: null,
      stepDaRiprendere: null,

      dati: {
        targa: "",
        nomeCliente: "",
        veicolo: "",
        chilometri: "",
        problemi: [],
        lavori: [],
        prodotti: [],
        ore: "",
        note: ""
      }
    });

    rispostaInElaborazione = false;

    callBackend("statoScheda", [id])
      .then(info => {

        const v = info.valori || {};

        const problemi =
          testoInLista(v.PROBLEMI);

        const lavori =
          testoInLista(v.LAVORI);

        const prodotti =
          testoInLista(v.PRODOTTI);

        sessioneAssistente.dati = {
          targa: v.TARGA || "",
          nomeCliente: v.NOME_CLIENTE || "",
          veicolo: v.VEICOLO || "",
          chilometri: v.CHILOMETRI || "",
          problemi,
          lavori,
          prodotti,
          ore: v.ORE_IMPIEGATE || "",
          note: v.NOTE || ""
        };

        // Manteniamo sincronizzate anche le vecchie proprietà
        sessioneAssistente.listaProblemi =
          [...problemi];

        sessioneAssistente.listaLavori =
          [...lavori];

        sessioneAssistente.listaProdotti =
          [...prodotti];

        sessioneAssistente.valoriEsistenti =
          v;

        messaggioBot(
          `Stai riprendendo la scheda numero ${info.numero}.`
        );

        if (
          Array.isArray(info.mancanti) &&
          info.mancanti.includes("CHILOMETRI")
        ) {
          sessioneAssistente.stepQueue.push(
            "CHILOMETRI"
          );
        }

        sessioneAssistente.stepQueue.push(
          "PROBLEMI",
          "LAVORI",
          "PRODOTTI",
          "ORE_IMPIEGATE",
          "NOTE",
          "CHIUSURA"
        );

        document
          .getElementById("statoSchedaBox")
          ?.classList.remove("hidden");

        renderStatoScheda(info);

        rispostaInElaborazione = false;
        prossimaDomanda();
      })
      .catch(err => {

        rispostaInElaborazione = false;

        console.error(
          "Errore ripresa scheda",
          err
        );

        messaggioBot(
          "Non sono riuscito a caricare la scheda."
        );
      });

  }, 200);
}

let recognition = null;
let ascoltoAttivo = false;
let micTimeout = null;
let micSbloccato = false;
let micPronto = false;
let micTentativi = 0;
let rispostaGestita = false;
let botStaParlando = false;

function renderStatoScheda(info){

  const v = info?.valori || {};

  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  const inline = (text) => {
      if (!text) return "-";
    
      return String(text)
        .split("\n")
        .map(s => s
          .replace(/^•\s*/g, "")   // rimuove pallino iniziale
          .replace(/^-+\s*/g, "")  // rimuove eventuali trattini
          .trim()
        )
        .filter(Boolean)
        .join(", ");
    };

  // ----- CLIENTE (tabellato verticale) -----
  const clienteHTML = `
    ${v.NOME_CLIENTE || "-"}<br>
    ${v.INDIRIZZO || ""}<br>
    ${v.TELEFONO || ""}<br>
    ${v.CODICE_FISCALE || ""}
  `;

  setHTML("clienteBox", clienteHTML);

  // ----- VEICOLO (tabellato verticale) -----
  const km = v.CHILOMETRI
    ? String(v.CHILOMETRI).replace("km", "").trim() + " km"
    : "";

  const veicoloHTML = `
    ${v.VEICOLO || "-"}<br>
    ${v.TARGA || ""}<br>
    ${km}
  `;

  setHTML("veicoloBox", veicoloHTML);

  // ----- SEZIONI SOTTO (inline con virgola) -----
  setHTML("problemiBox", inline(v.PROBLEMI));
  setHTML("lavoriBox", inline(v.LAVORI));
  setHTML("prodottiBox", inline(v.PRODOTTI));
  setHTML("noteBox", v.NOTE || "-");
  setHTML("oreBox", v.ORE_IMPIEGATE || "-");
}

function formatListaInline(testo){
  if (!testo) return "-";
  return testo
    .split("\n")
    .map(v => v.trim())
    .filter(v => v !== "")
    .join(", ");
}

function initVoce() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  recognition = new SR();
  recognition.lang = "it-IT";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    ascoltoAttivo = true;
    toggleMicIndicator(true);
    console.log("🎤 ascolto ON");
  };

  recognition.onend = () => {

  ascoltoAttivo = false;
  toggleMicIndicator(false);
  console.log("🎤 microfono spento");

};

  recognition.onresult = e => {

    if (!e.results[0][0].transcript) return;
  
    const testo = e.results[0][0].transcript.trim();
  
    console.log("🗣️ UTENTE:", testo);
  
    rispostaInElaborazione = false;   // 🔥 FIX
  
    messaggioUtente(testo);
    gestisciRisposta(testo);
  
  };
}

function pulisciTesto(testo) {

  if (!testo) return "";

  let t = testo.toLowerCase();

  const correzioni = {
    "a blu": "adblue",
    "ad blu": "adblue",
    "a blue": "adblue",
    "fap": "FAP",
    "dpf": "DPF",
    "egr": "EGR",
    "dsg": "DSG"
  };

  for (const k in correzioni) {
    const regex = new RegExp("\\b" + k + "\\b", "gi");
    t = t.replace(regex, correzioni[k]);
  }

  return t.trim();
}

function domandaCorrente() {

  let testo = "";

  const step =
    sessioneAssistente.step;

  switch (step) {

    case "TARGA":
      testo = "Targa del veicolo?";
      break;

    case "CHILOMETRI":
      testo = "Chilometri del veicolo?";
      break;

    case "PROBLEMI":
      testo = "Problemi rilevati?";
      break;

    case "LAVORI":
      testo = "Lavori effettuati?";
      break;

    case "PRODOTTI":
      testo = "Prodotti utilizzati?";
      break;

    case "ORE_IMPIEGATE":
      testo =
        "Quante ore sono state impiegate?";
      break;

    case "NOTE":
      testo =
        "Vuoi aggiungere altre note?";
      break;

    case "CHIUSURA":
      testo =
        "Vuoi chiudere la scheda definitivamente?";
      break;
  }

  /*
   * Salva il valore esistente prima che
   * l'utente risponda alla domanda.
   */
  if (
    step &&
    step !== "TARGA" &&
    step !== "CHIUSURA"
  ) {

    sessioneAssistente.snapshotStep = {
      step,
      valorePrecedente: copiaValore(
        getValoreLocaleCampo(step)
      )
    };

  } else {

    sessioneAssistente.snapshotStep = null;
  }

  faiDomanda(testo);
}

function registraRispostaNelloStorico(
  campo,
  valorePrecedente
) {

  sessioneAssistente.storicoStep =
    sessioneAssistente.storicoStep || [];

  sessioneAssistente.storicoStep.push({
    step: campo,
    valorePrecedente:
      copiaValore(valorePrecedente)
  });
}

function completaStepNelloStorico(campo) {

  const snapshot =
    sessioneAssistente.snapshotStep;

  if (!snapshot || snapshot.step !== campo) {
    return;
  }

  sessioneAssistente.storicoStep.push({
    step: campo,
    valorePrecedente:
      copiaValore(snapshot.valorePrecedente)
  });

  sessioneAssistente.snapshotStep = null;
}

function isComandoFine(testo) {
  const t = testo.toUpperCase().trim();

  const comandi = [
    "VAI ALLA FINE",
    "SALTA TUTTO",
    "CONCLUDI",
    "CHIUDI",
    "FINE"
  ];

  return comandi.some(cmd => t === cmd);
}

async function aggiornaRiepilogoScheda() {

  if (!sessioneAssistente.schedaId) {
    return;
  }

  try {

    const info = await callBackend(
      "statoScheda",
      [sessioneAssistente.schedaId]
    );

    sessioneAssistente.valoriEsistenti =
      info.valori || {};

    renderStatoScheda(info);

  } catch (err) {

    console.warn(
      "Riepilogo scheda non aggiornato:",
      err
    );
  }
}

async function tornaAllaDomandaPrecedente() {

  const storico =
    sessioneAssistente.storicoStep || [];

  if (!storico.length) {

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Non ci sono risposte precedenti.",
      700,
      () => domandaCorrente()
    );

    return;
  }

  const ultimaRisposta =
    storico.pop();

  const campo =
    ultimaRisposta.step;

  const valorePrecedente =
    copiaValore(
      ultimaRisposta.valorePrecedente
    );

  let valoreFoglio =
    valorePrecedente;

  if (
    campo === "PROBLEMI" ||
    campo === "LAVORI" ||
    campo === "PRODOTTI"
  ) {

    valoreFoglio =
      listaInTesto(valorePrecedente);
  }

  /*
   * Conserviamo lo step in cui ci trovavamo.
   * Se stiamo tornando da un campo successivo,
   * dovrà essere ripreso dopo aver corretto
   * la risposta annullata.
   */
  const stepCorrente =
    sessioneAssistente.step;

  try {

    await sovrascriviCampoScheda(
      campo,
      valoreFoglio
    );

    impostaValoreLocaleCampo(
      campo,
      valorePrecedente
    );

    await aggiornaRiepilogoScheda();

    /*
     * Rimette il campo corrente nella coda
     * soltanto quando è realmente successivo
     * rispetto al campo annullato.
     *
     * Evita inoltre duplicati nella coda.
     */
    if (
      stepCorrente &&
      stepCorrente !== campo &&
      stepCorrente !== "CHIUSURA" &&
      !sessioneAssistente.stepQueue.includes(
        stepCorrente
      )
    ) {

      sessioneAssistente.stepQueue.unshift(
        stepCorrente
      );
    }

    /*
     * La nuova domanda deve essere quella
     * relativa alla risposta appena eliminata.
     */
    sessioneAssistente.step =
      campo;

    /*
     * Evita che domandaCorrente crei uno
     * snapshot riferito alla situazione sbagliata.
     */
    sessioneAssistente.snapshotStep = null;

    rispostaInElaborazione = false;

    const messaggi = {
      PROBLEMI:
        "Ultimo problema eliminato.",

      LAVORI:
        "Ultimo lavoro eliminato.",

      PRODOTTI:
        "Ultimo prodotto eliminato.",

      CHILOMETRI:
        "Valore dei chilometri eliminato.",

      ORE_IMPIEGATE:
        "Valore delle ore eliminato.",

      NOTE:
        "Note eliminate."
    };

    rispostaConPausa(
      messaggi[campo] ||
      "Ultima risposta eliminata.",
      700,
      () => domandaCorrente()
    );

  } catch (err) {

    console.error(
      "Errore comando indietro:",
      err
    );

    /*
     * Se il backend fallisce, rimette
     * l'operazione nello storico.
     */
    storico.push(
      ultimaRisposta
    );

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Non sono riuscito a eliminare l'ultima risposta.",
      700,
      () => domandaCorrente()
    );
  }
}

function avviaCorrezioneCampo(campo) {

  sessioneAssistente.correzioneAttiva = true;
  sessioneAssistente.campoInCorrezione = campo;
  sessioneAssistente.stepDaRiprendere =
    sessioneAssistente.step;

  const domande = {
    CHILOMETRI:
      "Inserisci i chilometri corretti.",

    PROBLEMI:
      "Inserisci nuovamente tutti i problemi.",

    LAVORI:
      "Inserisci nuovamente tutti i lavori.",

    PRODOTTI:
      "Inserisci nuovamente tutti i prodotti.",

    ORE_IMPIEGATE:
      "Inserisci il numero corretto di ore.",

    NOTE:
      "Inserisci le note corrette."
  };

  rispostaInElaborazione = false;

  faiDomanda(
    domande[campo] ||
    "Inserisci il nuovo valore."
  );
}

async function gestisciNuovoValoreCorretto(testo) {

  const campo =
    sessioneAssistente.campoInCorrezione;

  const stepDaRiprendere =
    sessioneAssistente.stepDaRiprendere;

  let valoreLocale;
  let valoreFoglio;

  switch (campo) {

    case "CHILOMETRI": {

      const kmRaw =
        normalizzaChilometri(testo);

      const km = kmRaw
        ? sanitizeInput(kmRaw, "number")
        : "";

      if (!km) {

        rispostaInElaborazione = false;

        rispostaConPausa(
          "Non ho capito i chilometri.",
          500,
          () => faiDomanda(
            "Inserisci i chilometri corretti."
          )
        );

        return;
      }

      valoreLocale = km + " km";
      valoreFoglio = valoreLocale;

      break;
    }

    case "ORE_IMPIEGATE": {

      const oreNum =
        normalizzaOre(testo);

      /*
       * Meglio non usare !oreNum perché 0
       * verrebbe considerato non valido.
       */
      if (
        oreNum === null ||
        oreNum === undefined ||
        oreNum === "" ||
        Number.isNaN(Number(oreNum))
      ) {

        rispostaInElaborazione = false;

        rispostaConPausa(
          "Non ho capito le ore.",
          500,
          () => faiDomanda(
            "Inserisci il numero corretto di ore."
          )
        );

        return;
      }

      valoreLocale = oreNum + " h";
      valoreFoglio = valoreLocale;

      break;
    }

    case "PROBLEMI":
    case "LAVORI":
    case "PRODOTTI": {

      const valorePulito =
        pulisciTesto(testo);

      if (!valorePulito) {

        rispostaInElaborazione = false;
        faiDomanda("Ripeti il nuovo valore.");
        return;
      }

      /*
       * Per CORREGGI sostituiamo tutto il campo
       * con questa nuova risposta.
       */
      valoreLocale = [valorePulito];
      valoreFoglio =
        listaInTesto(valoreLocale);

      break;
    }

    case "NOTE": {

      if (isComandoUscita(testo)) {
        valoreLocale = "";
        valoreFoglio = "";
      } else {
        valoreLocale = pulisciTesto(testo);
        valoreFoglio = valoreLocale;
      }

      break;
    }

    default:

      rispostaInElaborazione = false;
      messaggioBot("Campo non correggibile.");
      return;
  }

  impostaValoreLocaleCampo(
    campo,
    valoreLocale
  );

  /*
   * Se la scheda esiste già sul foglio,
   * aggiorniamo immediatamente il campo.
   */
  if (sessioneAssistente.schedaId) {

    try {

      await callBackend(
        "sovrascriviSchedaCampo",
        [
          sessioneAssistente.schedaId,
          campo,
          valoreFoglio
        ]
      );

      if (sessioneAssistente.inRipresa) {
        await aggiornaRiepilogoScheda();
      }

    } catch (err) {

      console.error(
        "Errore correzione:",
        err
      );

      rispostaInElaborazione = false;

      rispostaConPausa(
        "Non sono riuscito a salvare la correzione.",
        700,
        () => domandaCorrente()
      );

      return;
    }
  }

  sessioneAssistente.correzioneAttiva = false;
  sessioneAssistente.campoInCorrezione = null;
  sessioneAssistente.stepDaRiprendere = null;
  sessioneAssistente.step =
    stepDaRiprendere;

  rispostaInElaborazione = false;

  rispostaConPausa(
    "Correzione salvata.",
    700,
    () => domandaCorrente()
  );
}

function rispostaConPausa(testo, pausa = 1200, callback = null) {

  if (modalitaAssistente === "vocale") {

    parlaTesto(testo, () => {
      setTimeout(() => {
        if (callback) callback();
      }, pausa);
    });

  } else {

    messaggioBot(testo);

    setTimeout(() => {
      if (callback) callback();
    }, pausa);

  }
}

const CAMPI_CORREGGIBILI = {
  "CHILOMETRI": "CHILOMETRI",
  "CHILOMETRO": "CHILOMETRI",
  "KM": "CHILOMETRI",

  "PROBLEMI": "PROBLEMI",
  "PROBLEMA": "PROBLEMI",

  "LAVORI": "LAVORI",
  "LAVORO": "LAVORI",

  "PRODOTTI": "PRODOTTI",
  "PRODOTTO": "PRODOTTI",

  "ORE": "ORE_IMPIEGATE",
  "ORA": "ORE_IMPIEGATE",
  "ORE IMPIEGATE": "ORE_IMPIEGATE",
  "TEMPO": "ORE_IMPIEGATE",

  "NOTE": "NOTE",
  "NOTA": "NOTE"
};

function estraiCampoCorrezione(testo) {

  const comando = String(testo || "")
    .toUpperCase()
    .trim();

  if (!comando.startsWith("CORREGGI")) {
    return null;
  }

  const nomeCampo = comando
    .replace(/^CORREGGI\s*/, "")
    .trim();

  return CAMPI_CORREGGIBILI[nomeCampo] || null;
}

function copiaValore(valore) {

  return Array.isArray(valore)
    ? [...valore]
    : valore;
}

function getValoreLocaleCampo(campo) {

  const dati =
    sessioneAssistente.dati || {};

  switch (campo) {

    case "CHILOMETRI":
      return dati.chilometri || "";

    case "PROBLEMI":
      return [...(dati.problemi || [])];

    case "LAVORI":
      return [...(dati.lavori || [])];

    case "PRODOTTI":
      return [...(dati.prodotti || [])];

    case "ORE_IMPIEGATE":
      return dati.ore || "";

    case "NOTE":
      return dati.note || "";

    default:
      return "";
  }
}

function listaInTesto(lista) {

  if (!Array.isArray(lista) || !lista.length) {
    return "";
  }

  return lista
    .map(elemento =>
      String(elemento || "")
        .trim()
        .replace(/^•\s*/, "")
    )
    .filter(Boolean)
    .map(elemento => "• " + elemento)
    .join("\n");
}

function impostaValoreLocaleCampo(campo, valore) {

  if (!sessioneAssistente.dati) {
    sessioneAssistente.dati = {};
  }

  switch (campo) {

    case "CHILOMETRI":

      sessioneAssistente.dati.chilometri =
        valore || "";

      break;

    case "PROBLEMI": {

      const lista = Array.isArray(valore)
        ? [...valore]
        : testoInLista(valore);

      sessioneAssistente.dati.problemi =
        lista;

      sessioneAssistente.listaProblemi =
        [...lista];

      break;
    }

    case "LAVORI": {

      const lista = Array.isArray(valore)
        ? [...valore]
        : testoInLista(valore);

      sessioneAssistente.dati.lavori =
        lista;

      sessioneAssistente.listaLavori =
        [...lista];

      break;
    }

    case "PRODOTTI": {

      const lista = Array.isArray(valore)
        ? [...valore]
        : testoInLista(valore);

      sessioneAssistente.dati.prodotti =
        lista;

      sessioneAssistente.listaProdotti =
        [...lista];

      break;
    }

    case "ORE_IMPIEGATE":

      sessioneAssistente.dati.ore =
        valore || "";

      break;

    case "NOTE":

      sessioneAssistente.dati.note =
        valore || "";

      break;
  }
}

function avviaCorrezioneCampo(campo) {

  if (!campo) {
    return false;
  }

  sessioneAssistente.correzioneAttiva = true;
  sessioneAssistente.campoInCorrezione = campo;
  sessioneAssistente.stepDaRiprendere =
    sessioneAssistente.step;

  rispostaInElaborazione = false;

  const domande = {
    CHILOMETRI:
      "Inserisci il nuovo valore dei chilometri.",

    PROBLEMI:
      "Inserisci nuovamente tutti i problemi.",

    LAVORI:
      "Inserisci nuovamente tutti i lavori.",

    PRODOTTI:
      "Inserisci nuovamente tutti i prodotti.",

    ORE_IMPIEGATE:
      "Inserisci il nuovo numero di ore.",

    NOTE:
      "Inserisci nuovamente le note."
  };

  faiDomanda(
    domande[campo] ||
    "Inserisci il nuovo valore."
  );

  return true;
}

async function gestisciNuovoValoreCorretto(testo) {

  const campo =
    sessioneAssistente.campoInCorrezione;

  const stepDaRiprendere =
    sessioneAssistente.stepDaRiprendere;

  let valoreLocale;
  let valoreFoglio;

  try {

    switch (campo) {

      case "CHILOMETRI": {

        const kmRaw =
          normalizzaChilometri(testo);

        const km = kmRaw
          ? sanitizeInput(kmRaw, "number")
          : "";

        if (!km) {

          rispostaInElaborazione = false;

          rispostaConPausa(
            "Non ho capito i chilometri. Ripeti il nuovo valore.",
            700,
            () => faiDomanda(
              "Inserisci il nuovo valore dei chilometri."
            )
          );

          return;
        }

        valoreLocale = km;
        valoreFoglio = km;

        break;
      }

      case "ORE_IMPIEGATE": {

        const ore =
          normalizzaOre(testo);

        if (
          ore === "" ||
          ore === null ||
          ore === undefined
        ) {

          rispostaInElaborazione = false;

          rispostaConPausa(
            "Non ho capito le ore. Ripeti il nuovo valore.",
            700,
            () => faiDomanda(
              "Inserisci il nuovo numero di ore."
            )
          );

          return;
        }

        valoreLocale = ore;
        valoreFoglio = ore;

        break;
      }

      case "PROBLEMI":
      case "LAVORI":
      case "PRODOTTI": {

        const valorePulito =
          pulisciTesto(testo);

        if (!valorePulito) {

          rispostaInElaborazione = false;
          faiDomanda("Ripeti il nuovo valore.");
          return;
        }

        /*
         * In questa prima versione CORREGGI sostituisce
         * l'intero campo con la nuova risposta.
         */
        valoreLocale = [valorePulito];
        valoreFoglio =
          listaInTesto(valoreLocale);

        break;
      }

      case "NOTE": {

        const note =
          pulisciTesto(testo);

        valoreLocale = note;
        valoreFoglio = note;

        break;
      }

      default:
        throw new Error(
          "Campo di correzione non valido"
        );
    }

    await sovrascriviCampoScheda(
      campo,
      valoreFoglio
    );

    impostaValoreLocaleCampo(
      campo,
      valoreLocale
    );

    sessioneAssistente.correzioneAttiva = false;
    sessioneAssistente.campoInCorrezione = null;
    sessioneAssistente.stepDaRiprendere = null;

    sessioneAssistente.step =
      stepDaRiprendere;

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Correzione salvata.",
      700,
      () => domandaCorrente()
    );

  } catch (err) {

    console.error(
      "Errore correzione campo:",
      err
    );

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Non sono riuscito a salvare la correzione.",
      700,
      () => domandaCorrente()
    );
  }
}

async function gestisciRisposta(testo) {

  if (!sessioneAssistente.dati) {

    sessioneAssistente.dati = {
      targa: "",
      chilometri: "",
      nomeCliente: "",
      veicolo: "",
      problemi: [],
      lavori: [],
      prodotti: [],
      ore: "",
      note: ""
    };
  }

  if (rispostaInElaborazione) return;

  rispostaInElaborazione = true;

  testo = String(testo || "")
    .toUpperCase()
    .trim();

  /*
   * INDIETRO e RIPETI:
   * stesso identico comportamento.
   */
  if (
    testo === "INDIETRO" ||
    testo === "RIPETI"
  ) {

    await tornaAllaDomandaPrecedente();
    return;
  }

  /*
   * Avvio comando CORREGGI.
   */
  if (testo.startsWith("CORREGGI")) {

    const campo =
      estraiCampoCorrezione(testo);

    if (!campo) {

      rispostaInElaborazione = false;

      rispostaConPausa(
        "Puoi correggere chilometri, problemi, lavori, prodotti, ore oppure note.",
        800,
        () => domandaCorrente()
      );

      return;
    }

    avviaCorrezioneCampo(campo);
    return;
  }

  /*
   * L'assistente sta aspettando il nuovo
   * valore richiesto da CORREGGI.
   */
  if (
    sessioneAssistente.correzioneAttiva &&
    sessioneAssistente.campoInCorrezione
  ) {

    await gestisciNuovoValoreCorretto(testo);
    return;
  }

  // Salto diretto alla chiusura
  if (isComandoFine(testo)) {

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Ok, passo alla chiusura.",
      1200,
      () => {

        sessioneAssistente.step =
          "CHIUSURA";

        domandaCorrente();
      }
    );

    return;
  }

  switch (sessioneAssistente.step) {

    case "assistente":
      rispostaInElaborazione = false;
      return;

    case "TARGA": {

      const targaNorm = sanitizeInput(
        normalizzaTarga(testo),
        "targa"
      );

      if (!targaNorm) {

        rispostaInElaborazione = false;
        messaggioBot("Targa non valida. Ripeti.");
        return;
      }

      let veicolo =
        CLIENTI_VEICOLI_CACHE?.find(
          v =>
            String(v.targa || "")
              .toUpperCase() === targaNorm
        );

      if (!veicolo) {

        try {

          veicolo = await callBackend(
            "checkTargaEsistenteFull",
            [targaNorm]
          );

        } catch (err) {

          console.warn(
            "Ricerca targa backend fallita:",
            err
          );
        }
      }

      if (!veicolo) {

        rispostaInElaborazione = false;

        messaggioBot(
          "Veicolo non trovato. Ripeti la targa."
        );

        return;
      }

      const crea = await callBackend(
        "creaNuovaScheda"
      );

      sessioneAssistente.schedaId =
        crea.docId;

      sessioneAssistente.dati = {
        targa: targaNorm,
        nomeCliente:
          veicolo.nomeCliente || "",
        veicolo:
          veicolo.veicolo || "",
        chilometri: "",
        problemi: [],
        lavori: [],
        prodotti: [],
        ore: "",
        note: ""
      };

      await callBackend(
        "completaSchedaDaTarga",
        [crea.docId, targaNorm]
      );

      sessioneAssistente.stepQueue = [
        "CHILOMETRI",
        "PROBLEMI",
        "LAVORI",
        "PRODOTTI",
        "ORE_IMPIEGATE",
        "NOTE",
        "CHIUSURA"
      ];

      sessioneAssistente.storicoStep = [];
      sessioneAssistente.snapshotStep = null;

      rispostaInElaborazione = false;

      messaggioBot(
        `Scheda #${crea.numeroScheda} creata.`
      );

      prossimaDomanda();
      return;
    }

    case "CHILOMETRI": {

      const kmRaw =
        normalizzaChilometri(testo);

      const km = kmRaw
        ? sanitizeInput(kmRaw, "number")
        : "";

      if (!km) {

        rispostaInElaborazione = false;

        messaggioBot(
          "Non ho capito i chilometri. Ripeti."
        );

        return;
      }

      sessioneAssistente.dati.chilometri =
        km + " km";

      completaStepNelloStorico(
        "CHILOMETRI"
      );

      rispostaInElaborazione = false;

      rispostaConPausa(
        `Chilometri registrati: ${km}`,
        1200,
        () => prossimaDomanda()
      );

      return;
    }

    case "PROBLEMI": {

  if (isComandoUscita(testo)) {

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Perfetto.",
      1200,
      () => prossimaDomanda()
    );

    return;
  }

  const problema =
    pulisciTesto(testo);

  if (!problema) {

    rispostaInElaborazione = false;

    faiDomanda(
      "Non ho capito. Inserisci il problema rilevato."
    );

    return;
  }

  sessioneAssistente.dati.problemi =
    sessioneAssistente.dati.problemi || [];

  /*
   * Salva la lista prima di inserire
   * il nuovo problema.
   */
  registraRispostaNelloStorico(
    "PROBLEMI",
    sessioneAssistente.dati.problemi
  );

  sessioneAssistente.dati.problemi.push(
    problema
  );

  sessioneAssistente.listaProblemi = [
    ...sessioneAssistente.dati.problemi
  ];

  rispostaInElaborazione = false;

  rispostaConPausa(
    "Ok. Altro problema?",
    1200,
    () => {

      if (
        modalitaAssistente === "vocale"
      ) {

        bipMicrofono();

        try {
          recognition.start();
        } catch {}
      }
    }
  );

  return;
}

    case "LAVORI": {

  if (isComandoUscita(testo)) {

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Perfetto.",
      1200,
      () => prossimaDomanda()
    );

    return;
  }

  const lavoro =
    pulisciTesto(testo);

  if (!lavoro) {

    rispostaInElaborazione = false;

    faiDomanda(
      "Non ho capito. Inserisci il lavoro effettuato."
    );

    return;
  }

  sessioneAssistente.dati.lavori =
    sessioneAssistente.dati.lavori || [];

  /*
   * Salva la lista prima del singolo
   * nuovo lavoro.
   */
  registraRispostaNelloStorico(
    "LAVORI",
    sessioneAssistente.dati.lavori
  );

  sessioneAssistente.dati.lavori.push(
    lavoro
  );

  sessioneAssistente.listaLavori = [
    ...sessioneAssistente.dati.lavori
  ];

  rispostaInElaborazione = false;

  rispostaConPausa(
    "Ok. Altro lavoro?",
    1200,
    () => {

      if (
        modalitaAssistente === "vocale"
      ) {

        bipMicrofono();

        try {
          recognition.start();
        } catch {}
      }
    }
  );

  return;
}
    case "PRODOTTI": {

  if (isComandoUscita(testo)) {

    rispostaInElaborazione = false;

    rispostaConPausa(
      "Perfetto.",
      1200,
      () => prossimaDomanda()
    );

    return;
  }

  const prodotto =
    pulisciTesto(testo);

  if (!prodotto) {

    rispostaInElaborazione = false;

    faiDomanda(
      "Non ho capito. Inserisci il prodotto utilizzato."
    );

    return;
  }

  sessioneAssistente.dati.prodotti =
    sessioneAssistente.dati.prodotti || [];

  registraRispostaNelloStorico(
    "PRODOTTI",
    sessioneAssistente.dati.prodotti
  );

  sessioneAssistente.dati.prodotti.push(
    prodotto
  );

  sessioneAssistente.listaProdotti = [
    ...sessioneAssistente.dati.prodotti
  ];

  rispostaInElaborazione = false;

  rispostaConPausa(
    "Ok. Altro prodotto?",
    1200,
    () => {

      if (
        modalitaAssistente === "vocale"
      ) {

        bipMicrofono();

        try {
          recognition.start();
        } catch {}
      }
    }
  );

  return;
}

    case "ORE_IMPIEGATE": {

      const oreNum =
        normalizzaOre(testo);

      /*
       * Questa validazione è più robusta
       * del tuo precedente if (!oreNum).
       */
      if (
        oreNum === null ||
        oreNum === undefined ||
        oreNum === "" ||
        Number.isNaN(Number(oreNum))
      ) {

        rispostaInElaborazione = false;

        messaggioBot(
          "Non ho capito le ore."
        );

        return;
      }

      sessioneAssistente.dati.ore =
        oreNum + " h";

      completaStepNelloStorico(
        "ORE_IMPIEGATE"
      );

      rispostaInElaborazione = false;

      rispostaConPausa(
        `Ore registrate: ${oreNum}`,
        1200,
        () => prossimaDomanda()
      );

      return;
    }

    case "NOTE": {

      if (isComandoUscita(testo)) {
        sessioneAssistente.dati.note = "";
      } else {
        sessioneAssistente.dati.note =
          pulisciTesto(testo);
      }

      completaStepNelloStorico(
        "NOTE"
      );

      rispostaInElaborazione = false;

      rispostaConPausa(
        "Perfetto.",
        1200,
        () => prossimaDomanda()
      );

      return;
    }

    case "CHIUSURA": {

      try {
        recognition?.stop();
      } catch {}

      const risposta =
        testo.toUpperCase().trim();

      const negativo =
        risposta.startsWith("NO") ||
        risposta.includes("NON") ||
        risposta.includes("LASCIA") ||
        risposta.includes("APERTA");

      const positivo =
        risposta.startsWith("SI") ||
        risposta === "SÌ" ||
        risposta === "CHIUDI";

      rispostaInElaborazione = false;

      rispostaConPausa(
        "Salvataggio in corso...",
        800
      );

      try {

        await callBackend(
          "salvaSchedaCompleta",
          [
            sessioneAssistente.schedaId,
            sessioneAssistente.dati
          ]
        );

        if (positivo && !negativo) {

          await callBackend(
            "chiudiScheda",
            [sessioneAssistente.schedaId]
          );

          rispostaConPausa(
            "Scheda chiusa correttamente.",
            1000
          );

        } else {

          rispostaConPausa(
            "Scheda salvata.",
            1000
          );
        }

        setTimeout(() => {

          resetModalitaAssistente();
          showSection("home");
          caricaSchede(true);

        }, 1800);

      } catch (err) {

        console.error(err);

        rispostaInElaborazione = false;

        messaggioBot(
          "Errore durante il salvataggio."
        );
      }

      return;
    }

    default:

      rispostaInElaborazione = false;

      console.warn(
        "Step assistente non riconosciuto:",
        sessioneAssistente.step
      );
  }
}
      
function ascoltaSubito() {
  if (modalitaAssistente !== "vocale") return;
  if (!recognition || ascoltoAttivo) return;

  bipMicrofono();

}

// MODALITÀ ASSISTENTE
let modalitaAssistente = "manuale";

document.getElementById("modeSwitch")?.addEventListener("change", e => {

  if (e.target.checked) {
    modalitaAssistente = "vocale"
    if (!recognition) initVoce();
    sbloccaAudio();
    messaggioBot("Modalità vocale attiva.");
  } else {
    modalitaAssistente = "manuale";
    try { recognition?.stop(); } catch (e) {}
  }
});

async function salvaCampoScheda(campo, valore) {

  console.log("salvaCampoScheda chiamata");
  console.log("schedaId:", sessioneAssistente.schedaId);
  console.log("campo:", campo);
  console.log("valore:", valore);

  if (!sessioneAssistente.schedaId) return;

  try {

    const res = await callBackend(
      "aggiornaSchedaCampo",
      [sessioneAssistente.schedaId, campo, valore]
    );

    console.log("Campo salvato:", campo);
    return res;

  } catch (err) {

    console.error("Errore backend:", err);
    throw err;
  }
}

async function sovrascriviCampoScheda(campo, valore) {

  if (!sessioneAssistente.schedaId) {
    throw new Error("ID scheda mancante");
  }

  try {

    const res = await callBackend(
      "sovrascriviSchedaCampo",
      [
        sessioneAssistente.schedaId,
        campo,
        valore
      ]
    );

    if (!res || res.ok === false) {
      throw new Error(
        res?.error ||
        "Errore durante la sovrascrittura del campo"
      );
    }

    return res;

  } catch (err) {

    console.error(
      "Errore sovrascrittura campo:",
      campo,
      err
    );

    throw err;
  }
}

function normalizzaTarga(testo) {
  let t = testo.toUpperCase();

  // 1️⃣ LETTERE TIPO "G DI GENOVA"
  // prende solo la lettera prima di "DI"
  t = t.replace(/\b([A-Z])\s+DI\s+[A-ZÀ-Ù]+\b/g, "$1");

  // 2️⃣ numeri composti prima (IMPORTANTE)
  const numeriComposti = {
    "DICIANNOVE": "19",
    "DICIASSETTE": "17",
    "DICIOTTO": "18",
    "QUINDICI": "15",
    "SEDICI": "16",
    "QUATTORDICI": "14",
    "TREDICI": "13",
    "DODICI": "12",
    "UNDICI": "11",
    "DIECI": "10"
  };

  for (const k in numeriComposti) {
    t = t.replaceAll(k, numeriComposti[k]);
  }

  // 3️⃣ numeri singoli
  const numeri = {
    "ZERO": "0",
    "UNO": "1",
    "DUE": "2",
    "TRE": "3",
    "QUATTRO": "4",
    "CINQUE": "5",
    "SEI": "6",
    "SETTE": "7",
    "OTTO": "8",
    "NOVE": "9"
  };

  for (const k in numeri) {
    t = t.replaceAll(k, numeri[k]);
  }

  // 4️⃣ rimuove parole inutili residue
  t = t.replace(/\bDI\b|\bE\b/g, " ");

  // 5️⃣ rimuove tutto ciò che non è targa
  return t.replace(/[^A-Z0-9]/g, "");
}

function normalizzaDescrizioneOrdine(testo) {
  if (!testo) return "";

  testo = testo.trim().toLowerCase();

  // Prima lettera maiuscola
  testo = testo.charAt(0).toUpperCase() + testo.slice(1);

  // Forza le sigle in MAIUSCOLO
  SIGLE_MAIUSCOLE.forEach(sigla => {
    const regex = new RegExp(`\\b${sigla.toLowerCase()}\\b`, "gi");
    testo = testo.replace(regex, sigla);
  });

  return testo;
}

function caricaSchede(force = false) {

  if (!force && cacheSchede) {
  renderSchede(cacheSchede);
  return;
}

  console.log("Caricamento schede da backend...");

  callBackend("listaSchede")
    .then(res => {

      const lista = Array.isArray(res)
        ? res
        : res?.data || [];

      cacheSchede = lista;

      renderSchede(lista);
    })
    .catch(err => {
      console.error("Errore caricamento schede", err);
    });
}

function prossimaDomanda() {
  if (sessioneAssistente.stepQueue.length === 0) {
    messaggioBot("Procedura completata.");
    return;
  }

  sessioneAssistente.step = sessioneAssistente.stepQueue.shift();
  domandaCorrente();
}

function parlaTesto(testo, callback) {

  if (!("speechSynthesis" in window)) {
    if (callback) callback();
    return;
  }

  speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(testo);
  utter.lang = "it-IT";

  const voci = speechSynthesis.getVoices();

  const voceNaturale =
    voci.find(v => v.name.includes("Diego Online") && v.lang === "it-IT") ||
  voci.find(v => v.name.includes("Isabella Online") && v.lang === "it-IT") ||
  voci.find(v => v.name.includes("Elsa Online") && v.lang === "it-IT") ||
  voci.find(v => v.name.includes("GiuseppeMultilingual") && v.lang === "it-IT") ||
  voci.find(v => v.lang === "it-IT");

  if (voceNaturale) {
    utter.voice = voceNaturale;
  }

  utter.lang = "it-IT";
  utter.rate = 1.15;
  utter.pitch = 1;

  utter.onend = () => {
    botStaParlando = false;
    if (callback) callback();
  };

  speechSynthesis.speak(utter);
}

function bipMicrofono() {

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = 900;

  gain.gain.value = 0.2;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);

}

function caricaOrdiniUI(force = false) {
  const now = Date.now();

  // 🔥 Mostra subito cache se esiste
  if (CACHE_ORDINI) {
    renderOrdini(
      CACHE_ORDINI.ordini || [],
      CACHE_ORDINI.clienti || [],
      CACHE_ORDINI.veicoli || [],
      CACHE_ORDINI.fornitori || []
    );
  } else {
    const container = document.getElementById("listaOrdini");
    if (container) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Caricamento ordini...</div>';
    }
  }

  // 🔥 Se force=true o cache scaduta, chiama backend
  if (force || !CACHE_ORDINI || now - CACHE_TS >= 10 * 60 * 1000) {
    callBackend("getOrdiniBundle")
      .then(res => {
        const ordini = res?.ordini || [];
        const clienti = res?.clienti || [];
        const veicoli = res?.veicoli || [];
        const fornitori = res?.fornitori || [];

        CACHE_ORDINI = { ordini, clienti, veicoli, fornitori };
        CACHE_TS = Date.now();
        
        // 🔥 AGGIORNA VEICOLI_ALL per le select dinamiche
        VEICOLI_ALL = veicoli;

        renderOrdini(ordini, clienti, veicoli, fornitori);
      })
      .catch(err => {
        UI.error("Errore caricamento ordini: " + err.message, "caricaOrdiniUI");
      });
  }
}

function renderOrdini(ordini, clienti, veicoli, fornitori) {
  const container = document.getElementById("listaOrdini");
  if (!container) return;

  // 🔥 FILTRO EXTRA: rimuovi ordini senza descrizione valida
  const ordiniValidi = ordini.filter(o => 
    o.descrizione && 
    o.descrizione.trim() !== "" && 
    o.descrizione.trim() !== "Scrivi descrizione ordine…"
  );

  // Se nessun ordine valido, mostra messaggio
  if (ordiniValidi.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Nessun ordine da gestire</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  // 🔥 Ordina: non completati sopra, completati sotto
  const lista = [...ordiniValidi].sort((a, b) => {
    if (a.check && !b.check) return 1;
    if (!a.check && b.check) return -1;
    return b.row - a.row;
  });

  // 🔥 Pre-calcola opzioni select per riutilizzo
  const clientiOpts = clienti.map(c => 
    `<option value="${c}">${c}</option>`
  ).join("");

  const fornitoriOpts = `
    <option value="" selected disabled>Fornitore</option>
    <option value="autoparts">Autoparts</option>
    <option value="teamcar">Teamcar</option>
    <option value="giuliano">Giuliano</option>
  `;

  lista.forEach(o => {
    const row = document.createElement("div");
    row.className = "ordine-row";

    // 🔥 Costruisci select veicolo solo se serve
    const veicoloOpts = veicoli
      .filter(v => !o.cliente || v.clienteNome === o.cliente)
      .map(v => `<option value="${v.veicolo}" ${v.veicolo === o.veicolo ? "selected" : ""}>${v.veicolo}</option>`)
      .join("");

    row.innerHTML = `
  <div class="ordine-top">
    <input type="checkbox" class="ordine-check" ${o.check ? "checked" : ""} onchange="onToggleCheckbox(${o.row}, this.checked)">
    <div class="ordine-title" onclick="editDescrizione(this, ${o.row})">
      ${o.descrizione || "Scrivi descrizione ordine…"}
    </div>
    <div class="ordine-menu">
      <button class="ordine-menu-btn" onclick="toggleMenu(this)">⋮</button>
      <div class="ordine-menu-popup">
        <button class="ordine-delete" onclick="eliminaOrdine(${o.row})">Elimina</button>
      </div>
    </div>
  </div>
  <div class="ordine-body">
    <!-- 🔥 AGGIUNTO data-row -->
    <select class="ordine-select" data-row="${o.row}" onchange="onChangeCliente(${o.row}, this.value)">
      <option value="" disabled ${o.cliente ? "" : "selected"}>Cliente</option>
      ${clienti.map(c => `<option value="${c}" ${c === o.cliente ? "selected" : ""}>${c}</option>`).join("")}
    </select>
    
    <!-- 🔥 AGGIUNTO data-row -->
    <select class="ordine-select" data-row="${o.row}" onchange="onChangeVeicolo(${o.row}, this.value)">
      <option value="" disabled ${o.veicolo ? "" : "selected"}>Seleziona veicolo</option>
      ${veicoloOpts}
    </select>
    
    <!-- 🔥 AGGIUNTO data-row -->
    <select class="ordine-select" data-row="${o.row}" onchange="onChangeFornitore(${o.row}, this.value)">
      ${fornitoriOpts}
    </select>
    
    <button class="ordine-invia" onclick="inviaOrdine(${o.row}, this)">INVIA</button>
  </div>
`;

    fragment.appendChild(row);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
}

// 🔥 Lazy load veicoli: carica select solo quando l'utente clicca
function initLazyVeicoliSelect() {
  document.querySelectorAll(".ordine-select[onchange*='onChangeVeicolo']").forEach(select => {
    select.addEventListener("focus", function() {
      if (this.dataset.loaded) return;
      
      const row = this.closest(".ordine-row");
      const cliente = row?.querySelector("select[onchange*='onChangeCliente']")?.value;
      
      if (cliente && VEICOLI_ALL) {
        const opts = VEICOLI_ALL
          .filter(v => v.clienteNome === cliente)
          .map(v => `<option value="${v.veicolo}">${v.veicolo}</option>`)
          .join("");
        
        this.innerHTML = `<option value="" disabled selected>Seleziona veicolo</option>${opts}`;
        this.dataset.loaded = "true";
      }
    }, { once: true });
  });
}

// Chiama questa funzione alla fine di renderOrdini:
// initLazyVeicoliSelect();

function renderSelectVeicolo(row, veicoloSelezionato, clienteSelezionato, veicoli) {
  const lista = clienteSelezionato
    ? veicoli.filter(v => v.clienteNome === clienteSelezionato)
    : veicoli;

  const opts = lista.map(v =>
    `<option value="${v.veicolo}" ${
      v.veicolo === veicoloSelezionato ? "selected" : ""
    }>${v.veicolo}</option>`
  ).join("");

  return `
    <select class="ordine-select"
      onchange="onChangeVeicolo(${row}, this.value)">
      <option value="" disabled ${veicoloSelezionato ? "" : "selected"}>
        Seleziona veicolo
      </option>
      ${opts}
    </select>
  `;
}

function onChangeCliente(row, cliente) {
  if (!cliente) return;

  // 1️⃣ Aggiorna subito la UI (reattività)
  aggiornaSelectVeicoliUI(row, cliente);

  // 2️⃣ Salva su Google Sheet
  callBackend("aggiornaClienteOrdine", [row, cliente])
    .then(() => {
      console.log("Cliente aggiornato su Sheet:", row, cliente);

      // 🔄 aggiorna cache locale
      if (CACHE_ORDINI) {
        const ordine = CACHE_ORDINI.ordini
          .find(o => Number(o.row) === Number(row));
        if (ordine) ordine.cliente = cliente;
      }
    })
    .catch(err => {
  UI.error("Errore salvataggio cliente: " + err.message, "onChangeCliente");
});
}

function onChangeVeicolo(row, veicolo) {
  if (!veicolo) return;

  callBackend("aggiornaVeicoloOrdine", [row, veicolo])
    .then(() => {
      console.log("Veicolo aggiornato su Sheet:", row, veicolo);

      if (CACHE_ORDINI) {
        const ordine = CACHE_ORDINI.ordini
          .find(o => Number(o.row) === Number(row));
        if (ordine) ordine.veicolo = veicolo;
      }
    })
    .catch(err => {
  UI.error("Errore salvataggio veicolo: " + err.message, "onChangeVeicolo");
});
}

function onChangeFornitore(row, fornitore) {
  if (!fornitore) return;

  callBackend("aggiornaFornitoreOrdine", [row, fornitore])
    .then(() => {
      console.log("Fornitore aggiornato:", row, fornitore);

      if (CACHE_ORDINI) {
        const ordine = CACHE_ORDINI.ordini.find(o => o.row === row);
        if (ordine) ordine.fornitoreSelezionato = fornitore;
      }
    })
    .catch(err => {
  UI.error("Errore salvataggio fornitore: " + err.message, "onChangeFornitore");
});
}

function fornitoreHtml(o) {
  return `
    <select class="ordine-select"
      onchange="onChangeFornitore(${o.row}, this.value)">

      <option value="" selected disabled>
        Fornitore
      </option>

      <option value="autoparts">
        Autoparts
      </option>

      <option value="teamcar">
        Teamcar
      </option>

      <option value="giuliano">
        Giuliano
      </option>
    </select>
  `;
}

function inviaWhatsApp(btn) {
  const select = btn.previousElementSibling;
  const link = select.value;
  if (!link) {
    showAlert("Fornitore");
    return;
  }
  window.open(link, "_blank");
}

function inviaOrdine(row, btnElement) {

  const btn = btnElement || event.target;

  const select = document.querySelector(
    `select[onchange="onChangeFornitore(${row}, this.value)"]`
  );

  if (!select || !select.value) {
    showAlert("Seleziona un fornitore");
    return;
  }

  const fornitore = select.value;

  // 🔄 Stato loading
  btn.classList.remove("ready");
  btn.classList.add("loading");
  btn.textContent = "Caricamento...";

  callBackend("generaLinkWhatsAppSingolo", [row])
    .then(linkObj => {

      const link = linkObj?.[fornitore];

      if (!link) {
        showAlert("Link non disponibile");
        return;
      }

      // ✅ Stato pronto
      btn.classList.remove("loading");
      btn.classList.add("ready");
      btn.textContent = "INVIA";

      window.open(link, "_blank");
    })
    .catch(err => {
  UI.error("Errore invio ordine: " + err.message, "inviaOrdine");
  btn.classList.remove("loading");
  btn.textContent = "INVIA";
});
}

function onToggleCheckbox(row, checked) {
  callBackend("aggiornaCheckboxOrdine", [row, checked])
    .then(() => {
      console.log("Checkbox aggiornata:", row, checked);

      // 🔄 aggiorna cache
      if (CACHE_ORDINI) {
        const ordine = CACHE_ORDINI.ordini.find(o => o.row === row);
        if (ordine) ordine.check = checked;
      }
    })
    .catch(err => {
      console.error("Errore aggiornamento checkbox:", err);
      showAlert("Errore nel salvataggio dello stato ordine");
    });
}

function aggiornaSelectVeicoliUI(row, cliente) {
  console.log("🔍 Aggiorno veicoli per cliente:", cliente);
  console.log("📦 VEICOLI_ALL:", VEICOLI_ALL);
  
  const selectVeicolo = document.querySelector(
    `select[data-row="${row}"][onchange*="onChangeVeicolo"]`
  );

  if (!selectVeicolo) {
    console.error("❌ Select veicolo non trovata per row:", row);
    return;
  }

  // 🔥 Filtra veicoli per cliente
  const lista = cliente && cliente.trim() !== ""
    ? VEICOLI_ALL.filter(v => {
        const match = v.clienteNome?.trim().toLowerCase() === cliente.trim().toLowerCase();
        if (match) console.log("✅ Veicolo trovato:", v.veicolo);
        return match;
      })
    : VEICOLI_ALL;

  console.log("🚗 Veicoli filtrati:", lista.length);

  const selected = selectVeicolo.value;
  const stillValid = lista.some(v => v.veicolo === selected);

  selectVeicolo.innerHTML = `
    <option value="" disabled ${!selected || !stillValid ? 'selected' : ''}>
      ${lista.length === 0 ? 'Nessun veicolo' : 'Seleziona veicolo'}
    </option>
    ${lista.map(v => 
      `<option value="${v.veicolo}" ${v.veicolo === selected ? 'selected' : ''}>
        ${v.veicolo}
      </option>`
    ).join("")}
  `;
}

function nuovoOrdine() {

  showPrompt(descrizione => {

    if (!descrizione || !descrizione.trim()) return;

    callBackend("creaNuovoOrdine", [descrizione])
      .then(res => {
        callBackend("notificaNuovoOrdine", [descrizione]);
        const nuovoOrdine = {
          row: res?.row || Date.now(),
          check: false,
          descrizione: descrizione,
          cliente: "",
          veicolo: "",
          fornitori: {
            autoparts: "",
            teamcar: "",
            giuliano: ""
          }
        };
        if (!CACHE_ORDINI) {
          CACHE_ORDINI = { ordini: [], clienti: [], veicoli: [], fornitori: [] };
        }
        CACHE_ORDINI.ordini.push(nuovoOrdine);
        renderOrdini(
          CACHE_ORDINI.ordini,
          CACHE_ORDINI.clienti,
          CACHE_ORDINI.veicoli,
          CACHE_ORDINI.fornitori
        );
        localStorage.setItem("last_created_order", Date.now())
        toggleBadgeOrdini(true);
      });

  });

}

function editDescrizione(span, row) {

  const testoAttuale = span.textContent.trim();

  const input = document.createElement("input");
  input.type = "text";
  input.value =
    testoAttuale === "Scrivi descrizione ordine…" ? "" : testoAttuale;
  input.className = "ordine-input";

  span.replaceWith(input);
  input.focus();

  input.addEventListener("keydown", e => {

    if (e.key !== "Enter") return;

    const nuovoTesto = input.value.trim();
    const testoFinale = nuovoTesto || "Scrivi descrizione ordine…";

    // 🔥 1. Aggiorna UI SUBITO
    const nuovoSpan = document.createElement("span");
    nuovoSpan.className = "ordine-descr";
    nuovoSpan.textContent = testoFinale;
    nuovoSpan.onclick = () => editDescrizione(nuovoSpan, row);

    input.replaceWith(nuovoSpan);

    // 🔥 2. Aggiorna cache locale subito
    if (CACHE_ORDINI) {
      const ordine = CACHE_ORDINI.ordini.find(o => o.row === row);
      if (ordine) ordine.descrizione = nuovoTesto;
    }

    // 🔥 3. Backend in background
    callBackend("aggiornaDescrizioneOrdine", [row, nuovoTesto])
      .catch(() => {
        showAlert("Errore nel salvataggio su Sheet");
      });

  });

  // 🔥 ESC per annullare
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      input.replaceWith(span);
    }
  });

  // 🔥 Se perdi focus, salva automaticamente
  input.addEventListener("blur", () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  });
}
/********************
 * ORDINE VOCALE
 ********************/
let recognitionOrdine = null;

function avviaOrdineVocale() {

  if (modalitaAssistente === "vocale") {
    showAlert("Chiudi prima l’assistente");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
  UI.error("Speech Recognition non supportato dal browser", "avviaOrdineVocale");
  return;
}

  recognitionOrdine = new SpeechRecognition();
  recognitionOrdine.lang = "it-IT";
  recognitionOrdine.interimResults = false;
  recognitionOrdine.continuous = false;

  recognitionOrdine.onstart = () => {
    toggleMicIndicator(true);
    console.log("🎤 Ascolto nuovo ordine...");
  };

  recognitionOrdine.onresult = e => {

    toggleMicIndicator(false);   // 🔴 IMPORTANTISSIMO

    const testo = e.results[0][0].transcript.trim();
    console.log("📝 Ordine vocale:", testo);

    if (!testo) return;

    const descrizione = normalizzaDescrizioneOrdine(testo);

    callBackend("inserisciNuovoOrdineVocale", [descrizione])
      .then(() => {
        console.log("✅ Ordine vocale salvato");
        caricaOrdiniUI(true);
        checkNotificheHome();
      })
      .catch(err => {
  UI.error("Errore inserimento ordine vocale: " + err.message, "avviaOrdineVocale");
});
  };

  recognitionOrdine.onerror = e => {
  toggleMicIndicator(false);
  if (e.error === "no-speech") return;
  if (e.error === "aborted") return;
  if (e.error === "network") return;
  UI.error("Errore microfono: " + e.error, "avviaOrdineVocale");
};

  recognitionOrdine.onend = () => {
    toggleMicIndicator(false);   // 🔴 QUI (backup sicurezza)
    console.log("🎤 Mic ordine spento");
  };

  recognitionOrdine.start();
}

function preloadOrdini() {

  const now = Date.now();
  if (CACHE_ORDINI && now - CACHE_TS < CACHE_TTL) return;

  callBackend("getOrdiniBundle")
    .then(bundle => {

      CACHE_ORDINI = {
        ordini: bundle?.ordini || [],
        clienti: bundle?.clienti || [],
        veicoli: bundle?.veicoli || [],
        fornitori: bundle?.fornitori || []
      };

      VEICOLI_ALL = CACHE_ORDINI.veicoli; // 🔥 AGGIUNGI QUESTO

      CACHE_TS = Date.now();
      console.log("Ordini preload completato");
    })
    .catch(err => {
      console.warn("Preload ordini fallito", err);
    });
}

function preloadRevisioni(){

  if(CACHE_REVISIONI) return;

  console.log("Preload revisioni...");

  callBackend("getRevisioni")
    .then(lista=>{
      CACHE_REVISIONI = lista;
      console.log("Preload revisioni completato");
    })
    .catch(err=>{
      console.warn("Preload revisioni fallito", err);
    });

}

function preloadClientiVeicoli(){

  callBackend("getClientiVeicoliBundle")
  .then(lista=>{
    CLIENTI_VEICOLI_CACHE = lista;
    console.log("Preload clienti/veicoli ok");
  });

}

function caricaAppuntamentiOggi() {

  const box =
    document.getElementById("oggiEventi");

  const toggleBtn =
    document.getElementById("toggleOggi");

  console.log(
    "📅 caricaAppuntamentiOggi chiamata"
  );

  if (!box) {
    console.error(
      "❌ Elemento #oggiEventi non trovato"
    );
    return;
  }

  box.innerHTML = `
    <p style="
      color:#666;
      text-align:center;
    ">
      Caricamento...
    </p>
  `;

  if (toggleBtn) {
    toggleBtn.style.display = "none";
  }

  callBackend("getAppuntamentiOggi")
    .then(risposta => {

      if (
        risposta &&
        typeof risposta === "object" &&
        !Array.isArray(risposta) &&
        risposta.ok === false
      ) {
        throw new Error(
          risposta.error ||
          "Errore restituito dal backend"
        );
      }

      let eventi = [];

      if (Array.isArray(risposta)) {

        eventi = risposta;

      } else if (
        Array.isArray(risposta?.data)
      ) {

        eventi = risposta.data;

      } else if (
        Array.isArray(risposta?.eventi)
      ) {

        eventi = risposta.eventi;

      } else {

        console.warn(
          "⚠️ Formato appuntamenti non riconosciuto:",
          risposta
        );

        throw new Error(
          "Formato risposta appuntamenti non valido"
        );
      }

      if (eventi.length === 0) {

        console.log(
          "⚠️ Nessun appuntamento oggi"
        );

        box.innerHTML = `
          <p style="
            color:#666;
            text-align:center;
            padding:10px;
          ">
            Nessun appuntamento oggi
          </p>
        `;

        box.style.maxHeight = "none";
        box.style.overflow = "visible";

        return;
      }

      console.log(
        `✅ ${eventi.length} appuntamenti trovati`
      );

      box.innerHTML = eventi
        .map(evento => {

          const ora =
            escapeHTMLAppuntamenti(
              evento?.ora || ""
            );

          const titolo =
            escapeHTMLAppuntamenti(
              evento?.titolo ||
              "Appuntamento"
            );

          return `
            <div class="evento-oggi">
              <strong>${ora}</strong>
              ${ora ? " – " : ""}
              ${titolo}
            </div>
          `;
        })
        .join("");

      const elementi =
        box.querySelectorAll(
          ".evento-oggi"
        );

      if (elementi.length > 5) {

        box.style.maxHeight = "120px";
        box.style.overflow = "hidden";
        box.style.transition =
          "max-height 0.3s ease";

        if (toggleBtn) {

          toggleBtn.style.display =
            "inline-block";

          toggleBtn.textContent = "▼";

          toggleBtn.onclick = () => {

            const chiuso =
              box.style.maxHeight ===
              "120px";

            box.style.maxHeight =
              chiuso
                ? `${box.scrollHeight}px`
                : "120px";

            toggleBtn.textContent =
              chiuso ? "▲" : "▼";
          };
        }

      } else {

        box.style.maxHeight = "none";
        box.style.overflow = "visible";

        if (toggleBtn) {
          toggleBtn.style.display = "none";
        }
      }
    })
    .catch(err => {

      console.error(
        "❌ Errore caricamento appuntamenti:",
        err
      );

      box.innerHTML = `
        <p style="
          color:#f44336;
          text-align:center;
          padding:10px;
        ">
          Errore caricamento appuntamenti
        </p>
      `;

      if (toggleBtn) {
        toggleBtn.style.display = "none";
      }
    });
}

function escapeHTMLAppuntamenti(valore) {

  return String(valore ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function caricaAgendaSettimanale() {
  const container = document.getElementById("agendaSettimanale");
  if (!container) return;

  callBackend("getAppuntamentiSettimana")
    .then(eventi => {
      if (!eventi || eventi.length === 0) {
        container.innerHTML = "<p>Nessun appuntamento questa settimana</p>";
        return;
      }

      // Ordine giorni corretto
      const ordine = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
      const grouped = {};
      
      eventi.forEach(ev => {
        if (!grouped[ev.giorno]) grouped[ev.giorno] = [];
        grouped[ev.giorno].push(ev);
      });

      // Render ultra-leggero: solo testo, spaziatura chiara
      let html = "";
      ordine.forEach(giorno => {
        if (grouped[giorno]) {
          html += `<div style="margin-bottom: 16px;">
                     <strong style="font-size: 15px; display: block; margin-bottom: 6px;">${giorno}</strong>`;
          grouped[giorno].forEach(ev => {
            html += `<div style="margin: 4px 0 4px 8px; font-size: 14px; line-height: 1.4;">
                       <span style="font-weight: 600; min-width: 45px; display: inline-block;">${ev.ora}</span> ${ev.titolo}
                     </div>`;
          });
          html += "</div>";
        }
      });
      
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML = "<p>Errore caricamento</p>";
    });
}

/* ======================
 * PONTI HOME → SEZIONI
 * ====================== */

// HOME → ORDINI → Nuovo ordine
function homeNuovoOrdine() {

  autoOpenSection = true;
  showSection("ordini");

  setTimeout(() => {
    nuovoOrdine();
  }, 150);

  setTimeout(() => {
    autoOpenSection = false;
  }, 800);
}

// HOME → ORDINI → Ordine vocale
function homeOrdineVocale() {

  autoOpenSection = true;
  showSection("ordini");

  setTimeout(() => {
    avviaOrdineVocale();
  }, 150);

  setTimeout(() => {
    autoOpenSection = false;
  }, 800);
}

// HOME → CARICA LIBRETTO (SOLUZIONE FUNZIONANTE)
function homeCaricaLibretto() {
  const input = document.getElementById("libretto");
  if (!input) {
  UI.error("Input libretto non trovato nel DOM", "homeCaricaLibretto");
  return;
}

  // reset form PRIMA
  resetClienti();

  // 👇 QUESTO deve stare NEL CLICK UTENTE
  input.click();

  // dopo lo switch di sezione è sicuro
  showSection("clienti");
}

// HOME → SCHEDE
function homeSchede() {
  apriAssistente();
}

function apriPortaleFatture() {
  window.open(
    "https://metropolis.seac.it/login",
    "_blank"
  );
}

function scegliLibretto() {
  const foto = showConfirm(
    "Vuoi scattare una foto del libretto?\n\nOK = Fotocamera\nAnnulla = Galleria"
  );

  if (foto) {
    document.getElementById("librettoCamera").click();
  } else {
    document.getElementById("librettoGallery").click();
  }
}

function scegliTarga() {
  const foto = showConfirm(
    "Vuoi scattare una foto della targa?\n\nOK = Fotocamera\nAnnulla = Galleria"
  );

  if (foto) {
    document.getElementById("targaCamera").click();
  } else {
    document.getElementById("targaGallery").click();
  }
}

function toggleMenu(btn) {

  // chiude tutti i menu aperti
  document
    .querySelectorAll(".scheda-menu-popup, .ordine-menu-popup")
    .forEach(m => {
      if (m !== btn.nextElementSibling) {
        m.style.display = "none";
      }
    });
  const menu = btn.nextElementSibling;
  menu.style.display =
    menu.style.display === "block"
      ? "none"
      : "block";
}

// chiudi menu cliccando fuori
document.addEventListener("click", e => {
  if (!e.target.closest(".scheda-menu, .ordine-menu")) {
    document
      .querySelectorAll(".scheda-menu-popup, .ordine-menu-popup")
      .forEach(m => {
        m.style.display = "none";
      });
  }
});

function eliminaScheda(idScheda, status, linkDoc) {

  showConfirm(
    "⚠️ Sei sicuro di voler eliminare questa scheda?\n\n" +
    (status === "CHIUSA"
      ? "Verrà eliminato anche il documento associato."
      : "L'operazione è irreversibile."),
  conferma => {

    if (!conferma) return;

    const backupCache = [...(cacheSchede || [])];

    cacheSchede = (cacheSchede || [])
      .filter(s => s.id !== idScheda);

    renderSchede(cacheSchede);

    callBackend("eliminaScheda", [idScheda])
      .then(() => {
        console.log("Scheda eliminata definitivamente");
      })
      .catch(err => {
  UI.error("Errore eliminazione scheda: " + err.message, "eliminaScheda");
  cacheSchede = backupCache;
  renderSchede(cacheSchede);
});

  });

}

(function () {
  const isMobile =
    window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    document.documentElement.classList.add("is-mobile");
  } else {
    document.documentElement.classList.add("is-desktop");
  }
})();

document.addEventListener("DOMContentLoaded", () => {

  const drawer = document.getElementById("mobileDrawer");
  const overlay = document.getElementById("drawerOverlay");
  const logo = document.querySelector(".logo");

  function closeDrawer() {
    drawer?.classList.remove("open");
    overlay?.classList.remove("show");
  }

  logo?.addEventListener("click", () => {
    drawer?.classList.add("open");
    overlay?.classList.add("show");
  });

  overlay?.addEventListener("click", closeDrawer);

  document.querySelectorAll("#mobileDrawer button").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      showSection(page);
      closeDrawer();
    });
  });

});

function eliminaOrdine(row) {
  showConfirm("⚠️ Eliminare questo ordine?", conferma => {
    if (!conferma) return;

    if (!CACHE_ORDINI || !CACHE_ORDINI.ordini) return;

    const backup = [...CACHE_ORDINI.ordini];

    CACHE_ORDINI.ordini = CACHE_ORDINI.ordini.filter(o => o.row !== row);
    renderOrdini(CACHE_ORDINI.ordini, CACHE_ORDINI.clienti, CACHE_ORDINI.veicoli, CACHE_ORDINI.fornitori);

    callBackend("eliminaOrdine", [row])
      .then(() => {
        console.log("Ordine eliminato");
      })
      .catch(err => {
        UI.error("Errore eliminazione ordine: " + err.message, "eliminaOrdine");
        // Ripristina cache in caso di errore
        CACHE_ORDINI.ordini = backup;
        renderOrdini(CACHE_ORDINI.ordini, CACHE_ORDINI.clienti, CACHE_ORDINI.veicoli, CACHE_ORDINI.fornitori);
      });
  });
}

function isMobile() {
  return document.body.classList.contains("is-mobile");
}

function apriCalendario() {
  window.open(
    "https://calendar.google.com/calendar/u/0/r?cid=appuntamenti.goldencar@gmail.com",
    "_blank"
  );
}

function retryAscolto() {
  if (modalitaAssistente !== "vocale") return;

  clearTimeout(micTimeout);
  micTimeout = setTimeout(() => {
  }, 600);
}

function setAssistenteStatus(testo) {
  const el = document.getElementById("assistenteStatus");
  if (el) el.textContent = testo;
}

function ripetiDomandaCorrente() {
  console.log("🔁 RIPETI:", sessioneAssistente.step);
  setTimeout(domandaCorrente, 400);
}

function sbloccaAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    console.log("🔓 AudioContext sbloccato");
  } catch (e) {
    console.warn("AudioContext non sbloccabile", e);
  }
}

  document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll("[data-target]").forEach(btn => {

    btn.addEventListener("click", function(e){

      e.preventDefault();

      const targetId = this.getAttribute("data-target");
      const input = document.getElementById(targetId);

      if(input){
        input.click();
      }

    });

  });

});

function resetFileInput(inputId, viewId) {

  const input = document.getElementById(inputId);
  const viewBtn = document.getElementById(viewId);

  if (!input || !viewBtn) return;

  // svuota file selezionato
  input.value = "";

  // nasconde Visualizza
  if (viewBtn) {
  viewBtn.classList.add("hidden");
}


  // rimuove preview precedente
  viewBtn.onclick = null;
}

document.addEventListener("DOMContentLoaded", () => {

  resetFileInput("librettoGallery", "librettoLink");
  resetFileInput("librettoCamera", "librettoLink");

  resetFileInput("targaGallery", "targaLink");
  resetFileInput("targaCamera", "targaLink");

  resetFileInput("altriDocumenti", "altriLink");
  checkNotificheHome();
  setInterval(checkNotificheHome, 60000);

});

function abilitaPreview(inputId, linkId){

  const input = document.getElementById(inputId);
  const link = document.getElementById(linkId);

  if (!input || !link) return;

  input.addEventListener("change", () => {

    const file = input.files?.[0];

    if (!file){

      link.classList.add("hidden");
      return;

    }

    const url = URL.createObjectURL(file);

    link.classList.remove("hidden");   // ✅ QUESTO È IL FIX
    link.style.display = "inline-block";

    link.onclick = () => {
      window.open(url, "_blank");
      // 🔥 REVOKA L'URL DOPO 60 SECONDI PER LIBERARE MEMORIA
      setTimeout(() => {
        URL.revokeObjectURL(url);
        console.log("🗑️ URL revocato:", file.name);
      }, 60000);
    };

    console.log("Preview pronta:", file.name);

  });

}

function startLoading(id){
  document.getElementById(id)?.classList.add("active");
}

function stopLoading(id){
  const el = document.getElementById(id);
  if(!el) return;

  el.classList.remove("active");
  el.classList.add("ok");

  setTimeout(()=>{
    el.classList.remove("ok");
  }, 1500);
}

document.addEventListener("DOMContentLoaded", () => {

  const toggleBtn = document.getElementById("toggleOggi");
  const listaOggi = document.getElementById("oggiEventi");

  if (!toggleBtn || !listaOggi) return;

  // stato iniziale chiuso
  listaOggi.style.maxHeight = "0px";
  listaOggi.style.overflow = "hidden";
  listaOggi.style.transition = "max-height 0.3s ease";

  toggleBtn.addEventListener("click", () => {

    const isOpen = listaOggi.style.maxHeight !== "0px";

    if (isOpen) {
      listaOggi.style.maxHeight = "0px";
      toggleBtn.textContent = "▼";
    } else {
      listaOggi.style.maxHeight = listaOggi.scrollHeight + "px";
      toggleBtn.textContent = "▲";
    }

  });

  checkNotificheHome();
  preloadOrdini();   // 🔥 QUI

});

async function caricaAgendaSettimanale(force = false) {
  console.log("📅 caricaAgendaSettimanale chiamata, force:", force);
  
  const container = document.getElementById("agendaSettimanale");
  if (!container) {
    console.error("❌ Container agendaSettimanale non trovato!");
    return;
  }
  
  container.classList.remove("hidden");
  container.innerHTML = "<p>Caricamento appuntamenti...</p>";
  
  try {
    console.log("🔄 Chiamo backend getAppuntamentiSettimana...");
    const data = await callBackend("getAppuntamentiSettimana");
    
    console.log("✅ Dati ricevuti:", data);
    
    if (!data || data.length === 0) {
      container.innerHTML = "<p>📭 Nessun appuntamento questa settimana</p>";
      return;
    }
    
    // Raggruppa per giorno
    const giorniOrdinati = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    const grouped = {};
    
    data.forEach(ev => {
      const giorno = ev.giorno;
      if (!grouped[giorno]) {
        grouped[giorno] = [];
      }
      grouped[giorno].push(ev);
    });
    
    // Crea HTML
    let html = "<div class='agenda-container'>";
    
    giorniOrdinati.forEach(giorno => {
      if (grouped[giorno]) {
        html += `<div class='agenda-day'><h3>${giorno}</h3>`;
        
        grouped[giorno].forEach(ev => {
          html += `
            <div class='agenda-event'>
              <span class='agenda-ora'>🕐 ${ev.ora}</span>
              <span class='agenda-titolo'>${ev.titolo}</span>
            </div>
          `;
        });
        
        html += "</div>";
      }
    });
    
    html += "</div>";
    container.innerHTML = html;
    
    console.log("✅ Agenda renderizzata con successo");
    
  } catch (err) {
    console.error("❌ Errore caricamento appuntamenti:", err);
    container.innerHTML = `<p style='color:red'>⚠️ Errore: ${err.message}</p>`;
  }
}

function renderAgendaSettimanale(data, container) {
  if (!data || !data.length) {
    container.innerHTML = "<p>Nessun appuntamento questa settimana</p>";
    return;
  }
  
  // Raggruppa per giorno
  const grouped = {};
  data.forEach(ev => {
    const giorno = ev.giorno;
    if (!grouped[giorno]) {
      grouped[giorno] = [];
    }
    grouped[giorno].push(ev);
  });
  
  container.innerHTML = "";
  Object.keys(grouped).forEach(giorno => {
    const dayDiv = document.createElement("div");
    dayDiv.className = "agenda-day";
    dayDiv.innerHTML = `<h3>${giorno}</h3>`;
    
    grouped[giorno].forEach(ev => {
      const eventDiv = document.createElement("div");
      eventDiv.className = "agenda-event";
      eventDiv.innerHTML = `<span class="agenda-ora">${ev.ora}</span> ${ev.titolo}`;
      dayDiv.appendChild(eventDiv);
    });
    
    container.appendChild(dayDiv);
  });
}

function caricaRevisioni(force = false){

  if(!force && CACHE_REVISIONI){
    renderRevisioni(CACHE_REVISIONI);
    return;
  }

  callBackend("getRevisioni", [])
    .then(data=>{
      CACHE_REVISIONI = data;
      renderRevisioni(data);
    });

}

function renderRevisioni(lista){

  const box = document.getElementById("listaRevisioni");
  box.innerHTML = "";

  const oggi = new Date();
  oggi.setHours(0,0,0,0);

  lista.forEach(r=>{

    let diff = null;
    
    if(r.revisione){
    
      const dataRev = new Date(r.revisione);
      diff = (dataRev - oggi) / (1000*60*60*24);
    
      if(diff < 0) classe = "scaduta";
      else if(diff <= 30) classe = "warning";
    
    }

    let statoClasse = "";

    if(r.revisione){
    
      const dataRev = new Date(r.revisione);
      const diff = (dataRev - oggi) / (1000*60*60*24);
    
      if(diff < 0) statoClasse = "scaduta";
      else if(diff <= 30) statoClasse = "warning";
    
    }

    const card = document.createElement("div");
    card.className = "revisione-card " + statoClasse;
    card.dataset.idcliente = r.idCliente;
    card.dataset.veicolo = r.veicolo;

   card.innerHTML = `
    <button class="btn-cal"
      onclick="modificaRevisione('${r.idCliente}','${r.veicolo}')">
      ${ICON_CALENDAR}
    </button>
  
    <div class="revisione-cliente">${r.cliente}</div>
  
    <div class="revisione-veicolo">
      ${String(r.veicolo).replace(/\n/g," ")}
    </div>
  
    <div class="revisione-data">
      ${formatData(r.revisione)}
    </div>
  
    <button class="btn-whatsapp"
      onclick="ricordaRevisione('${r.telefono}','${r.veicolo}','${r.revisione}')">
      RICORDA
    </button>
  `;

    box.appendChild(card);

  });

}

document.getElementById("filtroRevisioni")
.addEventListener("input", function(){

  const q = this.value.toLowerCase();

  document.querySelectorAll(".revisione-card")
  .forEach(card=>{

    const nome = card
      .querySelector(".revisione-cliente")
      .innerText
      .toLowerCase();

    card.style.display =
      nome.includes(q) ? "flex" : "none";

  });

});

function ricordaRevisione(tel, veicolo, data){

  const msg = `Buongiorno, ti ricordo la scadenza della revisione del tuo veicolo ${veicolo} in data ${formatData(data)}`;

  const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;

  window.open(url, "_blank");

}

window.modificaRevisione = function(idCliente, veicolo){

  const popup = document.createElement("div");
  popup.className = "popup-calendario";

  popup.innerHTML = `
    <div class="popup-cal-box">
      <h3>Nuova data revisione</h3>
      <input type="date" id="dataRevInput">
      <div class="popup-cal-actions">
        <button id="salvaRevBtn">Salva</button>
        <button id="annullaRevBtn">Annulla</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  document.getElementById("annullaRevBtn").onclick = ()=>{
    popup.remove();
  };

  document.getElementById("salvaRevBtn").onclick = ()=>{

  const nuova = document.getElementById("dataRevInput").value;
  if(!nuova) return;

  callBackend("updateRevisione", [
    { idCliente, veicolo, revisione: nuova }
  ]).then(()=>{

    const item = CACHE_REVISIONI.find(r =>
      r.idCliente == idCliente && r.veicolo == veicolo
    )

    if(item) item.revisione = nuova

    CACHE_REVISIONI.sort((a,b)=>{
      if(!a.revisione) return 1
      if(!b.revisione) return -1
      return new Date(a.revisione) - new Date(b.revisione)
    })

    renderRevisioni(CACHE_REVISIONI)

    popup.remove()

  })

};

};

function formatData(data){

  if(!data) return "—";

  const d = new Date(data);

  if(isNaN(d)) return data;

  const gg = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const aa = d.getFullYear();

  return `${gg}/${mm}/${aa}`;
}

function aggiornaCardRevisione(idCliente, veicolo, nuova){

  const card = document.querySelector(
    `[data-idcliente="${idCliente}"][data-veicolo="${veicolo}"]`
  );

  if(!card) return;

  card.querySelector(".revisione-data").innerText =
    formatData(nuova);

}

function initRevisioneCliente(){

  const input = document.getElementById("revisioneInput");
  if(!input) return;

  input.addEventListener("click", function(){

    const popup = document.createElement("div");
    popup.className = "popup-calendario";

    popup.innerHTML = `
      <div class="popup-cal-box">
        <h3>Scadenza revisione</h3>
        <input type="date" id="revClienteData">
        <div class="popup-cal-actions">
          <button id="salvaRevCliente">Salva</button>
          <button id="annullaRevCliente">Annulla</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    document.getElementById("annullaRevCliente").onclick = ()=>{
      popup.remove();
    };

    document.getElementById("salvaRevCliente").onclick = ()=>{

      const val = document.getElementById("revClienteData").value;
      if(!val) return;

      input.value = formatData(val);
      input.dataset.raw = val;

      popup.remove();
    };

  });

}

async function verificaBackend(){

  try{
    await callBackend("ping");
  }catch(e){
    mostraPopupBackend();
  }

}

function mostraPopupBackend(){

  if(document.getElementById("backendPopup")) return;

  const div = document.createElement("div");
  div.id = "backendPopup";
  div.className = "backend-popup";

  div.innerHTML = `
    <div class="backend-box">
      <h3>Connessione scaduta</h3>
      <p>Serve riattivare il backend.</p>
      <button class="primary" onclick="riattivaBackend()">Riattiva</button>
    </div>
  `;

  document.body.appendChild(div);

}

function riattivaBackend(){
  window.open("https://accounts.google.com/AccountChooser?continue=" + encodeURIComponent(API_URL), "_blank");
}

// ==========================
// 🔁 KEEP-ALIVE ROBUSTO
// ==========================
let keepAliveInterval = null;

function startKeepAlive() {
  // Ferma eventuali intervalli precedenti
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  // Ping ogni 15 minuti (sotto la soglia di timeout di Google)
  keepAliveInterval = setInterval(() => {
    callBackend("ping")
      .then(() => {
        console.log("🟢 Keep-alive OK");
        // Se c'era un popup di errore, chiudilo
        const popup = document.getElementById("backendPopup");
        if (popup) popup.remove();
      })
      .catch((err) => {
        console.warn("⚠️ Ping fallito:", err.message);
        // Solo se il popup non esiste già, mostralo
        if (!document.getElementById("backendPopup")) {
          mostraPopupBackend();
        }
      });
  }, 15 * 60 * 1000); // 15 minuti in millisecondi
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("⏸️ Keep-alive fermato");
  }
}

// Gestione visibilità pagina: ferma il ping se l'utente cambia tab
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startKeepAlive();
  } else {
    stopKeepAlive();
  }
});

// ==========================
// INIT PRINCIPALE
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  
  // 1. Verifica connessione iniziale
  verificaBackend();
  
  // 2. Avvia keep-alive
  startKeepAlive();
  
  // 3. Reset file input (tua logica esistente)
  resetFileInput("librettoGallery", "librettoLink");
  resetFileInput("librettoCamera", "librettoLink");
  resetFileInput("targaGallery", "targaLink");
  resetFileInput("targaCamera", "targaLink");
  resetFileInput("altriDocumenti", "altriLink");
  
  // 4. Check notifiche
  checkNotificheHome();
  initRevisioneCliente();
  
});


function getDeviceId() {
  let id = localStorage.getItem("device_id");
  
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("device_id", id);
  }
  
  return id;
}

// ==========================
// 🔔 REGISTRA DISPOSITIVO
// ==========================

async function initPush() {

  console.log("🚀 initPush partito");

  try {

    // 1️⃣ Service Worker
    const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;

    console.log("✅ SW pronto");

    // 2️⃣ Permesso notifiche
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("❌ Notifiche non autorizzate");
      return;
    }

    // 3️⃣ Firebase init
    const { initializeApp, getApps, getApp } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    
    const { getMessaging, getToken, onMessage } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");

    const firebaseConfig = {
      apiKey: "AIza...",
      authDomain: "goldencar-notifiche.firebaseapp.com",
      projectId: "goldencar-notifiche",
      messagingSenderId: "932662604015",
      appId: "1:932662604015:web:2d3a38bcbdd9c12253ab1a"
    };

    let app;
    
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    const messaging = getMessaging(app);

    // 🔥 4️⃣ ON MESSAGE (QUI GIUSTO)
    onMessage(messaging, (payload) => {
  console.log("📩 Notifica foreground:", payload);
  
  const { title, body, sound = true, vibrate = true } = payload.data || {};
  if (!title) return;

  // 🔊 Riproduci suono (se supportato)
  if (sound) {
    try {
      const audio = new Audio('/notification-sound.mp3'); // ← Crea questo file!
      audio.volume = 0.7;
      audio.play().catch(e => console.warn("🔇 Audio bloccato:", e));
    } catch (e) {
      console.warn("Audio non riprodotto:", e);
    }
  }

  // 📳 Vibrazione (se supportata)
  const vibrationPattern = vibrate ? [200, 100, 200] : [];

  new Notification(title, {
    body: body,
    icon: "/icon-192.png",
    vibrate: vibrationPattern,
    tag: "goldencar-notification", // Evita duplicati
    requireInteraction: false,
    silent: false // ← Importante: non silenziosa!
  });
});

    // 🔥 5️⃣ TOKEN
    const token = await getToken(messaging, {
      vapidKey: "BOSe3OL0HEzLB6vtcwGcTWh8YqQGFLIFFgHiURlMzKyHJ4hlZrfyo1qL5554g6ObMzGNRWgAvkmjabzvRXdgVDk",
      serviceWorkerRegistration: registration
    });

    const oldToken = localStorage.getItem("pushToken");

    if (token) {
  
    const res = await fetch(API_URL, {
      method: "POST",
      body: new URLSearchParams({
        action: "salvaPushToken",
        token: token,
        deviceId: getDeviceId()
      })
    });
    
    const text = await res.text();
    console.log("📡 RISPOSTA SERVER:", text);
  
    localStorage.setItem("pushToken", token);
    console.log("✅ Token salvato (forzato)");
  }

    console.log("🔥 TOKEN:", token);

    if (!token) {
      console.warn("❌ Nessun token ottenuto");
      return;
    }

  } catch (err) {
    console.error("❌ Errore push:", err);
  }
}

initPush();


// 🔥 Variabile globale per memorizzare i dati e la modalità
let DATI_SALVATAGGIO_TEMP = null;

/**
 * Apre il popup con le 3 modalità di salvataggio
 */
function apriPopupModalitaSalvataggio(dati) {
  console.log("🔵 Step 3: Apro popup modalità salvataggio");
  console.log("📦 Dati ricevuti:", dati);
  
  const popup = document.getElementById("popupModalitaSalvataggio");
  
  if (!popup) {
    console.error("❌ ERRORE: Popup #popupModalitaSalvataggio NON trovato!");
    showAlert("⚠️ Errore: popup salvataggio non trovato.");
    return;
  }
  
  // 🔥 FIX: Salva i dati nella variabile globale
  window.DATI_SALVATAGGIO_TEMP = dati;
  
  console.log("✅ Dati salvati in DATI_SALVATAGGIO_TEMP:", window.DATI_SALVATAGGIO_TEMP);
  
  popup.classList.remove("hidden");
  console.log("✅ Popup mostrato con successo");
}

/**
 * Chiude il popup e resetta i dati temporanei
 */
function chiudiPopupModalitaSalvataggio() {
  document.getElementById("popupModalitaSalvataggio").classList.add("hidden");
  DATI_SALVATAGGIO_TEMP = null;
}

async function confermaModalitaSalvataggio(modalita) {
  console.log("🚀 Conferma modalità:", modalita);
  console.log("📦 DATI_SALVATAGGIO_TEMP:", window.DATI_SALVATAGGIO_TEMP);
  
  // 🔥 FIX: Controlla se i dati esistono
  if (!window.DATI_SALVATAGGIO_TEMP) {
    console.error("❌ DATI_SALVATAGGIO_TEMP è null!");
    showAlert("⚠️ Errore: dati di salvataggio non trovati. Riprova.");
    return;
  }
  
  const dati = window.DATI_SALVATAGGIO_TEMP;
  
  // Chiudi popup
  const popup = document.getElementById("popupModalitaSalvataggio");
  if (popup) {
    popup.classList.add("hidden");
  }
  
  showAlert("⏳ Elaborazione in corso...");
  
  try {
    console.log("📡 Invio al backend...", { dati, modalita });
    
    const res = await callBackend("salvaClienteConModalita", [dati, modalita]);
    
    console.log("📩 Risposta backend:", res);
    
    if (!res.ok) {
      let msg = "❌ Errore: " + (res.error || "Operazione fallita");
      switch(res.error) {
        case "CF_ESISTENTE": msg = "⚠️ Esiste già un cliente con questo CF."; break;
        case "TARGA_ESISTENTE": msg = "⚠️ Esiste già un veicolo con questa targa."; break;
        case "CLIENTE_NON_TROVATO": msg = "⚠️ Cliente non trovato."; break;
        case "TARGA_GIA_ASSOCIATA": msg = "⚠️ Veicolo già associato."; break;
        case "VEICOLO_NON_SELEZIONATO":
          msg =
            "⚠️ Prima carica un veicolo dalla ricerca.";
          break;
        
        case "VEICOLO_NON_TROVATO":
          msg =
            "⚠️ Il veicolo da aggiornare non è stato trovato.";
          break;
        
        case "VEICOLO_NON_ASSOCIATO":
          msg =
            "⚠️ Il veicolo non appartiene al cliente selezionato.";
          break;
        
        case "TARGA_MANCANTE":
          msg =
            "⚠️ Inserisci la targa del veicolo.";
          break;
      }
      showAlert(msg);
      return;
    }
    
    // Successo
    let msg =
      "✅ Operazione completata!";
    
    if (res.clienteNuovo) {
      msg =
        "✅ Nuovo cliente creato!";
    }
    
    if (res.veicoloNuovo) {
      msg =
        "✅ Nuovo veicolo aggiunto!";
    }
    
    if (
      modalita === "sovrascrivi"
    ) {
      msg =
        "✅ Dati del cliente aggiornati!";
    }
    
    if (
      modalita === "aggiorna_veicolo"
    ) {
      msg =
        "✅ Dati del veicolo aggiornati!";
    }
    
    showAlert(msg);

    if (
      modalita === "aggiorna_veicolo"
    ) {
    
      /*
       * La nuova targa diventa la targa originale
       * per eventuali aggiornamenti successivi.
       */
      TARGA_VEICOLO_ORIGINALE =
        String(dati.targa || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
    
      /*
       * I file temporanei sono già stati utilizzati
       * dal backend: non devono essere reinviati.
       */
      TEMP_LIBRETTO_ID = null;
      TEMP_TARGA_ID = null;
      TEMP_ALTRI_DOCUMENTI = [];
    
      /*
       * Invalida le cache contenenti ancora
       * i dati precedenti del veicolo.
       */
      CLIENTI_CACHE_POPUP = null;
      CLIENTI_CACHE_TS = 0;
      CLIENTI_VEICOLI_CACHE = [];
    
      preloadClientiVeicoli();
    }
    
    // Reset form se non è sovrascrivi
    const mantieniForm =
      modalita === "sovrascrivi" ||
      modalita === "aggiorna_veicolo";
    
    if (!mantieniForm) {
      resetClienti();
    }
    
    // Apri cartella se esiste
    if (res.cartellaVeicoloUrl) {
      setTimeout(() => window.open(res.cartellaVeicoloUrl, "_blank"), 1000);
    }
    
  } catch(err) {
    console.error("❌ Errore salvataggio:", err);
    showAlert("❌ Errore di connessione: " + err.message);
  }
}
