# Sistema de riego ESP32 — Contexto y decisiones

Documento de contexto del proyecto. Acompaña a `contratos_riego_esp32.md`, que tiene el detalle de los payloads JSON.

## Objetivo

Sistema de riego automático para dos macetas controladas por un ESP32. Se busca:

- Una web simple para ver el estado de las macetas, setear la frecuencia de riego y la cantidad de agua de cada una de forma individual.
- Un aviso por WhatsApp cuando no hay agua para el riego (flag `hay_agua` = sí/no).
- Que el ESP32 reciba esos parámetros para operar.

El firmware del ESP32 lo desarrolla el dueño del proyecto por separado. Este repo cubre backend + web + notificaciones.

## Arquitectura

```
   ESP32  <—— GET /config ———  Backend + API  ——>  Web (estado + config)
          ——— POST /estado —>   (Node + DB)    ——>  WhatsApp (alerta sin agua)
```

- **ESP32**: autónomo. Guarda su config y decide cuándo regar él mismo, contra su propio reloj. Reporta estado.
- **Backend**: guarda config y estado, expone la API REST, dispara la alerta de WhatsApp. No le ordena al ESP32 cuándo regar.
- **Web**: lee estado, edita config. Nunca ordena un riego directo.
- **WhatsApp**: recibe la alerta cuando se queda sin agua.

### Decisión clave: lógica de riego en el borde

El ESP32 es la autoridad sobre *cuándo* riega. El backend solo persiste parámetros y estado. Si se cae internet o el servidor, las plantas igual se riegan con la última config que el ESP32 tenía. La web cambia parámetros; no comanda riegos.

## Stack

| Pieza | Elección | Estado |
|---|---|---|
| Backend | Node.js (Express o similar) | Definido |
| Base de datos | SQLite (un archivo; sobra para 2 macetas) | Propuesto |
| Front web | HTML/JS mínimo: vista de estado + formulario de config | Propuesto |
| Notificaciones | WhatsApp vía CallMeBot (gateway gratuito) | Definido |
| Comunicación ESP32 ↔ backend | HTTP polling | Definido |
| Hosting | Casa (Raspberry/PC en LAN) o free tier (Railway/Render/Fly.io) | A definir |

## Modelo de comunicación

HTTP polling. El ESP32 cada X minutos:

1. Hace `POST /estado` (heartbeat + reporte). El backend le responde con la `version` actual de la config.
2. Si esa `version` difiere de la que tiene aplicada, hace `GET /config` y se baja los parámetros nuevos.

El caso normal es un solo request. Solo baja config cuando de verdad cambió algo. No se necesita tiempo real porque el riego pasa cada horas/días.

## Contratos (resumen)

Detalle completo en `contratos_riego_esp32.md`.

- `GET /api/config` → el ESP32 se baja `version` + array de macetas con `habilitada`, `intervalo_horas`, `cantidad_ml`, `ultimo_riego`, `riego_manual`.
- `POST /api/estado` → el ESP32 reporta `config_version`, `hay_agua` y el `ultimo_riego` de cada maceta. Respuesta: `{ ok, version }`. El backend limpia `riego_manual` solo si el `ultimo_riego` reportado es más nuevo que el guardado (señal de que regó).
- `POST /api/config` → la web manda el array de macetas sin `version` ni `ultimo_riego`. El backend incrementa `version` solo.
- `POST /api/regar` → la web pide un riego manual (`{ id }`) o lo cancela (`{ id, cancelar: true }`). Setea `riego_manual`; no toca `version`.

## Decisiones tomadas

- **Timestamps en epoch Unix (segundos)**. El ESP32 sincroniza hora por NTP al bootear. La web convierte a formato legible para mostrar.
- **`cantidad_ml` = volumen de riego en mililitros**. El ESP32 mide el caudal con un sensor y corta la bomba al alcanzar la cantidad pedida. Reemplazó al esquema anterior de `duracion_seg` (tiempo de bomba), que ya no se usa.
- **`version`** entero que el backend incrementa en cada edición. Es el mecanismo que hace barato el polling.
- **`ultimo_riego` se devuelve en `GET /config`** para resiliencia: un ESP32 que se reinicia recupera el estado desde el backend en lugar de arrancar en cero.
- **Autoridad sobre `ultimo_riego`**: en el boot, el ESP32 toma el valor del backend; en operación, manda lo que tiene en RAM y el backend solo lo persiste.
- **`ultimo_riego` en `null`** (equipo nuevo) → el ESP32 setea `ultimo_riego = ahora` al bootear y espera el primer intervalo completo. No riega en el primer arranque (evita riego fantasma al reinstalar un equipo).
- **Liveness**: el backend estampa la hora de cada `POST /estado` (`ultima_conexion`, no va en el contrato). La web marca "desconectado" si pasó más de ~2× el intervalo de polling. El ESP32 debe postear estado periódicamente aunque no haya cambiado nada (heartbeat).
- **Alerta de agua**: el backend dispara el WhatsApp una sola vez en la transición de `hay_agua` de `true` a `false`. No reenvía mientras siga en `false` (debounce del lado del backend).
- **Notificación vía CallMeBot**: se eligió CallMeBot por ser plug-and-play (sin alta de número en Meta, sin plantillas, sin ventana de 24 h). El backend manda la alerta con un GET HTTP a `api.callmebot.com/whatsapp.php?phone=...&text=...&apikey=...`. No cambia la arquitectura ni los contratos; solo es el componente de notificación. Caveat: es un servicio de un tercero, no oficial, para uso personal y sin garantías de servicio; si se cae, la alerta no sale hasta reactivarlo. Aceptable para este proyecto. A futuro se evaluará migrar a Telegram (Bot API oficial, gratis, más robusto) si conviene.
- **Regar ahora**: comando `riego_manual` por maceta, aparte de `version`. La web lo activa (`POST /api/regar`), el ESP32 lo ejecuta con la `cantidad_ml` configurada. El backend lo **limpia automáticamente** cuando el ESP32 reporta un `ultimo_riego` más nuevo que el guardado (señal de que regó); no requiere un campo extra en el payload. Usa el mismo polling. Si no hay agua, queda pendiente. Tradeoffs aceptados: **sin idempotencia** (si se pierde el reporte podría regar de nuevo) y un riego **programado** también limpia un manual pendiente (comparten `ultimo_riego`).

## Pendientes (no rompen el modelo)

- Idempotencia del "regar ahora" (cmd_id) para que un comando no se ejecute dos veces si se pierde la confirmación.

## Por definir

- **Cómo se mide `hay_agua`** (sensor de nivel, flotante, etc.). Es firmware y no toca el contrato — para la API sigue siendo un bool — pero hay que decidirlo.
- **Intervalo de polling concreto** (ej. cada 5 min) y, en consecuencia, el **umbral de "desconectado"** que usa la web.
- **Setup de CallMeBot**: activar la API key una vez (agregar el número del bot a contactos y mandarle "I allow callmebot to send me messages" por WhatsApp), definir el número que recibe la alerta, y guardar la API key en el backend.
- **Esquema de auth/token** entre ESP32 y backend si se expone a internet, y dónde guarda el ESP32 ese token.
- **Hosting**: casa (LAN) vs cloud. Afecta si la web es accesible desde afuera y si hace falta exponer la API.
- **Zona horaria** para mostrar en la web (el almacenamiento es epoch/UTC; la presentación va en hora local).
