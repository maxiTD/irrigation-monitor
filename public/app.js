'use strict';

const REFRESH_MS = 15000; // refresco de la vista de estado
let editando = false; // si hay cambios sin guardar, no pisamos lo que el usuario editó
let primeraCarga = true;
let baseline = null; // snapshot de la config tal como vino del server (para detectar cambios)

const $ = (sel) => document.querySelector(sel);

const ICONS = {
  plant:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V12"/><path d="M12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5Z"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z"/></svg>',
  drop:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z"/></svg>',
};

function fmtFecha(epoch) {
  if (epoch == null) return 'sin registro';
  return new Date(epoch * 1000).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtHace(epoch) {
  if (epoch == null) return '';
  const seg = Math.floor(Date.now() / 1000) - epoch;
  if (seg < 60) return `hace ${seg}s`;
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}

function setChip(el, state, label) {
  el.dataset.state = state;
  el.querySelector('.chip-label').textContent = label;
}

function renderEstado(data) {
  setChip($('#badge-conexion'), data.conectado ? 'ok' : 'bad', data.conectado ? 'Conectado' : 'Desconectado');
  setChip($('#badge-agua'), data.hay_agua ? 'ok' : 'bad', data.hay_agua ? 'Depósito OK' : 'Reponer agua');

  $('#ultima-conexion').textContent = data.ultima_conexion
    ? `último reporte ${fmtHace(data.ultima_conexion)}`
    : 'sin reportes aún';

  $('#version').textContent = `config v${data.version}`;
  $('#refresh-seg').textContent = Math.round(REFRESH_MS / 1000);
}

function cardHTML(m) {
  return `
    <div class="card-head">
      <div class="card-title">
        <span class="card-ico">${ICONS.plant}</span>
        <div>
          <h2>Maceta ${m.id}</h2>
          <span class="sub">${m.habilitada ? 'Riego activo' : 'Riego pausado'}</span>
        </div>
      </div>
      <label class="switch" title="Activar/pausar riego">
        <input type="checkbox" id="hab-${m.id}" ${m.habilitada ? 'checked' : ''} />
        <span class="track"></span>
      </label>
    </div>

    <div class="card-info">
      ${ICONS.drop}
      <span>Último riego: <b>${fmtFecha(m.ultimo_riego)}</b></span>
    </div>

    <div class="fields">
      <div class="field">
        <label for="int-${m.id}">
          <span class="label-strong">Frecuencia</span>
          <span class="label-hint">cada cuánto riega</span>
        </label>
        <span class="input-unit">
          <input type="number" id="int-${m.id}" min="1" max="720" value="${m.intervalo_horas}" />
          <span class="unit">horas</span>
        </span>
      </div>
      <div class="field">
        <label for="ml-${m.id}">
          <span class="label-strong">Cantidad de agua</span>
          <span class="label-hint">volumen de riego</span>
        </label>
        <span class="input-unit">
          <input type="number" id="ml-${m.id}" min="1" max="5000" value="${m.cantidad_ml}" />
          <span class="unit">ml</span>
        </span>
      </div>
    </div>

    <div class="card-action">
      ${m.riego_manual
        ? `<span class="pend"><span class="spinner"></span>Riego manual pendiente…</span>
           <button type="button" class="btn-ghost" data-cancel="${m.id}">Cancelar</button>`
        : `<button type="button" class="btn-regar" data-regar="${m.id}">${ICONS.drop} Regar ahora (${m.cantidad_ml} ml)</button>`}
    </div>
  `;
}

function snapshotForm() {
  return [...document.querySelectorAll('.maceta')].map((el) => {
    const id = parseInt(el.dataset.id, 10);
    return {
      id,
      habilitada: $(`#hab-${id}`).checked,
      intervalo_horas: $(`#int-${id}`).value,
      cantidad_ml: $(`#ml-${id}`).value,
    };
  });
}

// Habilita "Guardar" solo si el form difiere de lo último que vino del server.
function actualizarCambios() {
  const dirty = baseline !== null && JSON.stringify(snapshotForm()) !== baseline;
  editando = dirty; // mientras haya cambios sin guardar, el auto-refresh no pisa el form
  $('#btn-guardar').disabled = !dirty;
}

function renderMacetas(macetas) {
  if (editando) return; // no pisar lo que el usuario está editando
  const cont = $('#macetas');
  cont.innerHTML = '';
  for (const m of macetas) {
    const el = document.createElement('div');
    el.className = 'maceta';
    if (!m.habilitada) el.dataset.off = '';
    el.dataset.id = m.id;
    el.innerHTML = cardHTML(m);
    cont.appendChild(el);

    const toggle = el.querySelector(`#hab-${m.id}`);
    toggle.addEventListener('change', () => {
      el.toggleAttribute('data-off', !toggle.checked);
      el.querySelector('.sub').textContent = toggle.checked ? 'Riego activo' : 'Riego pausado';
      actualizarCambios();
    });
    el.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', actualizarCambios);
    });

    const btnRegar = el.querySelector('[data-regar]');
    if (btnRegar) btnRegar.addEventListener('click', () => pedirRiego(m.id, false));
    const btnCancel = el.querySelector('[data-cancel]');
    if (btnCancel) btnCancel.addEventListener('click', () => pedirRiego(m.id, true));
  }
  baseline = JSON.stringify(snapshotForm()); // snapshot limpio recién renderizado
  actualizarCambios(); // deja el botón deshabilitado (sin cambios)
}

// Pide (o cancela) un riego manual. El ESP32 lo ejecuta en su próximo poll.
async function pedirRiego(id, cancelar) {
  try {
    await fetch('/api/regar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, cancelar }),
    });
    if (!editando) cargar(); // refresca el estado pendiente/normal
  } catch (err) { /* reintenta en el próximo refresh */ }
}

function renderSkeleton() {
  $('#macetas').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
}

async function cargar() {
  try {
    const res = await fetch('/api/estado');
    const data = await res.json();
    renderEstado(data);
    renderMacetas(data.macetas);
    primeraCarga = false;
  } catch (err) {
    if (primeraCarga) $('#macetas').innerHTML =
      '<div class="card-info" style="grid-column:1/-1">No se pudo conectar con el servidor.</div>';
    setChip($('#badge-conexion'), 'bad', 'Sin servidor');
  }
}

$('#form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const macetas = [...document.querySelectorAll('.maceta')].map((el) => {
    const id = parseInt(el.dataset.id, 10);
    return {
      id,
      habilitada: $(`#hab-${id}`).checked,
      intervalo_horas: parseInt($(`#int-${id}`).value, 10),
      cantidad_ml: parseInt($(`#ml-${id}`).value, 10),
    };
  });

  const msg = $('#msg');
  const btn = $('#btn-guardar');
  btn.disabled = true;
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macetas }),
    });
    const data = await res.json();
    if (data.ok) {
      msg.textContent = `Guardado · config v${data.version}`;
      msg.className = 'msg ok';
      editando = false;
      cargar(); // re-renderiza, fija baseline nuevo y deja el botón deshabilitado
    } else {
      msg.textContent = data.error || 'Error al guardar.';
      msg.className = 'msg bad';
      btn.disabled = false; // permitir reintento
    }
  } catch (err) {
    msg.textContent = 'Error de red al guardar.';
    msg.className = 'msg bad';
    btn.disabled = false; // permitir reintento
  } finally {
    setTimeout(() => { msg.textContent = ''; }, 4000);
  }
});

// ---------- Notificación (destinatario de la alerta) ----------
const notifBtn = $('#btn-notif');
const notifPanel = $('#notif-panel');

async function cargarNotif() {
  try {
    const data = await (await fetch('/api/notificacion')).json();
    $('#notif-phone').value = data.phone || '';
    $('#notif-apikey').value = data.apikey || '';
  } catch (err) { /* el panel queda con campos vacíos */ }
}

function abrirNotif(abrir) {
  notifPanel.hidden = !abrir;
  notifBtn.setAttribute('aria-expanded', String(abrir));
  if (abrir) $('#notif-phone').focus();
}

notifBtn.addEventListener('click', () => abrirNotif(notifPanel.hidden));

document.addEventListener('click', (e) => {
  if (!notifPanel.hidden && !e.target.closest('.notif')) abrirNotif(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !notifPanel.hidden) abrirNotif(false);
});

$('#btn-notif-save').addEventListener('click', async () => {
  const msg = $('#notif-msg');
  const btn = $('#btn-notif-save');
  const phone = $('#notif-phone').value.trim();
  const apikey = $('#notif-apikey').value.trim();
  btn.disabled = true;
  try {
    const res = await fetch('/api/notificacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, apikey }),
    });
    const data = await res.json();
    if (data.ok) {
      msg.textContent = 'Guardado';
      msg.className = 'msg ok';
      setTimeout(() => abrirNotif(false), 700);
    } else {
      msg.textContent = data.error || 'Error al guardar.';
      msg.className = 'msg bad';
    }
  } catch (err) {
    msg.textContent = 'Error de red.';
    msg.className = 'msg bad';
  } finally {
    btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 4000);
  }
});

renderSkeleton();
cargar();
cargarNotif();
setInterval(cargar, REFRESH_MS);
