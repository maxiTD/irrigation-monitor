# Contratos — Sistema de riego ESP32

Documento de referencia para implementar backend y firmware con el mismo contrato.

- Timestamps en **epoch Unix (segundos)**. El ESP32 sincroniza hora por NTP al bootear.
- `cantidad_ml` = volumen de agua a entregar, en mililitros. El ESP32 mide el caudal con un sensor y corta la bomba al llegar a esa cantidad. (Reemplazó a `duracion_seg`/tiempo de bomba.)
- `version` es un entero que el backend incrementa en cada edición de config. Es el mecanismo que hace barato el polling.

---

## 1. `GET /api/config` — el ESP32 se baja la config

```json
{
  "version": 7,
  "macetas": [
    { "id": 1, "habilitada": true, "intervalo_horas": 24, "cantidad_ml": 200, "ultimo_riego": 1718294400, "riego_manual": false },
    { "id": 2, "habilitada": true, "intervalo_horas": 48, "cantidad_ml": 300, "ultimo_riego": 1718208000, "riego_manual": true }
  ]
}
```

`ultimo_riego` puede venir `null` si el backend nunca recibió un riego para esa maceta (equipo nuevo). Ver reglas de boot.

`riego_manual` es el comando "regar ahora": si viene `true`, el ESP32 debe regar la `cantidad_ml` de esa maceta cuanto antes (validando agua), fuera del cronograma. No hace falta limpiarlo a mano: el backend lo limpia solo cuando el ESP32 reporta un `ultimo_riego` más nuevo (ver punto 2).

## 2. `POST /api/estado` — el ESP32 reporta

```json
{
  "config_version": 7,
  "hay_agua": true,
  "macetas": [
    { "id": 1, "ultimo_riego": 1718294400 },
    { "id": 2, "ultimo_riego": 1718208000 }
  ]
}
```

Respuesta del backend:

```json
{ "ok": true, "version": 8 }
```

El ESP32 compara la `version` devuelta con la que tiene aplicada. Si difiere, recién ahí hace `GET /config`.

**Limpieza del riego manual (automática):** el backend compara el `ultimo_riego` reportado de cada maceta contra el que tenía guardado. Si el reportado es **más nuevo**, asume que la maceta se regó y limpia `riego_manual`. Por eso el ESP32 no necesita mandar ningún campo extra: le alcanza con reportar el `ultimo_riego` actualizado tras regar (cosa que ya hace). El heartbeat normal reporta el mismo `ultimo_riego` y no limpia nada.

Caveats: (1) sin idempotencia — si se pierde el reporte, el flag sigue activo y podría regar de nuevo en el próximo poll; (2) un riego **programado** también actualiza `ultimo_riego`, así que limpiaría un comando manual pendiente aunque no haya sido el que lo disparó (tradeoff aceptado).

## 3. `POST /api/config` — la web edita la config

Mismo array `macetas` que en (1), **sin** `version` ni `ultimo_riego` (esos no los maneja la web). El backend incrementa `version` solo.

```json
{
  "macetas": [
    { "id": 1, "habilitada": true, "intervalo_horas": 24, "cantidad_ml": 200 },
    { "id": 2, "habilitada": true, "intervalo_horas": 48, "cantidad_ml": 300 }
  ]
}
```

## 4. `POST /api/regar` — la web pide un riego manual ("regar ahora")

Comando aparte, **no toca `version`**. Setea `riego_manual = true` en la maceta; el ESP32 lo recoge en su próximo poll, riega la `cantidad_ml` configurada y limpia el flag al confirmar (ver punto 2).

```json
{ "id": 1 }
```

Para cancelar un riego manual pendiente: `{ "id": 1, "cancelar": true }`. Respuesta: `{ "ok": true, "id": 1, "riego_manual": true }`.

Si no hay agua al momento de ejecutar, el ESP32 no riega, reporta `hay_agua: false` (dispara la alerta) y deja el comando pendiente hasta que vuelva el agua o se cancele.

---

## Dueño de cada campo

| Campo | Lo escribe | Lo lee | Notas |
|---|---|---|---|
| `habilitada` | Web | ESP32 | activa/desactiva el riego de la maceta |
| `intervalo_horas` | Web | ESP32 | frecuencia |
| `cantidad_ml` | Web | ESP32 | volumen de agua (ml); el ESP32 corta por sensor de caudal |
| `version` | Backend | ESP32 | sube en cada edición; gatilla el `GET /config` |
| `ultimo_riego` | ESP32 | ESP32, Web | el ESP32 es la autoridad en operación; el backend lo persiste y lo devuelve para el boot |
| `hay_agua` | ESP32 | Backend, Web | flag; el backend mira sus transiciones |
| `ultima_conexion` | Backend | Web | NO va en el contrato; el backend estampa la hora del último `POST /estado` |
| `riego_manual` | Web (activa) / Backend (limpia) | ESP32 | comando "regar ahora"; la web lo pone en true, el backend lo limpia al detectar un `ultimo_riego` más nuevo |

---

## Reglas de boot del ESP32

1. Sincronizar hora por NTP.
2. Hacer `GET /config` y sembrar la agenda con los `ultimo_riego` recibidos.
3. Para cada maceta, próximo riego = `ultimo_riego + intervalo_horas`.
   - Si ya está vencido → regar.
   - Si no → esperar.
4. **Si `ultimo_riego` viene `null`** → setear `ultimo_riego = ahora` y esperar el primer intervalo completo. No regar en el primer arranque (evita riego fantasma al reinstalar un equipo).

### Autoridad sobre `ultimo_riego`

- **En el boot**: tomar el valor del backend.
- **En operación**: manda lo que el ESP32 tiene en RAM; el backend solo lo persiste y refleja. El valor del `GET /config` es para arranque/reconciliación, no autoridad sobre lo que el ESP32 ya sabe estando corriendo.

---

## Reglas del backend

- **Liveness**: estampar la hora de cada `POST /estado` recibido (`ultima_conexion`). La web marca "desconectado" si pasó más de ~2× el intervalo de polling. Requiere que el ESP32 postee estado periódicamente (heartbeat, ej. cada 5 min) aunque no haya regado ni cambiado nada.
- **Alerta de agua**: disparar el WhatsApp una sola vez en la transición de `hay_agua` de `true` a `false`. No reenviar mientras siga en `false` (debounce del lado del backend).
- **Seguridad**: si se expone a internet, exigir un token en cada request.

---

### Reglas de boot — riego manual

Tras el `GET /config`, si alguna maceta trae `riego_manual: true`, el ESP32 debe ejecutarlo cuanto antes (validando agua), además de evaluar el cronograma normal.

---

## Pendientes (no rompen este modelo)

- Idempotencia del "regar ahora" (cmd_id) para evitar regar dos veces si se pierde la confirmación. Hoy no está implementado.
