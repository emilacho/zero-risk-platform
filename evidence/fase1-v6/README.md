# FASE 1 v6 · registro versionado de la obra sobre los 2 procesos vivos

**Ejecutó:** CC#2 · **Fecha:** 2026-07-30/31 · **Ratificó:** Emilio (huella-v2 + go · protocolo §6)
**Plan:** `zr-vault/raw/tasks/2026-07-30-FASE1-v5-restaurar-productor-plan.md` (set final v6)
**Por qué existe este registro:** el cambio del 01-jul se hizo **con 3 ediciones directas en n8n y sin commit** — nadie pudo rastrear qué se apagó ni cuándo. El plan v6 exige que esta obra quede **con rastro**. Esto es ese rastro.

## Qué se tocó

| Proceso | Antes | Después | Estado |
|---|---|---|---|
| `ssLtwYPt7zxuvnM2` (el productor) | 20 nodos · 17 conexiones · **activo** | 20 nodos · 17 conexiones | **PAUSADO** |
| `LyVoKcrypS5uLyuu` (el onboarding) | 83 nodos · 68 conexiones · pausado | **73 nodos · 58 conexiones** | **PAUSADO** |

### Pieza A · restaurar el escritor (4 cambios en `ssLtw`)
1. `[BB] Promote prep` → encendido
2. `[BB] Promote → canon` → encendido
3. `[BB] IF · fidelidad PASS` main#0 → **`[BB] Promote prep`** (antes iba a `Return scores a parent`)
4. `[BB] Promote → canon` main#0 → **`Return scores a parent`** — **reemplaza** la arista a `[BB] Trigger Onboarding Report` (no se suma). Sin esta arista la rama PASS moría y P4 se invertía: emitiría `cimiento.failed` justo cuando el manual se escribió.

### Pieza B · `website` opcional
`Validate Deal Data` deja de exigirlo. Sin web el cimiento sale marcado **`provisional`** (no se para el proceso, pero el registro no miente).

### P3 · endurecimiento (2 líneas, sin cambio de comportamiento hoy)
En `[BB] Promote prep` y `[BB] Judge prep` la precedencia del `||` estaba al revés: tomaba el `client_id` del **borrador del modelo** primero y el validado de reserva. Invertida — **la salida del modelo ya no puede controlar la dirección de escritura**.

### Hook de honestidad
`gated_fields_only: true` y `provisional` se estampan **dentro de `brand_book`** (arriba, en el nivel superior, el endpoint los descarta). El registro dice qué se calificó de verdad: voz/ángulo/retención **no** están gateados.

### Pieza C · corte en `LyVoK` · 13 nodos fuera, 3 nuevos
- **Fuera (13):** el gate del padre (`grade-cimiento`, `Aserción identidad`, `IF promote`, `Promote → canon`, `log-invocation`), todo el lazo `[JEF]` (7 nodos) y `Persist Canon`.
- **E3 · la cascada no muere:** `[APIFY-WIRE] IF · Camino III decision` main#0 → **`Spell Check Pass (in-cascade)`** (adonde apuntaba `Persist Canon`).
- **P4 · el corazón de la honestidad:** `[JEFATURA] Execute Cimiento Track` main#0 → **`IF track_pass`** → pass → `cimiento.promoted` · fail → **`cimiento.failed`** → **`Stop and Error`**. El error del sub-proceso (main#1) va al mismo `Stop and Error`, nunca a un Wait muerto.
- El bloque `[JEF]` **no se tira**: queda archivado en `ARCHIVO-bloque-JEF-para-fusion.json` para la fusión.

## Verificación

`VERIFICACION-local.txt` (antes de tocar nada) y `VERIFICACION-post-obra.txt` (contra el vivo). Ambas en verde:

| # | Chequeo | ssLtw | LyVoK |
|---|---|---|---|
| V1 | nodos | 20 ✅ | **73** ✅ (derivado: 83 − 13 + 3) |
| V2 | conexiones | 17 ✅ | 58 ✅ |
| V3 | aristas colgando | 0 ✅ | 0 ✅ |
| V4 | huérfanos nuevos no previstos | 0 ✅ | 0 ✅ |
| V5 | **huella de los nodos intactos** | idéntica (16) ✅ | **idéntica (70)** ✅ |
| V6 | settings vs baseline | sin diferencias ✅ | sin diferencias ✅ |
| V7 | `active` | false ✅ | false ✅ |

**V5 es el chequeo que importa:** prueba que de los 70 nodos que sobreviven en el onboarding **no se movió ni un byte** — lo único que pasó fue el corte intencional.

**Huérfano nuevo aceptado a propósito:** `[BB] Trigger Onboarding Report` queda sin entrada. Lo ordena el plan (A4, rec. CC#3): el nodo ya estaba apagado, y es preferible un nodo apagado inerte a una arista muerta. La verificación lo declara explícito en vez de esconderlo.

## INCIDENTE · una sonda mía sí mutó el proceso

Buscando qué campo de `settings` rechazaba la API, mandé sondas con un payload recortado **a 1 nodo**. Asumí que servirían solo para leer el código de error. **La que devolvió 200 se aplicó**: `LyVoKcrypS5uLyuu` quedó ~1 minuto con **1 nodo y 0 conexiones**.

- **Restaurado** de inmediato al estado objetivo (73/58) desde el payload ya compuesto.
- **Impacto real: ninguno.** El proceso estaba **pausado** y la última ejecución es del **24-jul** — nada corrió contra la versión rota. Verificado, no supuesto.
- **La causa:** probé sobre el objetivo real en vez de sobre una copia. **La regla que faltaba:** una sonda de esquema se hace contra un proceso descartable, o con el payload COMPLETO, nunca con uno recortado sobre el vivo.

## Reversión

Un `PUT` de cada baseline archivado acá:

| Proceso | Punto de retorno |
|---|---|
| `ssLtwYPt7zxuvnM2` | `BASELINE-ssLtw-…json` · versionId `f7d2865b-96f6-4583-abdb-2f305b628cf0` · 20 nodos · **+ `POST /activate`** (estaba activo antes) |
| `LyVoKcrypS5uLyuu` | `BASELINE-LyVoK-…json` · versionId `36c2e165-3ee7-49f2-80a1-84d34a8bf99f` · 83 nodos · **sin** `/activate` (ya estaba pausado) |

**Ojo con la API:** al hacer `PUT` hay que sacar de `settings` las claves `availableInMCP` y `binaryMode` — el esquema público las rechaza. n8n conserva sus valores igual (verificado en V6: el `settings` post-obra es idéntico al baseline).

## Lo que NO se hizo

- **No se reactivó el onboarding** — sigue pausado hasta la prueba paga.
- **`ssLtw` quedó pausado** aunque antes estaba activo. Decisión conservadora, no del plan: el escritor quedó re-armado y su webhook de prueba estaba expuesto. Revertir es una llamada (`POST /workflows/ssLtwYPt7zxuvnM2/activate`).
- **Sin renombres** durante el corte, como exige el plan.
- **Nada se ejecutó**: cero corridas, cero gasto.
