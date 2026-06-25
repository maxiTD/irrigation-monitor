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

// --- API ---
app.use('/api', configRoutes);
app.use('/api', estadoRoutes);
app.use('/api', notificacionRoutes);
app.use('/api', regarRoutes);

// --- Web estática ---
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0'; // escuchar en todas las interfaces (requerido por Fly/contenedores)
app.listen(PORT, HOST, () => {
  console.log(`[server] Sistema de riego escuchando en ${HOST}:${PORT}`);
});
