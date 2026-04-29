const API_URL = "https://script.google.com/macros/s/AKfycbxE-GjdIUZ48NAUMSJ3P1a57QJBG6Wc__hePtTZIkcIgcH1sct27y5u17IJ10irr88C/exec";

const ICON_CALENDAR = `
<svg viewBox="0 0 24 24">
  <rect x="3" y="5" width="18" height="16" rx="3"/>
  <line x1="16" y1="3" x2="16" y2="7"/>
  <line x1="8" y1="3" x2="8" y2="7"/>
  <line x1="3" y1="11" x2="21" y2="11"/>
</svg>
`;

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
let CLIENTI_CACHE = [];
let CACHE_REVISIONI = null;
let CLIENTI_VEICOLI_CACHE = [];
let autoOpenSection = false;
let currentSection = "home";
let ORDINI_CACHE = null;

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
    showAlert("Popup ordine non trovato");
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
    }, 15000);

    window[cb] = function(res) {
      clearTimeout(timeout);
      cleanup();
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
const CACHE_TTL = 3 * 60 * 1000;
let librettoLink;
let targaLink;
let btnCartellaCliente;
let clienteEsistente = false;
let assistenteInChiusura = false;
let rispostaInElaborazione = false;

async function analizza() {

  startLoading("loadingOCR");

  if (!TEMP_LIBRETTO_ID) {
    showAlert("Carica prima il libretto");
    return;
  }

  try {

    const res = await callBackend(
      "ocrLibrettoDaFile",
      [TEMP_LIBRETTO_ID]
    );

    console.log("RISPOSTA OCR:", res);

    if (!res?.ok) {

      if (res.error === "VEICOLO_ESISTENTE") {
        showAlert("⚠️ Veicolo già presente nel sistema.");
        return;
      }
    
      throw new Error(res.error);
    }

    const dati = res.datiOCR;

    // 🔥 CONTROLLO TARGA ESISTENTE
    if (dati?.targa) {

      const check = await callBackend(
        "checkTargaEsistente",
        [dati.targa]
      );

      if (check === true) {

        stopLoading("loadingOCR");

        showAlert("⚠️ Veicolo già esistente nel sistema.");

        // opzionale: carica dati esistenti invece di quelli OCR
        cercaVeicoloConTarga(dati.targa);

        return; // ❌ blocca popolamento nuovo
      }
    }

    // ✔️ solo se NON esiste
    popolaFormOCR(dati);

    stopLoading("loadingOCR");

  } catch(err) {

    console.error(err);
    showAlert("Errore OCR");
    stopLoading("loadingOCR");
  }
}

/********************
 * SALVATAGGIO
 ********************/
function salva() {

  console.log("TEMP_LIBRETTO_ID:", TEMP_LIBRETTO_ID);
  console.log("TEMP_TARGA_ID:", TEMP_TARGA_ID);

  // ⚠️ controllo documenti come ora
  if (!clienteEsistente && (!TEMP_LIBRETTO_ID || !TEMP_TARGA_ID)) {

    showConfirm(
      "⚠️ Non hai caricato libretto o targa.\n\n" +
      "È consigliato inserirli per completezza del profilo.\n\n" +
      "Vuoi continuare comunque?",
      conferma => {

        if (!conferma) return;

        apriPopupCliente();

      }
    );

    return;
  }

  // ✅ se documenti ok → popup cliente
  apriPopupCliente();

}

function apriPopupCliente(){

  document.getElementById("popupCliente").classList.remove("hidden");

  document.getElementById("ricercaClientePopup").value = "";

  initFiltroClientiPopup();   // 🔥 QUI

  caricaClientiPopup();

}

function chiudiPopupRicerca(){
  document
    .getElementById("popupRicercaCliente")
    .classList.add("hidden");
}

function chiudiPopupCliente(){

  document.getElementById("popupCliente").classList.add("hidden");

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

function initFiltroClientiPopup(){

  const input = document.getElementById("ricercaClientePopup");

  if(!input) return;

  input.addEventListener("input", function(){

    const q = this.value.toLowerCase().trim();

    const filtrati = CLIENTI_CACHE.filter(c =>
      c.nome.toLowerCase().includes(q)
    );

    renderListaClienti(filtrati);

  });

}

function caricaClientiPopup(){

  if(CLIENTI_CACHE.length > 0){
    renderListaClienti(CLIENTI_CACHE);
    return;
  }

  callBackend("listaClientiCompleta", [])
    .then(lista => {

      CLIENTI_CACHE = lista;
      renderListaClienti(lista);

    });

}

function renderListaClienti(lista){

  const box = document.getElementById("listaClientiPopup");
  box.innerHTML = "";

  lista.forEach(c => {

    const div = document.createElement("div");
    div.className = "cliente-riga-popup";

    div.innerHTML = `
      <strong>${c.nome}</strong><br>
      ${c.indirizzo || "-"}<br>
      <span style="color:#666;font-size:13px">
        ${c.targhe.join(", ") || "NESSUN VEICOLO"}
      </span>
    `;

    div.onclick = () => selezionaClientePopup(c.id);

    box.appendChild(div);

  });

}

function raccogliDatiCliente(){

  return {

    nomeCliente: document.getElementById("nome").value.trim(),
    indirizzo: document.getElementById("indirizzo").value.trim(),
    telefono: document.getElementById("telefono").value.trim(),
    dataNascita: document.getElementById("data").value.trim(),
    codiceFiscale: document.getElementById("cf").value.trim(),

    veicolo: document.getElementById("veicolo").value.trim(),
    motore: document.getElementById("motore").value.trim(),
    targa: document.getElementById("targa").value.trim(),
    immatricolazione: document.getElementById("immatricolazione").value.trim(),
    revisione: document.getElementById("revisioneInput")?.dataset.raw || "",

    tempLibrettoId: TEMP_LIBRETTO_ID,
    tempTargaId: TEMP_TARGA_ID,
    altriDocumenti: TEMP_ALTRI_DOCUMENTI

  };

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
          showAlert("⚠️ Veicolo già presente nel gestionale");
          return;
        }

        showAlert("Errore salvataggio: " + res.error);
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

  mostraLoadingRicerca();   // 🔥 QUI

  callBackend("cercaVeicolo_PROXY", [targa])
  .then(res => {

    if(!res || !res.veicolo){
      showAlert("Veicolo non trovato");
      return;
    }

    const c = res.cliente || {};
    const v = res.veicolo || {};

    document.getElementById("nome").value = c.nome || "";
    document.getElementById("indirizzo").value = c.indirizzo || "";
    document.getElementById("telefono").value = c.telefono || "";
    document.getElementById("data").value = c.dataNascita || "";
    document.getElementById("cf").value = c.codiceFiscale || "";

    document.getElementById("veicolo").value = v.veicolo || "";
    document.getElementById("motore").value = v.motore || "";
    document.getElementById("targa").value = v.targa || "";
    document.getElementById("immatricolazione").value = v.immatricolazione || "";

    clienteEsistente = true;
    nascondiLoadingRicerca();

  })
  .catch(err=>{
    nascondiLoadingRicerca();
    showAlert("Errore caricamento cliente");
  });
}

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

  document.addEventListener("input", function(e){

    // solo se siamo nella sezione CLIENTI
    const clientiSection = document.getElementById("clienti");
    if (!clientiSection) return;
  
    if (clientiSection.contains(e.target) && e.target.tagName === "INPUT") {
      e.target.value = e.target.value.toUpperCase();
    }
  
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
  document.getElementById("btnMic")?.addEventListener("click", () => {
    modalitaAssistente = "vocale";

    sbloccaAudio();       // 🔥 FONDAMENTALE
    bipMicrofono();       // feedback
    avviaMicrofono();     // mic reale
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

  valoriEsistenti: {}
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

    console.error("Errore upload targa:", err);

    showAlert("Errore upload targa");

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

    console.error("Errore upload altri documenti:", err);
    showAlert("Errore upload documenti: " + err.message);

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

  try{

    const file = e.target.files[0];
    if (!file) return;

    console.log("Upload libretto avviato...");

    const base64 = await fileToBase64(file);

    const form = new FormData();

    form.append("action", "uploadTempFile");
    form.append("base64", base64);
    form.append("nomeFile", file.name);
    form.append("mimeType", file.type);

    const res = await fetch(API_URL, {

      method: "POST",
      body: form

    });

    const json = await res.json();

    if (!json.ok)
      throw new Error(json.error);

    TEMP_LIBRETTO_ID = json.fileId;

    console.log("Upload Drive OK:", TEMP_LIBRETTO_ID);

    stopLoading("loadingLibretto");

  }
  catch(err){

    console.error(err);
    showAlert("Errore upload libretto");

    stopLoading("loadingLibretto");

  }

}

function resetClienti() {

  console.log("Reset clienti...");

  // reset variabili globali
  clienteEsistente = false;
  TEMP_LIBRETTO_ID = null;
  TEMP_TARGA_ID = null;

  // reset tutti gli input
  document
    .querySelectorAll("#clienti input")
    .forEach(input => {
      input.value = "";
    });

  // nascondi preview libretto
  const librettoLink = document.getElementById("librettoLink");
  if (librettoLink) {
    librettoLink.style.display = "none";
    librettoLink.href = "#";
  }

  // nascondi preview targa
  const targaLink = document.getElementById("targaLink");
  if (targaLink) {
    targaLink.style.display = "none";
    targaLink.href = "#";
  }

  // reset contatore documenti
  const altriCount = document.getElementById("altriCount");
  if (altriCount) {
    altriCount.textContent = "";
  }

  // nascondi cartella cliente
  const btnCartella = document.getElementById("btnCartellaCliente");
  if (btnCartella) {
    btnCartella.style.display = "none";
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
    
      if (!autoOpenSection) {
        checkNotificheHome();
      }
    
    break;

    case "ordini":
      if (!autoOpenSection) {
        toggleBadgeOrdini(false);
      }
      caricaOrdiniUI();
    break;

    case "schede":

      if (!autoOpenSection) {
        callBackend("getNotificheHome").then(r => {
          if (r?.ultimaScheda) {
            localStorage.setItem(
              "schede_last_seen",
              new Date(r.ultimaScheda).getTime()
            );
          }
        });
    
        toggleBadgeSchede(false);
      }
    
      caricaSchede();
    
    break;

    case "clienti":
      resetClienti?.();
      break;

    case "appuntamenti":
      if (window.innerWidth <= 768) {
        caricaAgendaSettimanale?.();
      }
      break;

    case "revisioni":
      caricaRevisioni(); // o la tua funzione
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
  const t = testo.toUpperCase().trim();

  // 🔒 Se è comando uscita → non interpretare come numero
  if (isComandoUscita(t)) return "";

  // 1️⃣ minuti espliciti
  if (t.includes("MINUTO")) {
    const num = t.replace(/[^\d]/g, "");
    if (!num) return "";
    return (parseInt(num, 10) / 60).toFixed(2);
  }

  // 2️⃣ numeri con cifre
  const cifre = t.replace(/[^\d.,]/g, "");
  if (cifre) {
    return cifre.replace(",", ".");
  }

  // 3️⃣ numeri in lettere (MATCH PAROLA INTERA)
  const oreMap = {
    "UNA": 1,
    "UN": 1,
    "UNO": 1,
    "DUE": 2,
    "TRE": 3,
    "QUATTRO": 4,
    "CINQUE": 5,
    "SEI": 6,
    "SETTE": 7,
    "OTTO": 8,
    "NOVE": 9,
    "DIECI": 10
  };

  for (const k in oreMap) {
    const regex = new RegExp(`\\b${k}\\b`);
    if (regex.test(t)) {
      return String(oreMap[k]);
    }
  }

  return "";
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
      dati: {
        targa: "",
        chilometri: "",
        nomeCliente: "",
        veicolo: "",
        problemi: [],
        lavori: [],
        prodotti: [],
        ore: "",
        note: ""
      }
    });

  document.getElementById("assistenteChat").innerHTML = "";

  setTimeout(scrollAssistenteBottom, 200);

  if (modalitaAssistente === "vocale" && !recognition) {
    initVoce();
  }

  Object.assign(sessioneAssistente, {
    schedaId: null,
    inRipresa: false,
    step: "TARGA",   // 🔥 ORA PARTE DIRETTAMENTE DA QUI
    stepQueue: [],
    listaProblemi: [],
    listaLavori: [],
    listaProdotti: [],
    valoriEsistenti: {},
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

  const input = document.getElementById("assistenteInput");
  input.disabled = false;
  input.focus();

  messaggioBot("Inserisci la targa del veicolo.");

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

    const chat = document.getElementById("assistenteChat");
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
      valoriEsistenti: {}
    });

    callBackend("statoScheda", [id])
      .then(info => {

        const v = info.valori || {};

          sessioneAssistente.dati = {
            targa: v.TARGA || "",
            chilometri: v.CHILOMETRI || "",
            nomeCliente: v.NOME_CLIENTE || "",
            veicolo: v.VEICOLO || "",
            problemi: v.PROBLEMI ? v.PROBLEMI.split("\n").filter(Boolean) : [],
            lavori: v.LAVORI ? v.LAVORI.split("\n").filter(Boolean) : [],
            prodotti: v.PRODOTTI ? v.PRODOTTI.split("\n").filter(Boolean) : [],
            ore: v.ORE_IMPIEGATE || "",
            note: v.NOTE || ""
          };

        messaggioBot(`Stai riprendendo la scheda numero ${info.numero}.`);

        if (Array.isArray(info.mancanti) &&
            info.mancanti.includes("CHILOMETRI")) {
          sessioneAssistente.stepQueue.push("CHILOMETRI");
        }

        sessioneAssistente.stepQueue.push(
          "PROBLEMI",
          "LAVORI",
          "PRODOTTI",
          "ORE_IMPIEGATE",
          "NOTE",
          "CHIUSURA"
        );

        sessioneAssistente.valoriEsistenti = info.valori || {};

        document
          .getElementById("statoSchedaBox")
          ?.classList.remove("hidden");

        renderStatoScheda(info);

        rispostaInElaborazione = false;
        prossimaDomanda();

      })
      .catch(err => {
        console.error("Errore ripresa scheda", err);
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

  switch (sessioneAssistente.step) {
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
      testo = "Quante ore sono state impiegate?";
      break;
    case "NOTE":
      testo = "Vuoi aggiungere altre note?";
      break;
    case "CHIUSURA":
      testo = "Vuoi chiudere la scheda definitivamente?";
      break;
  }

  // ❌ NON usare più messaggioBot qui
  // ✅ QUESTO è l’unico punto corretto
  faiDomanda(testo);
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

async function gestisciRisposta(testo) {

  if (!sessioneAssistente.dati) {
    sessioneAssistente.dati = sessioneAssistente.dati || {
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

  testo = testo.toUpperCase().trim();

  // 🔥 SALTO DIRETTO ALLA CHIUSURA
  if (isComandoFine(testo)) {

    rispostaInElaborazione = false;

    rispostaConPausa("Ok, passo alla chiusura.", 1200, () => {
      sessioneAssistente.step = "CHIUSURA";
      faiDomanda("Vuoi chiudere definitivamente la scheda?");
    });

    return;
  }

  switch (sessioneAssistente.step) {

    case "assistente":
      // niente preload
    break;

    case "TARGA": {

      const targaNorm = normalizzaTarga(testo);
    
      if (!targaNorm) {
        rispostaInElaborazione = false;
        messaggioBot("Targa non valida. Ripeti.");
        return;
      }
    
      let veicolo = CLIENTI_VEICOLI_CACHE?.find(
        v => v.targa === targaNorm
      );
    
      if (!veicolo) {
        try {
          veicolo = await callBackend(
            "checkTargaEsistenteFull",
            [targaNorm]
          );
        } catch (e) {}
      }
    
      if (!veicolo) {
        rispostaInElaborazione = false;
        messaggioBot("Veicolo non trovato. Ripeti la targa.");
        return;
      }
    
      // 🔥 CREA SCHEDA SOLO ORA
      const crea = await callBackend("creaNuovaScheda");

      sessioneAssistente.dati.targa = targaNorm;
      sessioneAssistente.dati.nomeCliente = veicolo.nomeCliente;
      sessioneAssistente.dati.veicolo = veicolo.veicolo;
    
      sessioneAssistente.schedaId = crea.docId;
    
      sessioneAssistente.dati = {
        targa: targaNorm,
        nomeCliente: veicolo.nomeCliente,
        veicolo: veicolo.veicolo,
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
    
      rispostaInElaborazione = false;
    
      messaggioBot(`Scheda #${crea.numeroScheda} creata.`);
    
      prossimaDomanda();
    
      return;
    }
      
    case "CHILOMETRI": {

      const km = normalizzaChilometri(testo);

      if (!km) {
        rispostaInElaborazione = false;
        messaggioBot("Non ho capito i chilometri. Ripeti.");
        return;
      }

      sessioneAssistente.dati.chilometri = km + " km";

      rispostaInElaborazione = false;

      rispostaConPausa(`Chilometri registrati: ${km}`, 1200, () => {
        prossimaDomanda();
      });

      return;
    }

    case "PROBLEMI": {

      if (isComandoUscita(testo)) {

        rispostaInElaborazione = false;
      
        rispostaConPausa("Perfetto.", 1200, () => {
          prossimaDomanda();
        });
      
        return;
      }

      sessioneAssistente.dati.problemi =
        sessioneAssistente.dati.problemi || [];

      sessioneAssistente.dati.problemi.push(testo);

      rispostaInElaborazione = false;

      rispostaConPausa("Ok. Altro problema?", 1200, () => {
        if (modalitaAssistente === "vocale") {
          bipMicrofono();
          recognition.start();
        }
      });

      return;
    }

    case "LAVORI": {

      if (isComandoUscita(testo)) {

        rispostaInElaborazione = false;
      
        rispostaConPausa("Perfetto.", 1200, () => {
          prossimaDomanda();
        });
      
        return;
      }

      sessioneAssistente.dati.lavori =
        sessioneAssistente.dati.lavori || [];

      sessioneAssistente.dati.lavori.push(testo);

      rispostaInElaborazione = false;

      rispostaConPausa("Ok. Altro lavoro?", 1200, () => {
        if (modalitaAssistente === "vocale") {
          bipMicrofono();
          recognition.start();
        }
      });

      return;
    }

    case "PRODOTTI": {

      if (isComandoUscita(testo)) {

        rispostaInElaborazione = false;
      
        rispostaConPausa("Perfetto.", 1200, () => {
          prossimaDomanda();
        });
      
        return;
      }

      sessioneAssistente.dati.prodotti =
        sessioneAssistente.dati.prodotti || [];

      sessioneAssistente.dati.prodotti.push(testo);

      rispostaInElaborazione = false;

      rispostaConPausa("Ok. Altro prodotto?", 1200, () => {
        if (modalitaAssistente === "vocale") {
          bipMicrofono();
          recognition.start();
        }
      });

      return;
    }

    case "ORE_IMPIEGATE": {

      const oreNum = normalizzaOre(testo);

      if (!oreNum) {
        rispostaInElaborazione = false;
        messaggioBot("Non ho capito le ore.");
        return;
      }

      sessioneAssistente.dati.ore = oreNum + " h";

      rispostaInElaborazione = false;

      rispostaConPausa(`Ore registrate: ${oreNum}`, 1200, () => {
        prossimaDomanda();
      });

      return;
    }

    case "NOTE": {

      if (!isComandoUscita(testo)) {
        sessioneAssistente.dati.note = testo;
      }

      rispostaInElaborazione = false;

      rispostaConPausa("Perfetto.", 1200, () => {
        prossimaDomanda();
      });

      return;
    }

    case "CHIUSURA": {

      try { recognition?.stop(); } catch (e) {}

      const risposta = testo.toUpperCase().trim();

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

      rispostaConPausa("Salvataggio in corso...", 800);

      try {

        await callBackend(
          "salvaSchedaCompleta",
          [sessioneAssistente.schedaId, sessioneAssistente.dati]
        );

        if (positivo && !negativo) {

          await callBackend(
            "chiudiScheda",
            [sessioneAssistente.schedaId]
          );

          rispostaConPausa("Scheda chiusa correttamente.", 1000);

        } else {

          rispostaConPausa("Scheda salvata.", 1000);

        }

        setTimeout(() => {
          resetModalitaAssistente();
          showSection("home");
          caricaSchede(true);
        }, 1800);

      } catch (err) {

        console.error(err);
        messaggioBot("Errore durante il salvataggio.");

      }

      return;
    }
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

  // 🔥 1️⃣ Se ho cache → mostro subito
  if (CACHE_ORDINI) {
    renderOrdini(
      CACHE_ORDINI.ordini || [],
      CACHE_ORDINI.clienti || [],
      CACHE_ORDINI.veicoli || [],
      CACHE_ORDINI.fornitori || []
    );
  }

  // 🔥 2️⃣ Se cache valida → STOP
  if (
    !force &&
    CACHE_ORDINI &&
    now - CACHE_TS < CACHE_TTL
  ) {
    return;
  }

  // 🔥 3️⃣ Aggiornamento backend in background
  callBackend("getOrdiniBundle")
    .then(res => {

      const ordini = res?.ordini || [];
      const clienti = res?.clienti || [];
      const veicoli = res?.veicoli || [];
      const fornitori = res?.fornitori || [];

      CACHE_ORDINI = { ordini, clienti, veicoli, fornitori };
      CACHE_TS = Date.now();

      VEICOLI_ALL = veicoli;

      renderOrdini(ordini, clienti, veicoli, fornitori);

    })
    .catch(err => {
      console.error("Errore caricamento ordini", err);
      showAlert("Errore caricamento ordini");
    });

}

function renderOrdini(ordini, clienti, veicoli, fornitori) {

  const container = document.getElementById("listaOrdini");
  const fragment = document.createDocumentFragment();

  // 🔥 ordina: non completati sopra, completati sotto
  const lista = [...ordini].sort((a, b) => {

    if (a.check && !b.check) return 1;
    if (!a.check && b.check) return -1;

    return b.row - a.row; // nuovi sopra

  });

  lista.forEach(o => {

    const row = document.createElement("div");
    row.className = "ordine-row";

    row.innerHTML = `

  <div class="ordine-top">

    <input type="checkbox"
      class="ordine-check"
      ${o.check ? "checked" : ""}
      onchange="onToggleCheckbox(${o.row}, this.checked)">

    <div class="ordine-title"
         onclick="editDescrizione(this, ${o.row})">
      ${o.descrizione || "Scrivi descrizione ordine…"}
    </div>

    <div class="ordine-menu">
      <button class="ordine-menu-btn"
              onclick="toggleMenu(this)">
        ⋮
      </button>

      <div class="ordine-menu-popup">
        <button class="ordine-delete"
                onclick="eliminaOrdine(${o.row})">
          Elimina
        </button>
      </div>
    </div>

  </div>

  <div class="ordine-body">

    <select class="ordine-select"
      onchange="onChangeCliente(${o.row}, this.value)">
      <option value="" disabled ${o.cliente ? "" : "selected"}>Cliente</option>
      ${clienti.map(c => `
        <option value="${c}" ${c === o.cliente ? "selected" : ""}>${c}</option>
      `).join("")}
    </select>

    ${renderSelectVeicolo(o.row, o.veicolo, o.cliente, veicoli)}

    ${fornitoreHtml(o, fornitori)}

    <button class="ordine-invia"
            onclick="inviaOrdine(${o.row}, this)">
      INVIA
    </button>

  </div>
`;
    fragment.appendChild(row);

  });

  container.innerHTML = "";
  container.appendChild(fragment);

}

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
      console.error("Errore aggiornamento cliente:", err);
      showAlert("Errore nel salvataggio del cliente");
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
      console.error("Errore aggiornamento veicolo:", err);
      showAlert("Errore nel salvataggio del veicolo");
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
      console.error("Errore aggiornamento fornitore:", err);
      showAlert("Errore salvataggio fornitore");
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
      console.error(err);
      btn.classList.remove("loading");
      btn.textContent = "INVIA";
      showAlert("Errore invio ordine");
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
  const ordineRow = [...document.querySelectorAll(".ordine-row")]
    .find(r => r.innerHTML.includes(`onChangeCliente(${row}`));

  if (!ordineRow) return;

  const selectVeicolo = ordineRow.querySelector(
    'select[onchange^="onChangeVeicolo"]'
  );

  if (!selectVeicolo) return;

  const lista = cliente
    ? VEICOLI_ALL.filter(v => v.clienteNome === cliente)
    : VEICOLI_ALL;

  selectVeicolo.innerHTML = `
    <option value="" disabled selected>Seleziona veicolo</option>
    ${lista.map(v =>
      `<option value="${v.veicolo}">${v.veicolo}</option>`
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
    showAlert("Il riconoscimento vocale non è supportato da questo browser");
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
        console.error("Errore inserimento ordine vocale", err);
        showAlert("Errore inserimento ordine vocale");
      });
  };

  recognitionOrdine.onerror = e => {
  toggleMicIndicator(false);
  if (e.error === "no-speech") return;
  if (e.error === "aborted") return;
  if (e.error === "network") return;
  console.error("Errore microfono ordine", e);
  showAlert("Errore microfono");
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

  const box = document.getElementById("oggiEventi");
  const toggleBtn = document.getElementById("toggleOggi");

  if (!box) return;

  callBackend("getAppuntamentiOggi")
    .then(res => {

      const eventi = Array.isArray(res)
        ? res
        : res?.data || [];

      // 🔴 NESSUN APPUNTAMENTO
      if (!eventi.length) {

        box.innerHTML = `
          <div class="no-eventi">
            Nessun appuntamento oggi
          </div>
        `;

        box.style.maxHeight = "none";
        box.style.overflow = "visible";

        if (toggleBtn) toggleBtn.style.display = "none";

        return;
      }

      // 🟢 CI SONO EVENTI
      box.innerHTML = eventi.map(e => `
        <div class="evento-oggi">
          <strong>${e.ora}</strong> – ${e.titolo}
        </div>
      `).join("");

      const eventElements = box.querySelectorAll(".evento-oggi");

      // Se <= 5 → mostra tutto
      if (eventElements.length <= 5) {

        box.style.maxHeight = "none";
        box.style.overflow = "visible";

        if (toggleBtn) toggleBtn.style.display = "none";

        return;
      }

      // 🔵 Se > 5 → mostra solo 5 inizialmente
      const firstFiveHeight =
        Array.from(eventElements)
          .slice(0, 5)
          .reduce((acc, el) => acc + el.offsetHeight, 0);

      box.style.overflow = "hidden";
      box.style.transition = "max-height 0.3s ease";
      box.style.maxHeight = firstFiveHeight + "px";

      if (toggleBtn) {
        toggleBtn.style.display = "inline-block";
        toggleBtn.textContent = "▼";

        toggleBtn.onclick = function () {

          const expanded =
            box.style.maxHeight !== firstFiveHeight + "px";

          if (expanded) {
            box.style.maxHeight = firstFiveHeight + "px";
            toggleBtn.textContent = "▼";
          } else {
            box.style.maxHeight = box.scrollHeight + "px";
            toggleBtn.textContent = "▲";
          }

        };
      }

    })
    .catch(err => {

      console.error("Errore appuntamenti", err);

      box.innerHTML = `
        <div class="no-eventi">
          Nessun appuntamento oggi
        </div>
      `;

      if (toggleBtn) toggleBtn.style.display = "none";
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
    showAlert("Input libretto non trovato");
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

        console.error("Errore eliminazione:", err);

        cacheSchede = backupCache;
        renderSchede(cacheSchede);

        showAlert("Errore eliminazione scheda");

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

if(!conferma) return;

if (!CACHE_ORDINI || !CACHE_ORDINI.ordini) return;

const backup = [...CACHE_ORDINI.ordini];

CACHE_ORDINI.ordini =
CACHE_ORDINI.ordini.filter(o => o.row !== row);

renderOrdini(
CACHE_ORDINI.ordini,
CACHE_ORDINI.clienti,
CACHE_ORDINI.veicoli,
CACHE_ORDINI.fornitori
);

callBackend("eliminaOrdine", [row])
.then(() => {
console.log("Ordine eliminato");
})
.catch(err => {

console.error(err);

CACHE_ORDINI.ordini = backup;

renderOrdini(
CACHE_ORDINI.ordini,
CACHE_ORDINI.clienti,
CACHE_ORDINI.veicoli,
CACHE_ORDINI.fornitori
);

showAlert("Errore eliminazione ordine");

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

async function caricaAgendaSettimanale() {
 const container = document.getElementById("agendaSettimanale");
 if (!container) return;
container.classList.remove("hidden");
container.innerHTML = "Caricamento...";
  if (!container) return;
  container.innerHTML = "Caricamento...";
  try {
    const data = await callBackend("getAppuntamentiSettimana");
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
        eventDiv.innerHTML =
          `<span class="agenda-ora">${ev.ora}</span> ${ev.titolo}`;
        dayDiv.appendChild(eventDiv);
      });
      container.appendChild(dayDiv);
    });

  } catch (err) {
    console.error("Errore settimana:", err);
    container.innerHTML = "<p>Errore caricamento appuntamenti</p>";
  }
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

document.addEventListener("DOMContentLoaded", ()=>{
  verificaBackend();
});

// ==========================
// 🔥 FIREBASE INIT
// ==========================

const firebaseConfig = {
  apiKey: "AIzaSyC4OPs05sPxSb5H6LQSwV9b4-bMrGfMYjY",
  authDomain: "goldencar-notifiche.firebaseapp.com",
  projectId: "goldencar-notifiche",
  storageBucket: "goldencar-notifiche.firebasestorage.app",
  messagingSenderId: "932662604015",
  appId: "1:932662604015:web:2d3a38bcbdd9c12253ab1a"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// ==========================
// 🔔 REGISTRA DISPOSITIVO
// ==========================

async function initPush() {

  try {

    // 1️⃣ permesso notifiche
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("Notifiche non autorizzate");
      return;
    }

    // 2️⃣ service worker
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    // 3️⃣ ottieni token
    const token = await messaging.getToken({
      vapidKey: "BOSe3OL0HEzLB6vtcwGcTWh8YqQGFLIFFgHiURlMzKyHJ4hlZrfyo1qL5554g6ObMzGNRWgAvkmjabzvRXdgVDk",
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.warn("Nessun token ottenuto");
      return;
    }

    console.log("🔥 TOKEN:", token);

    // 4️⃣ salva nel backend
    await fetch(API_URL, {
      method: "POST",
      body: new URLSearchParams({
        action: "salvaPushToken",
        token: token
      })
    });

  } catch (err) {
    console.error("Errore push:", err);
  }

}

// avvio automatico
initPush();
