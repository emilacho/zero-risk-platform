# RedAquario · PORTERO + TORRE DE CONTROL (§144)

Automatización de mensajes vía Slack: portero bidireccional · torre de control · latido · frenos · vocabulario de mando. Diseño canónico aprobado §144 (`zr-vault/00-meta/PORTERO-TORRE-DE-CONTROL-diseno-canonico-2026-07-20.md`).

**Estado: Fase 1 (construcción · dry-run).** Todo corre pero NO despierta a nadie ni postea: loguea lo que HARÍA. Flip a vivo = Fase 2 (config `dry_run:false` + GO explícito de Lenovo). **Nunca toca `run-sdk` ni n8n.**

## Piezas

| Archivo | Rol |
|---|---|
| `lib/gates.js` | Las **7 compuertas** (spec §Filtros 1..7) · lógica PURA testeable · el corazón |
| `lib/torre.js` | Registro de vuelos + cronómetros + catálogo de pings 🛫🛬✅⚠️🔴🔔💰 |
| `lib/spawner.js` | Traduce una decisión → el comando `claude -p …` que despertaría al empleado (dry-run lo loguea) |
| `lib/audit.js` | Log local append-only (JSONL) · una línea por acción |
| `portero.js` | Entry point · Slack Bolt Socket Mode · corre el pipeline y actúa (dry-run aware) |
| `latido.js` | Ping a Healthchecks cada 5 min (el vigilante del vigilante · spec §Pieza C) |
| `demo.js` | Demostración dry-run con 3 mensajes de ejemplo (`node demo.js`) |
| `config.json` | Mapa CC#→worktree · allowlists · topes · canal (SIN secretos) |
| `INSTRUCTIVO.md` | Setup one-time de Emilio (5 min · 2 tokens · canal) |

## Las 7 compuertas (todas deben pasar · orden vinculante)

1. **Lista blanca de remitentes** — autor no autorizado con etiqueta → ignora + alerta 🔴.
2. **Palabra de comando anclada al INICIO** — la 1ª línea arranca con el comando exacto (`DESPACHO CC#N` · `[FROM-CC#N]` · `STOP`/`GO` · vocabulario Emilio). Menciones dentro del texto = inertes.
3. **Dedup** por `message_ts`.
4. **Tope de tasa** — máx 4 arranques/hora por tipo → excedido = alerta ⚠️.
5. **Kill-switch** local (archivo `PORTERO_OFF`).
6. **STOP remoto** (solo Emilio) — frena a todos hasta un GO explícito.
7. **Marca de agua** — jamás re-procesa historial.

## Correr

```bash
node tools/redaquario/demo.js      # demostración dry-run · $0 · no despierta a nadie
node tools/redaquario/portero.js   # portero vivo (necesita los 2 tokens en el entorno · ver INSTRUCTIVO.md)
```

## Tests

Entran al gate `pnpm test` del repo (`tools/**/*.test.js` en `vitest.config.ts`). Cero infra CI nueva.

```bash
pnpm test -- tools/redaquario     # 39 tests · 7 compuertas + torre + golden
```

`@slack/bolt` se importa SÓLO en el camino vivo de `portero.js` (import dinámico) → los tests, el dry-run y la demo NO lo requieren.

## Fuera de scope Fase 1 (con GO posterior)

Activación en vivo (Fase 2: cap 1/hora supervisado → Fase 3: régimen) · integración latido↔Healthchecks real (necesita el check creado). La silueta de mensajes no se toca sin §144 explícito.
