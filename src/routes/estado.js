'use strict';

const express = require('express');
const db = require('../db');
const { enviarAlertaSinAgua } = require('../services/whatsapp');

const router = express.Router();

// POST /api/estado — el ESP32 reporta (heartbeat + estado).
// Body: { config_version, hay_agua, macetas: [{ id, ultimo_riego }, ...] }
// Respuesta: { ok, version }  -> el ESP32 compara version y baja config solo si cambió.
router.post('/estado', (req, res) => {
  const { hay_agua, macetas } = req.body || {};

  if (typeof hay_agua !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'hay_agua debe ser boolean.' });
  }
  if (!Array.isArray(macetas)) {
    return res.status(400).json({ ok: false, error: 'Falta el array "macetas".' });
  }

  const ahora = Math.floor(Date.now() / 1000);
  const previo = db.getEstadoSistema();
  const riegoPrevio = new Map(db.getMacetas().map((m) => [m.id, m.ultimo_riego]));

  // Persistir ultimo_riego por maceta (el ESP32 es la autoridad en operación).
  // Auto-limpieza del comando "regar ahora": si el ESP32 reporta un ultimo_riego
  // MÁS NUEVO que el guardado, significa que regó -> se limpia riego_manual.
  // (Se compara contra el anterior porque el ESP32 reporta su ultimo_riego en cada
  // heartbeat; limpiar con solo recibirlo borraría el flag sin haber regado.)
  const persistir = db.db.transaction((items) => {
    for (const m of items) {
      if (m.ultimo_riego != null) {
        const anterior = riegoPrevio.get(m.id);
        if (anterior == null || m.ultimo_riego > anterior) {
          db.setRiegoManual(m.id, false); // regó -> limpia el comando manual
        }
        db.updateUltimoRiego.run(m.ultimo_riego, m.id);
      }
    }
    db.setEstadoSistema(hay_agua, ahora); // estampa ultima_conexion (liveness)
  });
  persistir(macetas);

  // Alerta WhatsApp: solo en la transición true -> false (debounce).
  if (previo.hay_agua === true && hay_agua === false) {
    enviarAlertaSinAgua(); // fire-and-forget, no bloquea la respuesta al ESP32
  }

  res.json({ ok: true, version: db.getVersion() });
});

// GET /api/estado — para la web (estado + liveness calculado).
router.get('/estado', (req, res) => {
  const pollingSeg = parseInt(process.env.POLLING_SEG || '300', 10);
  const ahora = Math.floor(Date.now() / 1000);
  const sistema = db.getEstadoSistema();
  const conectado =
    sistema.ultima_conexion != null && ahora - sistema.ultima_conexion <= 2 * pollingSeg;

  res.json({
    hay_agua: sistema.hay_agua,
    ultima_conexion: sistema.ultima_conexion,
    conectado,
    polling_seg: pollingSeg,
    version: db.getVersion(),
    macetas: db.getMacetas(),
  });
});

module.exports = router;
