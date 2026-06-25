'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'riego.json');

function load() {
  if (fs.existsSync(DB_PATH)) {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  return {
    version: 1,
    macetas: [
      { id: 1, habilitada: true, intervalo_horas: 24, cantidad_ml: 200, ultimo_riego: null, riego_manual: false },
      { id: 2, habilitada: true, intervalo_horas: 48, cantidad_ml: 300, ultimo_riego: null, riego_manual: false },
    ],
    estado_sistema: { hay_agua: true, ultima_conexion: null },
    notificacion: {
      phone: process.env.CALLMEBOT_PHONE || '',
      apikey: process.env.CALLMEBOT_APIKEY || '',
    },
  };
}

function persist() {
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), 'utf8');
}

let store = load();

// Compatibilidad: si el archivo existente no tenía notificacion, sembrarla del .env.
if (!store.notificacion) {
  store.notificacion = {
    phone: process.env.CALLMEBOT_PHONE || '',
    apikey: process.env.CALLMEBOT_APIKEY || '',
  };
  persist();
}

// Migración: duracion_seg (tiempo de bomba) -> cantidad_ml (volumen, sensor de caudal).
let migrado = false;
for (const m of store.macetas) {
  if (m.duracion_seg !== undefined && m.cantidad_ml === undefined) {
    m.cantidad_ml = m.duracion_seg;
    delete m.duracion_seg;
    migrado = true;
  }
}
if (migrado) persist();

// Migración: asegurar el flag de riego manual en macetas viejas.
let migradoManual = false;
for (const m of store.macetas) {
  if (m.riego_manual === undefined) {
    m.riego_manual = false;
    migradoManual = true;
  }
}
if (migradoManual) persist();

function getVersion() {
  return store.version;
}

function bumpVersion() {
  store.version += 1;
  persist();
  return store.version;
}

function getMacetas() {
  return store.macetas.map((m) => ({ ...m }));
}

const updateMacetaConfig = {
  run(habilitada, intervalo_horas, cantidad_ml, id) {
    const m = store.macetas.find((x) => x.id === id);
    if (m) {
      m.habilitada = !!habilitada;
      m.intervalo_horas = intervalo_horas;
      m.cantidad_ml = cantidad_ml;
    }
  },
};

const updateUltimoRiego = {
  run(ultimo_riego, id) {
    const m = store.macetas.find((x) => x.id === id);
    if (m) m.ultimo_riego = ultimo_riego;
  },
};

// Comando "regar ahora": la web lo pone en true, el ESP32 lo limpia (false) al ejecutarlo.
function setRiegoManual(id, valor) {
  const m = store.macetas.find((x) => x.id === id);
  if (!m) return false;
  m.riego_manual = !!valor;
  persist();
  return true;
}

function getEstadoSistema() {
  return { ...store.estado_sistema };
}

function setEstadoSistema(hayAgua, ultimaConexion) {
  store.estado_sistema.hay_agua = !!hayAgua;
  store.estado_sistema.ultima_conexion = ultimaConexion;
  persist();
}

function getNotificacion() {
  return { ...store.notificacion };
}

function setNotificacion(phone, apikey) {
  store.notificacion = { phone: phone || '', apikey: apikey || '' };
  persist();
  return getNotificacion();
}

// Wrapper síncrono que imita db.transaction() de better-sqlite3.
// Después de ejecutar la función, persiste el estado al disco.
const db = {
  transaction: (fn) =>
    (...args) => {
      const result = fn(...args);
      persist();
      return result;
    },
};

module.exports = {
  db,
  getVersion,
  bumpVersion,
  getMacetas,
  updateMacetaConfig,
  updateUltimoRiego,
  setRiegoManual,
  getEstadoSistema,
  setEstadoSistema,
  getNotificacion,
  setNotificacion,
};
