const API_URL = "https://script.google.com/macros/s/AKfycbzmS8CgLOU0utCQqpAz1uGHHAOeuFPlBGFznoCVpmHHeujQKoT8LGJJhojlVzziUx4s/exec";

function callBackend(action, args = []) {

  const params = new URLSearchParams({
    action,
    args: JSON.stringify(args)
  });

  return fetch(`${API_URL}?${params}`)
    .then(res => res.json())
    .then(data => {

      if (data?.error) {
        throw new Error(data.error);
      }
let cartellaUrl = "";
      return data;
    });
}

function callBackendPost(action, payload = {}) {

  return fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      ...payload   // 👈 permette payload oggetto diretto
    })
  })
  .then(async res => {

    if (!res.ok) {
      throw new Error("Errore rete / CORS");
    }

    const data = await res.json();

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;

  })
  .catch(err => {
    console.error("BACKEND ERROR:", err);
    throw err;
  });
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
const CACHE_TTL = 60 * 1000; // 60 secondi
let librettoLink;
let targaLink;
let btnCartellaCliente;
let clienteEsistente = false;
let assistenteInChiusura = false;
let rispostaInElaborazione = false;

function analizza() {
  const fileLibretto = getFileFromInputs(
    "librettoGallery",
    "librettoCamera"
  );

  if (!fileLibretto) {
    alert("Seleziona o fotografa il libretto");
    return;
  }

  const statoEl = document.getElementById("stato");
  if (statoEl) statoEl.textContent = "Analisi in corso...";

  const reader = new FileReader();

  reader.onload = e => {

    try {

      const base64 = e.target.result.split(",")[1];
      if (!base64) {
        alert("Errore lettura immagine");
        return;
      }
      
      callBackendPost("ocrLibretto", {
        base64,
        nomeFile: "libretto.jpg"
      });

        .then(res => {

          console.log("RISPOSTA OCR COMPLETA:", res);
        
          const dati = res?.datiOCR || {};
          console.log("DATI OCR:", dati);
        
          document.getElementById("nome").value = dati.nomeCliente || "";
          document.getElementById("indirizzo").value = dati.indirizzo || "";
          document.getElementById("telefono").value = "";
          document.getElementById("data").value = dati.dataNascita || "";
          document.getElementById("cf").value = dati.codiceFiscale || "";
        
          document.getElementById("veicolo").value = dati.veicolo || "";
          document.getElementById("motore").value = dati.motore || "";
          document.getElementById("targa").value = dati.targa || "";
          document.getElementById("immatricolazione").value =
            dati.immatricolazione || "";
        
          if (statoEl) statoEl.textContent = "Dati caricati";
        })

        .catch(err => {

          console.error("Errore OCR:", err);

          if (statoEl) statoEl.textContent = "Errore OCR";
        });

    } catch (err) {

      console.error("Errore lettura base64:", err);

      if (statoEl) statoEl.textContent = "Errore lettura file";
    }
  };

  reader.onerror = () => {
    if (statoEl) statoEl.textContent = "Errore lettura file";
  };

  reader.readAsDataURL(fileLibretto);
}

/********************
 * SALVATAGGIO
 ********************/
function salva() {

  const fileLibretto = getFileFromInputs(
    "librettoGallery",
    "librettoCamera"
  );

  const fileTarga = getFileFromInputs(
    "targaGallery",
    "targaCamera"
  );

  // se NON hai file → salva comunque (cliente esistente)
  if (!fileLibretto && !fileTarga) {
    inviaSalvataggio("", "");
    return;
  }

  const readerLibretto = new FileReader();

  readerLibretto.onload = e => {

    const base64Libretto = e.target.result.split(",")[1];

    if (!fileTarga) {
      inviaSalvataggio(base64Libretto, "");
      return;
    }

    const readerTarga = new FileReader();

    readerTarga.onload = e2 => {

      const base64Targa = e2.target.result.split(",")[1];
      inviaSalvataggio(base64Libretto, base64Targa);

    };

    readerTarga.readAsDataURL(fileTarga);

  };

  if (fileLibretto) {
    readerLibretto.readAsDataURL(fileLibretto);
  } else {
    inviaSalvataggio("", "");
  }
}

/********************
 * ALTRI DOCUMENTI
 ********************/
function leggiAltriDocumenti(callback) {
  const input = document.getElementById("altriDocumenti");
  if (!input || !input.files || input.files.length === 0) {
    callback([]);
    return;
  }

  const files = [];
  let i = 0;

  const next = () => {
    if (i >= input.files.length) {
      callback(files);
      return;
    }

    const f = input.files[i];
    const r = new FileReader();
    r.onload = e => {
      files.push({
        nome: f.name,
        base64: e.target.result.split(",")[1],
        mimeType: f.type
      });
      i++;
      next();
    };
    r.readAsDataURL(f);
  };

  next();
}

/********************
 * INVIO BACKEND
 ********************/
function inviaSalvataggio(base64Libretto, base64Targa) {
  leggiAltriDocumenti(altriFiles => {

    const dati = {
      nomeCliente: document.getElementById("nome").value,
      indirizzo: document.getElementById("indirizzo").value,
      telefono: document.getElementById("telefono").value,
      dataNascita: document.getElementById("data").value,
      codiceFiscale: document.getElementById("cf").value,

      veicolo: document.getElementById("veicolo").value,
      motore: document.getElementById("motore").value,
      targa: document.getElementById("targa").value,
      immatricolazione: document.getElementById("immatricolazione").value,

      librettoBase64: base64Libretto,
      targaBase64: base64Targa,
      altriDocumenti: altriFiles
    };

    callBackendPost("salvaClienteEVeicolo", {
      dati
    });
      .catch(err => {
        alert(err?.message || "Errore nel salvataggio");
      });

  });
}

/********************
 * RICERCA VEICOLO
 ********************/
function cercaVeicolo() {

  const inputTarga = document.getElementById("ricercaTarga");
  const esito = document.getElementById("esitoRicerca");

  const targaRicerca = inputTarga.value.trim().toUpperCase();

  if (!targaRicerca) {
    esito.textContent = "Inserisci una targa";
    return;
  }

  esito.textContent = "Ricerca in corso...";

  callBackend("cercaVeicolo_PROXY", [targaRicerca])

    .then(res => {

      console.log("RISPOSTA BACKEND:", res);

      if (!res || !res.veicolo) {
        esito.textContent = "Veicolo non trovato";
        return;
      }

      const c = res.cliente || {};
      const v = res.veicolo || {};

      // ======================
      // DATI CLIENTE
      // ======================
      document.getElementById("nome").value = c.nome || "";
      document.getElementById("indirizzo").value = c.indirizzo || "";
      document.getElementById("telefono").value = c.telefono || "";
      document.getElementById("data").value = c.dataNascita || "";
      document.getElementById("cf").value = c.codiceFiscale || "";

      // ======================
      // DATI VEICOLO
      // ======================
      document.getElementById("veicolo").value = v.veicolo || "";
      document.getElementById("motore").value = v.motore || "";
      document.getElementById("targa").value = v.targa || "";
      document.getElementById("immatricolazione").value = v.immatricolazione || "";

      esito.textContent = "Veicolo trovato";

      // ======================
      // CARTELLA CLIENTE
      // ======================
      const btnCartellaCliente = document.getElementById("btnCartellaCliente");

      if (res.cartellaClienteUrl) {
      
        btnCartellaCliente.style.display = "";   // 🔥 sblocca inline style
        btnCartellaCliente.classList.remove("hidden");
      
        btnCartellaCliente.onclick = () => {
          window.open(res.cartellaClienteUrl, "_blank");
        };
      
      } else {
      
        btnCartellaCliente.style.display = "none"; // 🔥 nasconde davvero
        btnCartellaCliente.classList.add("hidden");
      
      }

      clienteEsistente = true;

    })

    .catch(err => {

      console.error(err);
      esito.textContent = "Errore ricerca";

    });
}
/********************
 * CONTATORE FILE (X file)
 ********************/
function bindFileCount(inputId, countId, linkId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(countId);
  const link = document.getElementById(linkId);

  if (!input) return;

  input.addEventListener("change", () => {
    const n = input.files ? input.files.length : 0;

    // 🔹 SOLO "Altri documenti" mostra il numero file
    if (countId === "altriCount") {
      label.textContent = n > 0 ? n + " file" : "";
      label.classList.toggle("ok", n > 0);
    } else if (label) {
      // ❌ libretto e targa: niente contatore
      label.textContent = "";
    }

    // 🔹 libretto / targa: mostra solo "Visualizza"
    if (link && n > 0) {
      const file = input.files[0];
      link.href = URL.createObjectURL(file);
      link.textContent = "Visualizza";
      link.style.display = "inline-block";
    } else if (link) {
      link.style.display = "none";
      link.href = "#";
    }
  });
}

/********************
 * INIT
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  librettoLink = document.getElementById("librettoLink");
  targaLink = document.getElementById("targaLink");
  btnCartellaCliente = document.getElementById("btnCartellaCliente");

  if (librettoLink) librettoLink.style.display = "none";
  if (targaLink) targaLink.style.display = "none";
  if (btnCartellaCliente) btnCartellaCliente.style.display = "none";

  document.getElementById("btnAnalizza")?.addEventListener("click", analizza);
  document.getElementById("btnSalva")?.addEventListener("click", salva);
  document.getElementById("btnCerca")?.addEventListener("click", cercaVeicolo);
  document
  .getElementById("btnRefreshClienti")
  ?.addEventListener("click", resetSezioneClienti);
  
  librettoGallery.addEventListener("change", e => {

  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);

  const btnView = document.getElementById("librettoLink");
  btnView.classList.remove("hidden");

  btnView.onclick = () => window.open(url);

});
  targaGallery.addEventListener("change", e => {

  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);

  const btnView = document.getElementById("targaLink");
  btnView.classList.remove("hidden");

  btnView.onclick = () => window.open(url);

});
  altriDocumenti.addEventListener("change", e => {

  const count = e.target.files.length;

  const label = document.getElementById("altriCount");

  label.textContent =
    count > 0 ? `${count} file caricati` : "";

});



  bindFileCount("librettoGallery", "librettoCount", "librettoLink");
  bindFileCount("librettoCamera", "librettoCount", "librettoLink");

  bindFileCount("targaGallery", "targaCount", "targaLink");
  bindFileCount("targaCamera", "targaCount", "targaLink");

  bindFileCount("altriDocumenti", "altriCount");

  caricaSchede();
  preloadOrdini();

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

  showSection("home");
});

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

function resetClienti() {
  // 🔹 svuota tutti gli input testuali
  document
    .querySelectorAll("#clienti input:not([type='file'])")
    .forEach(i => (i.value = ""));

  // 🔹 reset input file
  ["libretto", "fotoTarga", "altriDocumenti"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });

  // 🔹 reset contatori file
  ["librettoCount", "targaCount", "altriCount"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  // 🔹 nascondi link Visualizza
  ["librettoLink", "targaLink"].forEach(id => {
    const link = document.getElementById(id);
    if (link) {
      link.style.display = "none";
      link.href = "#";
    }
  });

  // 🔹 nascondi pulsante File cliente
  const btnCartella = document.getElementById("btnCartellaCliente");
  if (btnCartella) btnCartella.style.display = "none";

  // 🔹 reset messaggi stato
  const esito = document.getElementById("esitoRicerca");
  if (esito) esito.textContent = "";

  const stato = document.getElementById("stato");
  if (stato) stato.textContent = "";

  clienteEsistente = false;

}

function messaggioBot(testo) {
  const chat = document.getElementById("assistenteChat");
  const div = document.createElement("div");
  div.className = "msg bot";
  div.textContent = testo;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  // ⛔️ TOGLI COMPLETAMENTE LA VOCE DA QUI
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
  messaggioBot(testo); // chat

  if (modalitaAssistente !== "vocale") return;

  sbloccaAudio();          // 🔓 fondamentale su desktop
  speechSynthesis.cancel();
  botStaParlando = true;

  const utter = new SpeechSynthesisUtterance(testo);
  utter.lang = "it-IT";

  utter.onend = () => {
    botStaParlando = false;

    setTimeout(() => {
      bipMicrofono();
      try {
        recognition.start();   // 🎤 QUI, NON ALTROVE
        console.log("🎤 ascolto per:", sessioneAssistente.step);
      } catch (e) {
        console.warn("Mic già attivo");
      }
    }, 500); // tempo umano
  };

  speechSynthesis.speak(utter);
}

function messaggioUtente(testo) {
  const chat = document.getElementById("assistenteChat");
  if (!chat) return;

  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = testo;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showSection(id) {
  console.log("➡️ showSection:", id);

  // nascondi tutte le pagine
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  // mostra pagina richiesta
  const page = document.getElementById(id);
  if (page) page.classList.add("active");

  // menu desktop + drawer
  document.querySelectorAll(".menu button, .mobile-drawer button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === id);
  });

  // INIT SEZIONI
  switch (id) {
    case "home":
      if (typeof caricaAppuntamentiOggi === "function") {
        caricaAppuntamentiOggi();
      }
      break;

    case "ordini":
      if (typeof caricaOrdiniUI === "function") {
        caricaOrdiniUI();
      }
      break;

    case "schede":
      if (typeof caricaSchede === "function") {
        caricaSchede();
      }
      break;

    case "clienti":
      if (typeof resetClienti === "function") {
        resetClienti();
      }
      break;
  }
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
  const t = testo.toUpperCase();

  // 1️⃣ minuti espliciti → conversione in ore
  if (t.includes("MINUTO")) {
    const num = t.replace(/[^\d]/g, "");
    if (!num) return "";
    return (parseInt(num, 10) / 60).toFixed(2);
  }

  // 2️⃣ numeri con virgola o punto → ore dirette
  const cifre = t.replace(/[^\d.,]/g, "");
  if (cifre) {
    return cifre.replace(",", ".");
  }

  // 3️⃣ numeri in lettere
  const oreMap = {
    "UNA": 1, "UN": 1, "UNO": 1,
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

  let ore = null;
  for (const k in oreMap) {
    if (t.includes(k)) {
      ore = oreMap[k];
      break;
    }
  }

  if (ore === null) return "";

  let frazione = 0;
  if (t.includes("MEZZA")) frazione = 0.5;
  else if (t.includes("UN QUARTO")) frazione = 0.25;
  else if (t.includes("TRE QUARTI")) frazione = 0.75;

  return String(ore + frazione);
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
  if (!container) return;
  container.innerHTML = "";

  // 🔽 ultima scheda in alto
  lista.sort((a, b) => b.numero - a.numero);

  lista.forEach(s => {
    const card = document.createElement("div");
    card.className = `scheda-card scheda-${s.status}`;

    let centerHtml = "";

    if (s.status !== "CHIUSA") {
      centerHtml = `
        <button class="secondary riprendi btn-pill" onclick="riprendiScheda('${s.id}')">
          ▶ Riprendi
        </button>
      `;
    } else if (s.linkDoc) {
      centerHtml = `
        <a href="${s.linkDoc}" target="_blank">
          <button class="secondary scheda btn-pill">
            📄 Scheda
          </button>
        </a>
      `;
    }

    card.innerHTML = `
      <div class="scheda-left">
        <div class="scheda-numero">#${s.numero}</div>

        <div class="scheda-info">
          <div class="scheda-cliente">${s.cliente}</div>
          <div class="scheda-meta">${s.data}</div>
        </div>
      </div>

      <div class="scheda-center">
        ${centerHtml}
      </div>

      <div class="scheda-right">
        <span class="scheda-status">${s.status}</span>

        <div class="scheda-menu">
          <button class="scheda-menu-btn" onclick="toggleMenu(this)">⋮</button>

          <div class="scheda-menu-popup">
            <button
              class="scheda-delete"
              onclick="eliminaScheda('${s.id}', '${s.status}', '${s.linkDoc || ""}')"
            >
              Elimina
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function apriAssistente() {

  showSection("assistente");
  document.getElementById("assistenteChat").innerHTML = "";

  if (modalitaAssistente === "vocale" && !recognition) {
    initVoce();
  }

  Object.assign(sessioneAssistente, {
    schedaId: null,
    inRipresa: false,
    step: null,
    stepQueue: [
      "TARGA",
      "CHILOMETRI",
      "PROBLEMI",
      "LAVORI",
      "PRODOTTI",
      "ORE_IMPIEGATE",
      "NOTE",
      "CHIUSURA"
    ],
    listaProblemi: [],
    listaLavori: [],
    listaProdotti: [],
    valoriEsistenti: {}
  });

  const input = document.getElementById("assistenteInput");
  input.disabled = true;

  callBackend("creaNuovaScheda")
    .then(res => {

      if (!res || !res.docId) {
        messaggioBot("Errore creazione scheda.");
        input.disabled = false;
        return;
      }

      sessioneAssistente.schedaId = res.docId;

      input.disabled = false;
      input.focus();

      messaggioBot(`Scheda #${res.numeroScheda} creata.`);

      setTimeout(() => {
        rispostaInElaborazione = false;
        prossimaDomanda();
      }, 600);

    })
    .catch(err => {
      console.error("Errore creaNuovaScheda", err);
      messaggioBot("Errore server.");
      input.disabled = false;
    });
}

function esciAssistente() {
  resetModalitaAssistente();
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
  document.getElementById("assistenteChat").innerHTML = "";

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

      messaggioBot(`Stai riprendendo la scheda numero ${info.numero}.`);

      if (Array.isArray(info.mancanti) && info.mancanti.includes("CHILOMETRI")) {
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

      rispostaInElaborazione = false;
      prossimaDomanda();

    })
    .catch(err => {
      console.error("Errore ripresa scheda", err);
      messaggioBot("Errore nel riprendere la scheda.");
    });
}

let voceBot = null;
let recognition = null;
let ascoltoAttivo = false;
let micTimeout = null;
let micSbloccato = false;
let micPronto = false;
let micTentativi = 0;
let rispostaGestita = false;
let botStaParlando = false;

function initVoce() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "it-IT";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    ascoltoAttivo = true;
    console.log("🎤 ascolto ON");
  };

  recognition.onend = () => {
    ascoltoAttivo = false;
    console.log("🎤 ascolto OFF");
  };

  recognition.onresult = e => {
    if (!e.results[0][0].transcript) return;

    const testo = e.results[0][0].transcript.trim();
    console.log("🗣️ UTENTE:", testo);

    messaggioUtente(testo);
    gestisciRisposta(testo);
  };
}

function pulisciTesto(testo) {
  return testo
    .toLowerCase()
    .replace(/ehm|allora|cioè|dunque/g, "")
    .trim();
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

function gestisciRisposta(testo) {
  if (rispostaInElaborazione) return;
  rispostaInElaborazione = true;

  testo = testo.toUpperCase().trim();

  switch (sessioneAssistente.step) {

    /* ======================
     * TARGA
     * ====================== */
    case "TARGA": {
      const targaNorm = normalizzaTarga(testo);

      faiDomanda(`Targa rilevata: ${targaNorm}`);

      callBackend(
        "completaSchedaDaTarga",
        [sessioneAssistente.schedaId, targaNorm],
        res => {
          if (!res || !res.ok) {
            messaggioBot("Veicolo non trovato. Ripeti la targa.");
            if (modalitaAssistente === "vocale") {
              parlaEDopoAscolta("Veicolo non trovato. Ripeti la targa.");
            }
            rispostaInElaborazione = false;
            return;
          }

          const msg = `Veicolo trovato. Cliente ${res.nomeCliente}.`;
          messaggioBot(msg);
          if (modalitaAssistente === "vocale") parlaEDopoAscolta(msg);

          setTimeout(() => {
            rispostaInElaborazione = false;
            prossimaDomanda(); // ➜ CHILOMETRI
          }, 500);
        },
        () => {
          messaggioBot("Errore ricerca veicolo.");
          rispostaInElaborazione = false;
        }
      );

      return;
    }

    /* ======================
     * CHILOMETRI
     * ====================== */
    case "CHILOMETRI": {
      const km = normalizzaChilometri(testo);

      if (!km) {
        messaggioBot("Non ho capito i chilometri. Ripeti.");
        if (modalitaAssistente === "vocale") {
          parlaEDopoAscolta("Non ho capito i chilometri. Ripeti.");
        }
        rispostaInElaborazione = false;
        return;
      }

      messaggioBot(`Chilometri registrati: ${km}`);
      salvaCampoScheda("CHILOMETRI", km + " km");

      rispostaInElaborazione = false;
      setTimeout(() => prossimaDomanda(), 400);
      return;
    }

    /* ======================
     * PROBLEMI
     * ====================== */
    case "PROBLEMI": {
      const risposta = testo.toUpperCase();

      if (risposta.startsWith("PROBLEMI")) {
        rispostaInElaborazione = false;
        return;
      }

      if (isComandoUscita(risposta)) {
        if (sessioneAssistente.listaProblemi.length) {
          salvaCampoScheda(
            "PROBLEMI",
            "• " + sessioneAssistente.listaProblemi.join("\n• ")
          );
        }
        rispostaInElaborazione = false;
        setTimeout(prossimaDomanda, 400);
        return;
      }

      sessioneAssistente.listaProblemi.push(risposta);
      rispostaInElaborazione = false;
      faiDomanda("Ok. Altro problema?");
      return;
    }

    /* ======================
     * LAVORI
     * ====================== */
    case "LAVORI": {
      const risposta = testo.trim();

      if (!risposta) {
        messaggioBot("Non ho capito. Ripeti il lavoro.");
        if (modalitaAssistente === "vocale") parlaEDopoAscolta("Non ho capito. Ripeti il lavoro.");
        rispostaInElaborazione = false;
        return;
      }

      if (isComandoUscita(risposta)) {
        if (sessioneAssistente.listaLavori.length) {
          salvaCampoScheda(
            "LAVORI",
            "• " + sessioneAssistente.listaLavori.join("\n• ")
          );
        }
        rispostaInElaborazione = false;
        setTimeout(prossimaDomanda, 400);
        return;
      }

      sessioneAssistente.listaLavori.push(risposta);
      rispostaInElaborazione = false;
      faiDomanda("Ok. Altro lavoro?");
      return;
    }

    /* ======================
     * PRODOTTI
     * ====================== */
    case "PRODOTTI": {
      const risposta = testo.trim();

      if (!risposta) {
        rispostaInElaborazione = false;
        faiDomanda("Non ho capito. Ripeti il prodotto.");
        return;
      }

      if (isComandoUscita(risposta)) {
        if (sessioneAssistente.listaProdotti.length) {
          salvaCampoScheda(
            "PRODOTTI",
            "• " + sessioneAssistente.listaProdotti.join("\n• ")
          );
        }
        rispostaInElaborazione = false;
        setTimeout(prossimaDomanda, 300);
        return;
      }

      sessioneAssistente.listaProdotti.push(risposta);
      rispostaInElaborazione = false;
      setTimeout(() => faiDomanda("Ok. Altro prodotto?"), 200);
      return;
    }

    /* ======================
     * ORE
     * ====================== */
    case "ORE_IMPIEGATE": {
      const oreNum = normalizzaOre(testo);

      if (!oreNum) {
        messaggioBot("Non ho capito le ore. Ripeti o dì 'salta'.");
        rispostaInElaborazione = false;
        return;
      }

      const valore = `${oreNum} h`;
      messaggioBot(`Ore registrate: ${valore}`);
      salvaCampoScheda("ORE_IMPIEGATE", valore);

      rispostaInElaborazione = false;
      prossimaDomanda();
      return;
    }

    /* ======================
     * NOTE
     * ====================== */
    case "NOTE": {
      if (isComandoUscita(testo)) {
        rispostaInElaborazione = false;
        setTimeout(prossimaDomanda, 300);
        return;
      }

      salvaCampoScheda("NOTE", testo);
      rispostaInElaborazione = false;
      faiDomanda("Nota salvata.");
      setTimeout(prossimaDomanda, 600);
      return;
    }

    /* ======================
     * CHIUSURA
     * ====================== */
    case "CHIUSURA": {
      try { recognition?.stop(); } catch (e) {}

      modalitaAssistente = "manuale";

      if (
        testo === "NO" ||
        testo === "ANNULLA" ||
        testo === "LASCIA APERTA"
      ) {
        messaggioBot("Scheda lasciata aperta.");
      } else {
        messaggioBot("Scheda chiusa.");
        callBackend(
          "chiudiScheda",
          [sessioneAssistente.schedaId]
        );
      }

      rispostaInElaborazione = false;
      setTimeout(() => {
        resetModalitaAssistente();
        esciAssistente();
      }, 900);

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
    modalitaAssistente = "vocale";

    // 🔓 sblocco microfono con gesto utente
    if (!recognition) initVoce();

    micSbloccato = true;

    messaggioBot("Modalità vocale attiva, iniziamo.");
  } else {
    modalitaAssistente = "manuale";
  }
});

function salvaCampoScheda(campo, valore) {
  console.log("salvaCampoScheda chiamata");
  console.log("schedaId:", sessioneAssistente.schedaId);
  console.log("campo:", campo);
  console.log("valore:", valore);

  // 🔒 BLOCCO DI SICUREZZA
  if (!sessioneAssistente.schedaId) return;

  callBackend(
    "aggiornaSchedaCampo",
    [sessioneAssistente.schedaId, campo, valore]
  )
  .then(() => {
    console.log("Campo salvato:", campo);
  })
  .catch(err => {
    console.error("Errore backend:", err);
  });
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

function caricaSchede() {
  callBackend("listaSchede")
    .then(res => {

      const lista = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];

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

function inizializzaVoceBot() {
  const voci = speechSynthesis.getVoices();
  if (!voci.length) return;

  // 🔍 priorità assoluta
  const preferite = [
    v => v.lang === "it-IT" && /google/i.test(v.name),
    v => v.lang === "it-IT" && /natural|neural|chrome/i.test(v.name),
    v => v.lang === "it-IT" && !/cosimo/i.test(v.name), // escludi Cosimo
    v => v.lang === "it-IT"
  ];

  for (const test of preferite) {
    const trovata = voci.find(test);
    if (trovata) {
      voceBot = trovata;
      console.log("🎙️ Voce selezionata:", trovata.name);
      return;
    }
  }

  voceBot = null;
  console.warn("⚠️ Nessuna voce italiana valida trovata");
}
speechSynthesis.onvoiceschanged = inizializzaVoceBot;

function parlaTesto(testo, callback) {
  if (!("speechSynthesis" in window)) {
    if (callback) callback();
    return;
  }

  speechSynthesis.cancel();

  botStaParlando = true;   // 🔒 BLOCCO

  const utter = new SpeechSynthesisUtterance(testo);
  utter.lang = "it-IT";

  if (voceBot) utter.voice = voceBot;

  utter.rate = 1.1;
  utter.pitch = 0.9;
  utter.volume = 1;

  utter.onend = () => {
    botStaParlando = false;   // 🔓 SBLOCCO
    if (callback) callback();
  };

  speechSynthesis.speak(utter);
}

function bipMicrofono() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = 900;
  gain.gain.value = 0.08;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

function caricaOrdiniUI(force = false) {
  const now = Date.now();

  // ✅ usa cache se valida
  if (
    !force &&
    CACHE_ORDINI &&
    now - CACHE_TS < CACHE_TTL
  ) {
    renderOrdini(
      CACHE_ORDINI.ordini || [],
      CACHE_ORDINI.clienti || [],
      CACHE_ORDINI.veicoli || [],
      CACHE_ORDINI.fornitori || []
    );
    return;
  }

   callBackend("getOrdiniBundle")
  .then(res => {
    const ordini = res?.ordini || [];
    const clienti = res?.clienti || [];
    const veicoli = res?.veicoli || [];
    const fornitori = res?.fornitori || [];

    CACHE_ORDINI = { ordini, clienti, veicoli, fornitori };
    CACHE_TS = Date.now();

    window.VEICOLI_ALL = veicoli;

    renderOrdini(ordini, clienti, veicoli, fornitori);
  })
  .catch(err => {
    console.error("Errore caricamento ordini", err);
    alert("Errore caricamento ordini");
  });
}

function renderOrdini(ordini, clienti, veicoli, fornitori) {
  const container = document.getElementById("listaOrdini");
  container.innerHTML = "";

  ordini.forEach(o => {
    const row = document.createElement("div");
    row.className = "ordine-row";

    row.innerHTML = `
      <!-- CHECKBOX -->
      <div class="ordine-check">
        <input type="checkbox"
          ${o.check ? "checked" : ""}
          onchange="onToggleCheckbox(${o.row}, this.checked)">
      </div>

      <!-- DESCRIZIONE -->
      <div
        class="ordine-descr"
        onclick="editDescrizione(this, ${o.row})"
      >
        ${o.descrizione || "Scrivi descrizione ordine…"}
      </div>

      <!-- SELECT AFFIANCATI -->
      <div class="ordine-select-group">
        <select class="ordine-select"
          onchange="onChangeCliente(${o.row}, this.value)">
          <option value="" disabled ${o.cliente ? "" : "selected"}>Cliente</option>
          ${clienti.map(c =>
            `<option value="${c}" ${c === o.cliente ? "selected" : ""}>${c}</option>`
          ).join("")}
        </select>

        ${renderSelectVeicolo(o.row, o.veicolo, o.cliente, veicoli)}

        ${fornitoreHtml(o, fornitori)}
      </div>

      <!-- INVIA UNICO (FULL WIDTH) -->
      <button
        class="ordine-invia"
        onclick="inviaOrdine(${o.row})">
        INVIA
      </button>
    `;

    container.appendChild(row);
  });
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

  // aggiorna UI subito (istantaneo)
  aggiornaSelectVeicoliUI(row, cliente);

  // salva su Sheet in background (JSONP)
  callBackend(
    "aggiornaClienteOrdine",
    [row, cliente],
    () => {
      // successo silenzioso (non blocca UI)
      console.log("Cliente ordine aggiornato:", row, cliente);
    },
    err => {
      console.error("Errore aggiornamento cliente", err);
      alert("Errore nel salvataggio del cliente");
    }
  );
}

function onChangeVeicolo(row, veicolo) {
  if (!veicolo) return;

  callBackend(
    "aggiornaVeicoloOrdine",
    [row, veicolo],
    null, // non serve success handler
    err => {
      console.error("Errore aggiornamento veicolo", err);
      alert("Errore nel salvataggio del veicolo");
    }
  );
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
    alert("Fornitore");
    return;
  }
  window.open(link, "_blank");
}

function onToggleCheckbox(row, checked) {
  callBackend(
    "aggiornaCheckboxOrdine",
    [row, checked],
    () => {
      // opzionale: feedback silenzioso
      console.log("Checkbox aggiornata:", row, checked);
    },
    err => {
      console.error("Errore aggiornamento checkbox", err);
      alert("Errore nel salvataggio");
    }
  );
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
  const descrizione = prompt("Inserisci la descrizione del nuovo ordine:");
  if (!descrizione || !descrizione.trim()) return;

  callBackend(
    "creaNuovoOrdine",
    [normalizzaDescrizioneOrdine(descrizione)],
    () => {
      caricaOrdiniUI(); // ricarica lista
    },
    err => {
      console.error("Errore creazione ordine", err);
      alert("Errore nella creazione dell'ordine");
    }
  );
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

    callBackend(
      "aggiornaDescrizioneOrdine",
      [row, nuovoTesto],
      () => {
        // ✅ SUCCESS
        const nuovoSpan = document.createElement("span");
        nuovoSpan.className = "ordine-descr";
        nuovoSpan.textContent =
          nuovoTesto || "Scrivi descrizione ordine…";

        nuovoSpan.onclick = () =>
          editDescrizione(nuovoSpan, row);

        input.replaceWith(nuovoSpan);
      },
      () => {
        // ❌ ERROR
        alert("Errore nel salvataggio");
        input.focus();
      }
    );
  });
}
/********************
 * ORDINE VOCALE
 ********************/
let recognitionOrdine = null;

function avviaOrdineVocale() {
  if (modalitaAssistente === "vocale") {
    alert("Chiudi prima l’assistente");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Il riconoscimento vocale non è supportato da questo browser");
    return;
  }

  recognitionOrdine = new SpeechRecognition();
  recognitionOrdine.lang = "it-IT";
  recognitionOrdine.interimResults = false;
  recognitionOrdine.continuous = false;

  recognitionOrdine.onstart = () => {
    console.log("🎤 Ascolto nuovo ordine...");
  };

  recognitionOrdine.onresult = e => {
    const testo = e.results[0][0].transcript.trim();
    console.log("📝 Ordine vocale:", testo);

    if (!testo) return;

    const descrizione = normalizzaDescrizioneOrdine(testo);

    callBackend(
      "inserisciNuovoOrdineVocale",
      [descrizione],
      () => {
        caricaOrdiniUI(); // aggiorna lista
      },
      err => {
        console.error("Errore inserimento ordine vocale", err);
        alert("Errore inserimento ordine vocale");
      }
    );
  };

  recognitionOrdine.onerror = e => {
    console.error("Errore microfono ordine", e);
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

      CACHE_TS = Date.now();
      console.log("Ordini preload completato");
    })
    .catch(err => {
      console.warn("Preload ordini fallito", err);
    });
}

function caricaAppuntamentiOggi() {
  const box = document.getElementById("oggiEventi");
  if (!box) return;

  callBackend("getAppuntamentiOggi")
    .then(res => {

      const eventi = Array.isArray(res)
        ? res
        : res?.data || [];

      if (!eventi.length) {
        box.innerHTML = "<p>Nessun appuntamento oggi</p>";
        return;
      }

      box.innerHTML = eventi.map(e => `
        <div class="evento-oggi">
          <strong>${e.ora}</strong> – ${e.titolo}
        </div>
      `).join("");
    })
    .catch(err => {
      console.error("Errore appuntamenti", err);
      box.innerHTML = "<p>Errore caricamento appuntamenti</p>";
    });
}
/* ======================
 * PONTI HOME → SEZIONI
 * ====================== */

// HOME → ORDINI → Nuovo ordine
function homeNuovoOrdine() {
  showSection("ordini");
  setTimeout(() => {
    nuovoOrdine();
  }, 150);
}

// HOME → ORDINI → Ordine vocale
function homeOrdineVocale() {
  showSection("ordini");
  setTimeout(() => {
    avviaOrdineVocale();
  }, 150);
}

// HOME → CARICA LIBRETTO (SOLUZIONE FUNZIONANTE)
function homeCaricaLibretto() {
  const input = document.getElementById("libretto");
  if (!input) {
    alert("Input libretto non trovato");
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
  const foto = confirm(
    "Vuoi scattare una foto del libretto?\n\nOK = Fotocamera\nAnnulla = Galleria"
  );

  if (foto) {
    document.getElementById("librettoCamera").click();
  } else {
    document.getElementById("librettoGallery").click();
  }
}

function scegliTarga() {
  const foto = confirm(
    "Vuoi scattare una foto della targa?\n\nOK = Fotocamera\nAnnulla = Galleria"
  );

  if (foto) {
    document.getElementById("targaCamera").click();
  } else {
    document.getElementById("targaGallery").click();
  }
}

function getFileFromInputs(...ids) {
  for (const id of ids) {
    const input = document.getElementById(id);
    if (input && input.files && input.files.length > 0) {
      return input.files[0];
    }
  }
  return null;
}

function toggleMenu(btn) {
  // chiudi eventuali menu aperti
  document
    .querySelectorAll(".scheda-menu-popup")
    .forEach(m => {
      if (m !== btn.nextElementSibling) {
        m.style.display = "none";
      }
    });

  const menu = btn.nextElementSibling;
  menu.style.display =
    menu.style.display === "block" ? "none" : "block";
}

// chiudi menu cliccando fuori
document.addEventListener("click", e => {
  if (!e.target.closest(".scheda-menu")) {
    document
      .querySelectorAll(".scheda-menu-popup")
      .forEach(m => (m.style.display = "none"));
  }
});

function eliminaScheda(idScheda, status, linkDoc) {

  const conferma = confirm(
    "⚠️ Sei sicuro di voler eliminare questa scheda?\n\n" +
    (status === "CHIUSA"
      ? "Verrà eliminato anche il documento associato."
      : "L'operazione è irreversibile.")
  );

  if (!conferma) return;

  callBackend("eliminaScheda", [idScheda])
    .then(() => caricaSchede())
    .catch(err => {
      alert(err?.message || "Errore eliminazione scheda");
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

const drawer = document.getElementById("mobileDrawer");
const overlay = document.getElementById("drawerOverlay");
const logo = document.querySelector(".logo");

logo?.addEventListener("click", () => {
  drawer.classList.add("open");
  overlay.classList.add("show");
});

overlay?.addEventListener("click", closeDrawer);

function closeDrawer() {
  drawer?.classList.remove("open");
  overlay?.classList.remove("show");
}

document.querySelectorAll("#mobileDrawer button").forEach(btn => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    showSection(page);   // ✅ FUNZIONE REALE
    closeDrawer();
  });
});

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

function resetSezioneClienti() {

  resetClienti();   // 🔥 usa la vera funzione completa

}


document.addEventListener("DOMContentLoaded", () => {

  document
    .querySelectorAll(".file-btn-main, .file-btn-camera")
    .forEach(btn => {

      btn.addEventListener("click", e => {

        e.preventDefault();
        e.stopPropagation();

        const input = document.getElementById(btn.dataset.target);

        if (input) input.click();

      });

    });

});

function gestisciPreview(inputId, viewId) {

  const input = document.getElementById(inputId);
  const viewBtn = document.getElementById(viewId);

  if (!input || !viewBtn) return;

  viewBtn.classList.add("hidden");

  input.addEventListener("change", e => {

    const file = e.target.files?.[0];

    if (!file) {
      viewBtn.classList.add("hidden");
      return;
    }

    const url = URL.createObjectURL(file);

    viewBtn.classList.remove("hidden");
    viewBtn.onclick = () => window.open(url);

  });
}

gestisciPreview("librettoGallery", "librettoLink");
gestisciPreview("librettoCamera", "librettoLink");

gestisciPreview("targaGallery", "targaLink");
gestisciPreview("targaCamera", "targaLink");

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

});






























































