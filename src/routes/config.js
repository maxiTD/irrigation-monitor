'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/config — el ESP32 (y la web) se baja la config.
router.get('/config', (req, res) => {
  res.json({
    version: db.getVersion(),
    macetas: db.getMacetas(),
  });
});

// POST /api/config — la web edita la config. Incrementa version.
// Body: { macetas: [{ id, habilitada, intervalo_horas, cantidad_ml }, ...] }  (sin version ni ultimo_riego)
router.post('/config', (req, res) => {
  const { macetas } = req.body || {};
  if (!Array.isArray(macetas) || macetas.length === 0) {
    return res.status(400).json({ ok: false, error: 'Falta el array "macetas".' });
  }

  const idsValidos = new Set(db.getMacetas().map((m) => m.id));

  for (const m of macetas) {
    if (!idsValidos.has(m.id)) {
      return res.status(400).json({ ok: false, error: `Maceta id ${m.id} inexistente.` });
    }
    if (typeof m.habilitada !== 'boolean') {
      return res.status(400).json({ ok: false, error: `habilitada debe ser boolean (maceta ${m.id}).` });
    }
    if (!Number.isInteger(m.intervalo_horas) || m.intervalo_horas < 1 || m.intervalo_horas > 24 * 30) {
      return res.status(400).json({ ok: false, error: `intervalo_horas inválido (maceta ${m.id}).` });
    }
    if (!Number.isInteger(m.cantidad_ml) || m.cantidad_ml < 1 || m.cantidad_ml > 5000) {
      return res.status(400).json({ ok: false, error: `cantidad_ml inválido (maceta ${m.id}).` });
    }
  }

  const aplicar = db.db.transaction((items) => {
    for (const m of items) {
      db.updateMacetaConfig.run(m.habilitada ? 1 : 0, m.intervalo_horas, m.cantidad_ml, m.id);
    }
    return db.bumpVersion();
  });

  const version = aplicar(macetas);
  res.json({ ok: true, version });
});

module.exports = router;
