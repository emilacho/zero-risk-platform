# E39 · los tres renglones · la casilla «qué es el negocio» hasta el manual

**CC#2 · 2026-09-15 · US$ 0,00.** Encargo `E39` · medición previa de CC#3 en `E38`.

`nodos/` tiene el código de los **tres filtros publicados**, copiado tal cual del motor y con
**un renglón agregado en cada uno**. **Lo que se publica es exactamente lo que corre la prueba**
`__tests__/discovery-casilla-negocio-hasta-el-manual.test.ts` — la prueba no los describe: los CORRE.

| archivo | nodo | flujo | por qué |
|---|---|---|---|
| `1-discovery-parser.js` | `[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)` | `LyVoKcrypS5uLyuu` (apagado) | reconstruye el paquete campo por campo |
| `2-jefatura-transform.js` | `[JEFATURA] Transform discovery→package` | `LyVoKcrypS5uLyuu` (apagado) | lo vuelve a reconstruir |
| `3-bb-fan-out-prep.js` | `[BB] Fan-out prep` | `ssLtwYPt7zxuvnM2` (apagado) | arma la evidencia de las 3 lentes |

**Origen medido antes de tocar** · `LyVoKcrypS5uLyuu` versionId `881c48ea` · 83 nodos · activo `false`
· `ssLtwYPt7zxuvnM2` versionId `5dfe4157` · 30 nodos · activo `false`.
**Respaldo íntegro de los dos flujos** · `zr-vault/raw/backups/2026-09-15-e39-antes-de-publicar/`.

🔴 **La casilla NO está en `_SACRIFICIO_EV`, a propósito.** El orden de sacrificio del pedido es
`apify_sources → competitors → discovery_summary`: **el resumen es sacrificable, qué ES el negocio no.**
