'use strict';

// Alerta de WhatsApp vía CallMeBot.
// Se dispara UNA sola vez en la transición de hay_agua: true -> false.
// El debounce lo maneja routes/estado.js comparando el valor previo guardado en DB.
// El destinatario (phone + apikey) se edita desde la web y se guarda en la DB.

const db = require('../db');

async function enviarAlertaSinAgua() {
  const text = '⚠️ Riego: el tanque se quedó sin agua. Las macetas no se van a regar hasta reponerlo.';

  const { phone: PHONE, apikey: APIKEY } = db.getNotificacion();

  if (!PHONE || !APIKEY) {
    console.warn('[whatsapp] CALLMEBOT_PHONE/APIKEY sin configurar — alerta NO enviada. Mensaje:', text);
    return false;
  }

  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(PHONE)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(APIKEY)}`;
  console.log(`[whatsapp] URL: ${url}`);

  try {
    const res = await fetch(url); // Node 18+ trae fetch global
    if (!res.ok) {
      console.error('[whatsapp] CallMeBot respondió', res.status);
      return false;
    }
    console.log('[whatsapp] Alerta de deposito vacío enviada');
    return true;
  } catch (err) {
    console.error('[whatsapp] Error enviando alerta:', err.message);
    return false;
  }
}

module.exports = { enviarAlertaSinAgua };
