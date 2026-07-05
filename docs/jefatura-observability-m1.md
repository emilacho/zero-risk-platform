# JEFATURA · Observabilidad M1 · namespace `metadata.jefatura`

**Estado** · SUSTRATO $0 · **§144 STOP · SIN apply** — este M1 define el namespace + builders + queries. NO está cableado a ninguna invocación viva (ese wiring es F2+ del sprint de construcción).
**Fuente canónica** · ADR-020 Anexo M1 (P4 · pre-build · vinculante) · `SPRINT-JEFATURA-construccion-2026-07-05.md`.
**Principio (T.2 · postmortem #249)** · cada resolución deja traza §148-queryable ANTES de construirse el servicio. Es el MISMO namespace que Braintrust consume (F4.3 · spans = `review_id`).

## Por qué existe

La Jefatura es un módulo transversal de calificación (ADR-020). Antes de cablear un solo grader, se fija QUÉ escribe cada nodo a `agent_invocations.metadata` — así la calidad es medible por traza, no por fe, y Braintrust tiene sustrato desde el día 1. Hereda la condición de honestidad de F1.2: la traza **nunca miente el modelo** (`nominal_agent` + `effective_model`).

## 1 · Namespace `metadata.jefatura` (por-invocación)

En CADA invocación de jefe/scorer dentro del módulo. Builder · `buildJefaturaInvocationMeta()`.

| Campo | Tipo | Qué es |
|---|---|---|
| `review_id` | uuid | agrupa las N invocaciones de una misma pieza |
| `artifact_type` · `artifact_id` · `client_id` · `journey_id` | — | el sobre del contrato, copiado literal del intake |
| `policy_id` + `policy_snapshot {mecanismo, threshold, max_cycles}` | — | la fila de `jefatura_grading_policies` VIGENTE al decidir (auditable aunque la tabla cambie) |
| `role` | `corrector\|votante\|fidelity_scorer\|shadow\|non_voting` | rol de ESTA invocación |
| `cycle` | int 0-based | contador independiente del Lazo A · el loop-cap central se audita contra este campo |
| `nominal_agent` + `effective_model` | — | condición F1.2 · la traza NUNCA miente el modelo |
| `workflow_id` + `workflow_execution_id` | — | §149 · obligatorio |
| `braintrust_exported` | bool | fail-open honesto · declara si se exportó a Braintrust (no silencioso) |
| `contract_violations[]` | string[] | violaciones detectadas · §148-queryable (vacío = OK) |

## 2 · Veredicto `metadata.jefatura_verdict` (una vez por resolución)

En la invocación decisora (+ fila en `editorial_decisions`). Builder · `buildJefaturaVerdictMeta()`.

| Campo | Tipo | Qué es |
|---|---|---|
| `verdict` | `pass\|corrections\|escalate` | resultado |
| `vote_tally {green, amber, red}` | — | solo contenido (voto 3-de-N) |
| `scores` | record | fidelidad por campo factual + `_aggregate` (cimiento) · o confidence (contenido) |
| `corrections_count` + `corrections_ref` | — | el contrato exige **≥1 SIEMPRE** (la Jefatura corrige siempre) · 0 = bug |
| `evidence_refs[]` | `{field, chunk_id, ...}` | chunk_ids del CEREBRO usados como grounding (claim→chunk) |
| `grounding` | `chunk_linked\|prose_only` | declarado HONESTO · derivado de evidence_refs |
| `cost_usd` | float | costo de la resolución completa (suma de invocaciones) · §150 + T.3 |
| `braintrust_exported` | bool | idem |
| `contract_violations[]` | string[] | idem |

## 3 · Enforcement (se detecta en la traza · NO se pierde el registro)

Los builders NO tiran — registran las violaciones en `contract_violations[]` para que el bug sea §148-queryable:

- `corrections_count_zero` · veredicto con 0 correcciones (el contrato exige ≥1 siempre).
- `rejection_without_corrections` · un `corrections` sin correcciones (rojo sin correcciones = bug, no voto).
- `cimiento_prose_only` · un artefacto CIMIENTO (`brand_book`/`icp`/`competitive`) calificado con `grounding=prose_only`. **No se sobre-vende groundedness** — el resultado se reporta "calificado PROVISIONAL (grounded por prosa)", NUNCA "gateado por groundedness real". Es el mismo falso-verde ya cazado (dry_run≠real · sombra same-model).
- `missing_workflow_id` / `missing_workflow_execution_id` · §149.
- `cycle_exceeds_max_cycles` · loop-cap central.

### Grounding honesto (estado actual)

`deriveGrounding()` devuelve `chunk_linked` SOLO si hay evidence_refs y TODAS traen `chunk_id` real. Hoy el surfacing claim→chunk **no existe** (el `chunk_id` de la RPC del CEREBRO se descarta en `client-brain.ts:192-198` + `brain-enrichment.ts:88-91` · ver `raw/findings/2026-07-05-audit-jefatura-satelites.md`), así que el cimiento saldrá `prose_only` + violación `cimiento_prose_only` hasta que se construya el eslabón. `evidence_refs` real es el TARGET del path cimiento, no backlog eterno.

## 4 · Queries §148 predefinidas (`src/lib/jefatura/queries.ts`)

El build las deja corriendo (vistas / endpoints read-only), no las improvisa:

1. `resolutions_by_type` · resoluciones por artifact_type / cliente / período.
2. `evidence_refs_coverage` · % con evidence_refs no-vacío + % chunk_linked (meta 100% en cimiento).
3. `judge_shadow_agreement` · acuerdo judge-vs-sombra (mean_abs_delta · patrón F1.2).
4. `cost_per_resolution` · costo por resolución vs cap (§150).
5. `cycles_vs_cap` · ciclos consumidos vs max_cycles.
6. `contract_violations` · toda traza con violaciones (el bug se ve, no se pierde).

## 5 · Braintrust

Consume EXACTAMENTE este namespace (spans = `review_id`) + golden set etiquetado (§144-d) → score de acuerdo. Si falta `BRAINTRUST_API_KEY`, la traza local basta para calibración manual y `braintrust_exported=false` lo declara (fail-open honesto · no silencioso). Estado del satélite Braintrust · `raw/findings/2026-07-05-audit-jefatura-satelites.md` (scaffold cableado, env-gated OFF).

## 6 · Transporte (v1 vs sala)

En v1 (sub-workflow) NO se emiten eventos a la sala (en sombra). Cuando la sala viva, estos MISMOS campos viajan en `jefatura.resolved` — **cambia el transporte, no el contrato de traza**. El diseño no cambia.

## Qué NO hace este M1 (§144 STOP)

- NO cablea el namespace a ninguna invocación viva (los graders que lo escriben son F2+).
- NO crea la tabla `jefatura_grading_policies` ni `editorial_decisions` (esquema · fase posterior).
- NO ejecuta las queries (son plantillas · el build las expone).
- NO conecta Braintrust (requiere key · sprint aparte).
