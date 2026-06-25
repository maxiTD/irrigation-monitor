# Plan de ejecución — Sistema de riego ESP32

Plan para implementar **backend + web + notificaciones**. El firmware del ESP32 va aparte y consume los contratos ya definidos en `contratos_riego_esp32.md`.

## Decisiones de esta etapa

| Decisión | Elección | Implicancia |
|---|---|---|
| Hosting | Casa / LAN (Raspberry o PC) | Web y API solo accesibles en la red local. |
| Estructura | Monorepo simple | `/backend` (Express) sirve también los estáticos de `/public`. Un solo proceso, un solo deploy. |
| Backend | Node.js + Express | Definido. |
| DB | SQLite (`better-sqlite3`) | Un archivo. Síncrono, simple, sobra para 2 macetas. |
| Front | HTML/JS/CSS plano (sin framework) | Vista de estado + form de config. Sin build step. |
| Notificación | WhatsApp vía CallMeBot | GET HTTP a la API. API key en `.env`. |
| Comunicación ESP32 | HTTP polling | El ESP32 postea estado cada ~5 min y baja config solo si cambió `version`. |

La API es abierta (sin autenticación).

## Estructura del proyecto

```
Proyecto Riego/
├── package.json
├── .env.example          # plantilla de configuración
├── .gitignore
├── data/                 # SQLite vive acá (gitignored)
├── src/
│   ├── server.js         # arranca Express, sirve /public y monta /api
│   ├── db.js             # init de SQLite + helpers de acceso
│   ├── routes/
│   │   ├── config.js     # GET /api/config, POST /api/config
│   │   └── estado.js     # POST /api/estado
│   └── services/
│       └── whatsapp.js   # alerta CallMeBot con debounce
└── public/
    ├── index.html        # estado + formulario
    ├── app.js            # fetch a la API, render, submit
    └── styles.css
```

## Modelo de datos (SQLite)

```
maceta        (id, habilitada, intervalo_horas, cantidad_ml, ultimo_riego)
config_meta   (id=1, version)
estado_sistema(id=1, hay_agua, ultima_conexion)
```

`version` y `ultima_conexion` son del backend. `ultimo_riego` y `hay_agua` los escribe el ESP32. `habilitada`, `intervalo_horas` y `cantidad_ml` los escribe la web. (Ver tabla "Dueño de cada campo" en los contratos.)

## Fases

### Fase 0 — Scaffolding *(incluida en esta entrega)*
- `package.json` con deps (`express`, `better-sqlite3`, `dotenv`) y scripts (`start`, `dev`).
- `.env.example`, `.gitignore`, estructura de carpetas.

### Fase 1 — Backend: persistencia y lectura *(esqueleto en esta entrega)*
1. `db.js`: crear tablas si no existen y sembrar 2 macetas + `version=1` + `hay_agua=true`.
2. `GET /api/config`: devuelve `version` + array de macetas con `ultimo_riego` (epoch o `null`).
3. `POST /api/config`: recibe `macetas` (sin `version`/`ultimo_riego`), actualiza campos editables e **incrementa `version`**.

### Fase 2 — Backend: estado y heartbeat *(esqueleto en esta entrega)*
4. `POST /api/estado`: persiste `hay_agua` y `ultimo_riego` por maceta, estampa `ultima_conexion = now`, responde `{ ok, version }`.
5. Liveness: la web calcula "desconectado" comparando `ultima_conexion` contra ~2× el intervalo de polling.

### Fase 3 — Notificación WhatsApp *(esqueleto en esta entrega)*
6. `whatsapp.js`: al recibir `POST /estado`, detectar transición `hay_agua` `true → false` y mandar **una sola vez** el GET a CallMeBot (debounce con el último valor guardado).
7. Setup CallMeBot: activar API key (mandar "I allow callmebot to send me messages" al bot), cargar `phone` + `apikey` en `.env`.

### Fase 4 — Frontend *(versión inicial en esta entrega)*
8. Vista de estado: por maceta mostrar habilitada, intervalo, cantidad (ml), último riego (epoch → hora local), `hay_agua`, y badge conectado/desconectado.
9. Formulario de config: editar `habilitada`/`intervalo_horas`/`cantidad_ml` de cada maceta y `POST /api/config`.
10. Auto-refresh cada N segundos (polling de `GET /api/config` + un endpoint de estado para la web).

### Fase 5 — Robustez y despliegue
11. Validación de payloads (rangos de intervalo/cantidad_ml, ids válidos).
12. Correr como servicio (systemd en Raspberry / `pm2`) para que levante al bootear.

## Pendientes a resolver (del contexto, no rompen el modelo)

- **Intervalo de polling concreto** (propuesta: 5 min) → fija el umbral de "desconectado" (~10 min) en la web.
- **Cómo se mide `hay_agua`** (sensor de nivel/flotante) → es firmware, la API lo ve como bool.
- **Zona horaria** de presentación en la web (almacenamiento en epoch/UTC).
- Más adelante: idempotencia del "regar ahora" (cmd_id) para no regar dos veces si se pierde la confirmación del ESP32.

## Próximos pasos sugeridos

1. `npm install` y `npm run dev` para verificar que el esqueleto levanta.
2. Completar la lógica de cada endpoint (los handlers quedan con TODOs marcados).
3. Cablear el frontend contra la API real.
4. Configurar CallMeBot y probar la alerta forzando una transición de `hay_agua`.
