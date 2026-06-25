'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/notificacion — destinatario actual de la alerta (para la web).
router.get('/notificacion', (req, res) => {
  const n = db.getNotificacion();
  res.json({ phone: n.phone || '', apikey: n.apikey || '' });
});

// POST /api/notificacion — editar destinatario.
// Body: { phone, apikey }. phone: solo dígitos, formato internacional sin "+".
router.post('/notificacion', (req, res) => {
  let { phone, apikey } = req.body || {};
  phone = (phone || '').trim();
  apikey = (apikey || '').trim();

  if (phone && !/^\d{8,15}$/.test(phone)) {
    return res.status(400).json({
      ok: false,
      error: 'Teléfono inválido: usá formato internacional, solo dígitos (8 a 15), sin "+" ni espacios.',
    });
  }

  const n = db.setNotificacion(phone, apikey);
  res.json({ ok: true, phone: n.phone, apikey: n.apikey });
});

module.exports = router;
