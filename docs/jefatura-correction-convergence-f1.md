# JEFATURA · F1 · Lazo A generalizado + convergencia §7

**Estado** · $0 · **§144 STOP · SIN apply** — funciones puras + tests. NO cablea ninguna invocación viva (el wiring de jefes/creador es F2+). Stackeado sobre #276 (contrato F0).
**Fuente** · ADR-020 §3 (corrección = función base) + §7 (convergencia y autoridad) + observabilidad M1.
**Módulo** · `src/lib/jefatura/correction-loop.ts` · **principio raíz: una vara objetiva decide; los opinantes solo aconsejan.**

## Formato de corrección (contrato F0 · SPEC-lazo §6)

Los 3 jefes DIAGNOSTICAN emitiendo `JefaturaCorrection` (de `contract.ts`):
`{ eje, severidad, donde, problema, por_que, cambio_sugerido }` · `eje ∈ {factual, voz, posicionamiento, cliente}` · `severidad ∈ {rojo, ambar}`. El **creador original** integra (los jefes nunca reescriben · no-auto-calificación).

## Mapeo §7 → código

| §7 | Regla | Implementación |
|---|---|---|
| 7.1/7.2 · la vara decide | 3 jefes = asesores · decide fidelidad ≥0.85 (cimiento) / voto (contenido) | `decideConvergence()` · `barPassed` computa la vara · nunca "jefes satisfechos" |
| 7.3 · severidad | solo ROJO itera · ámbar es advisory (no cicla) | `triageCorrections()` · ámbar → `advisory` |
| 7.3 · relevancia-al-gate | solo lo que mueve la métrica objetiva itera · estilístico = advisory siempre | `DEFAULT_CIMIENTO_GATE_RELEVANT_EJES = {factual, posicionamiento}` · voz/cliente → advisory |
| 7.3 · perilla de Emilio | en cimiento solo groundedness/hecho bloquea · tuneable | `TriageOptions.gateRelevantEjes` override |
| 7.3 · presupuesto top-N | solo las rojas top-N llegan al creador · FOCALIZA, no aprueba | `topN` (default 5) · las extra → `deferred_blocking_count` (no ocultas · la vara re-puntúa) |
| 7.4 · dueño-de-eje | cada jefe posee un eje · su corrección precede | `AXIS_OWNER` + `orderByAxisPrecedence()` |
| 7.4 · el creador integra | cross-eje lo integra el creador con TRIAGE · no "aplicar todas" | `buildCreatorReSynthInput()` · instrucción de triage |
| 7.4 · irreconciliable → humano | dos rojos cruzando ejes en el mismo `donde` con cambios distintos | `detectIrreconcilable()` → ESCALATE |
| 7.5 · cuándo para | (a) vara pasa → LISTO · (b) cap agotado → HUMANO | `decideConvergence()` · `pass` / `escalate` |
| 7.6 · progreso monótono | re-síntesis que no sube la fidelidad → STOP + mejor versión | `decideConvergence()` · `stop_best` (moot en cap=1 · seguro para ≥3) |

## Decisión de convergencia (determinista · orden de prioridad)

`decideConvergence(state, triage, policy, irreconcilable)` →
1. vara pasa → **`pass`** (no se corrige lo que ya pasa · la vara es el techo)
2. cap agotado → **`escalate`** (a humano · nunca a un jefe)
3. irreconciliable → **`escalate`** (salida honesta · §7.4)
4. vara falla + sin bloqueantes accionables → **`escalate`** (gaps sin resolver → humano · §7.3)
5. progreso no-monótono (cimiento · cap>1) → **`stop_best`** (§7.6)
6. si no → **`correct`** con las bloqueantes top-N (re-síntesis del creador)

## Observabilidad (M1)

El `cycle` viaja al namespace `metadata.jefatura` · el loop-cap central se audita contra ese campo · `corrections_count` = |blocking| + |advisory| (≥1 siempre) · el `stop_best`/monótono es medible por traza (`cycle` + scores por ciclo), no por fe. Ver `docs/jefatura-observability-m1.md`.

## Qué NO hace (§144 STOP)

- NO invoca jefes ni creador (funciones puras · el wiring es F2+).
- NO decide por su cuenta en prod · es la lógica que el orquestador de la Jefatura consumirá.
- NO toca el contrato F0 (#276) · lo importa.
