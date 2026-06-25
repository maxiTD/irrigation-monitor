'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/regar — la web pide un riego manual (o lo cancela).
// Body: { id, cancelar? }
// Setea riego_manual=true en la maceta; el ESP32 lo recoge en su próximo poll,
// valida agua, riega la cantidad_ml configurada y limpia el flag al confirmar.
// No pasa por la version de config: es un comando aparte.
router.post('/regar', (req, res) => {
  const { id, cancelar } = req.body || {};

  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: 'Falta "id" de maceta.' });
  }

  const ok = db.setRiegoManual(id, !cancelar);
  if (!ok) {
    return res.status(400).json({ ok: false, error: `Maceta id ${id} inexistente.` });
  }

  res.json({ ok: true, id, riego_manual: !cancelar });
});

module.exports = router;
