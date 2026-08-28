# Segunda fase del alta · foto del worker vivo

`live-worker-2026-08-28.json` — **exportación literal** de `LyVoKcrypS5uLyuu` bajada
del n8n de producción el **2026-08-28** (`GET /api/v1/workflows/...`).
73 nodos · `active: false` (pausado desde el 27-ago) · `updatedAt: 2026-08-09T12:08:06.566Z`.

**No contiene credenciales**: ningún nodo declara bloque `credentials`; los secretos
viajan por `$env.*` en tiempo de ejecución.

## Para qué está acá

Es el sujeto de `__tests__/segunda-fase-alta-rewire.test.ts`. La suite afirma el estado
**objetivo** del re-cableado, así que **contra esta foto tiene que dar ROJO**: 9 fallan
(el objetivo) y 8 pasan (control positivo + guardias). Una prueba que pasa antes del
arreglo está mirando otra cosa.

## ⚠️ El nombre del workflow viene mal codificado DESDE n8n

```
"name": "Zero Risk â€” Client Onboarding E2E v2 (Webhook: Deal Won)"
```

Los bytes que manda el servidor son `c3 a2 e2 82 ac e2 80 9d` — UTF-8 válido, pero
codificando `â` `€` `"`: es el rastro de un guión largo (U+2014) leído como Windows-1252
y re-codificado. **El defecto está guardado en n8n, no en la descarga**: se reproduce con
`Content-Type: application/json; charset=utf-8` y decodificación explícita.

Lo mismo ocurre en las `notes` de `Trigger Master Journey ugK3` y `Spell Check Pass (in-cascade)`.

🔴 **La foto se deja TAL CUAL, sin corregir.** Si algún día se hace `PUT` de este JSON,
"arreglar" el nombre sería un cambio no pedido a producción — y dejarlo así garantiza que
el `PUT` no altere nada que no esté en el alcance. Si se decide corregirlo, que sea una
decisión explícita y aparte.

## Contexto medido

- `raw/findings/2026-08-28-CC3-AUDITORIA-ADVERSARIAL-el-alta-esta-cortada-a-la-mitad.md`
- `raw/findings/2026-08-28-CC3-el-orden-real-de-la-cola-y-que-rompe-el-recorte.md`
- `raw/tasks/2026-08-28-DECISION-EMILIO-alcance-de-la-segunda-fase.md` — alcance: 9 nodos + cierre

## Lo que el re-cableado tendrá que hacer

```
1. crear   [MODELB] Emit · cimiento.promoted → Create Notion Client Workspace
2. crear   Schedule Kickoff Call (Cal.com)   → Alert Slack: Onboarding Initiated
3. crear   Alert Slack: Onboarding Initiated → [MODELB] Write-back Callback · run terminal
4. borrar  las líneas "handoff_score" y "mc_inbox" del `summary` del Write-back Callback
```

Los 4 nodos de fase B y los 5 de la cascada **se desconectan, no se borran**.
