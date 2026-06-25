# Riego ESP32 — backend + web

Sistema de riego para 2 macetas. Este repo cubre **backend + web + notificación WhatsApp**. El firmware del ESP32 va aparte y consume los contratos de `contratos_riego_esp32.md`.

Ver `PLAN.md` para el plan de ejecución por fases.

## Requisitos

- Node.js 18+ (probado con 22).
- En Raspberry Pi / Linux / macOS, `better-sqlite3` compila su binario nativo en el `npm install`.

## Arranque

```bash
cp .env.example .env      # completar si hace falta (CallMeBot)
npm install
npm run dev               # o: npm start
```

Abrir http://localhost:3000

La base SQLite se crea sola en `data/riego.db` con 2 macetas y `version=1`.

## Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/api/config` | ESP32 / web | `version` + array de macetas |
| POST | `/api/config` | web | edita config, incrementa `version` |
| POST | `/api/estado` | ESP32 | reporta estado, heartbeat, dispara alerta; responde `{ ok, version }` |
| GET | `/api/estado` | web | estado + flag `conectado` calculado |

## Configuración (`.env`)

- `PORT` — puerto (default 3000).
- `POLLING_SEG` — intervalo de polling del ESP32; el umbral de "desconectado" en la web es 2× este valor.
- `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY` — para la alerta de WhatsApp. Si faltan, la alerta se loguea pero no se envía.

La API es abierta (sin autenticación).

## Estado de verificación

Los endpoints fueron probados end-to-end (12 checks: lectura/escritura de config, incremento de `version`, validación de payloads inválidos → 400, persistencia de `ultimo_riego`, liveness, y transición `hay_agua` true→false que dispara la alerta). Pasaron todos.

## Pendientes

Ver sección "Pendientes" y "Por definir" en `PLAN.md` y en `contexto_proyecto_riego.md`.
