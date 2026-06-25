'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const configRoutes = require('./routes/config');
const estadoRoutes = require('./routes/estado');
const notificacionRoutes = require('./routes/notificacion');
const regarRoutes = require('./routes/regar');

const app = express();
app.use(express.json());

// --- Auth opcional (modo LAN: si API_TOKEN está vacío, no se exige) ---
const API_TOKEN = (process.env.API_TOKEN || '').trim();
app.use('/api', (req, res, next) => {
  if (!API_TOKEN) return next(); // sin token configurado -> abierto en LAN
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== API_TOKEN) return res.status(401).json({ ok: false, error: 'No autorizado.' });
  next();
});

// --- API ---
app.use('/api', configRoutes);
app.use('/api', estadoRoutes);
app.use('/api', notificacionRoutes);
app.use('/api', regarRoutes);

// --- Web estática ---
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`[server] Sistema de riego escuchando en http://localhost:${PORT}`);
  console.log(`[server] auth: ${API_TOKEN ? 'token requerido' : 'abierta (LAN)'}`);
});
