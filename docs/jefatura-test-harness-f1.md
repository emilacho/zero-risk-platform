# JEFATURA · Harness de test $0 · protocolo del consejero (19:37)

**Estado** · $0 · **§144 STOP · SIN apply** — mocks + funciones puras · cero corridas reales · cero prod.
**Fuente** · protocolo de prueba a $0 del consejero (19:37 · SPRINT-JEFATURA §9) + observabilidad M1 (#277).
**Límite duro (§148 · regla Q1/dry_run)** · los mocks dan **AMPLITUD, JAMÁS cierran un hito** · mock verde ≠ real verde. UNA corrida real (F2.2 · Peniche ~$2-3) cierra el hito **y** siembra estos fixtures desde traces reales.

## Piezas

| Archivo | Qué es |
|---|---|
| `src/lib/jefatura/resolution.ts` | driver de resolución PURO · dependency-injected · ata scorer→§7→jefes→triage→creador→re-puntúa · emite la traza M1. F2 le inyecta deps run-sdk reales; el harness inyecta golden. |
| `src/lib/jefatura/testing/golden-graders.ts` | transcripciones GOLDEN (scorer/jefes/creador scripteados por ciclo) + biblioteca de escenarios (felices + de falla). |
| `__tests__/jefatura-harness.test.ts` | el harness $0 · E2E golden + verificación por traza + no-circularidad. |

## Qué cubre (protocolo del consejero)

1. **Decider determinista → truth-tables $0.** Cada rama de §7 (pass · escalate-cap · escalate-sin-bloqueantes · stop_best · correct) y la no-circularidad se ejercitan sobre las funciones puras de #280-#283 (correction-loop + tabulador + contrato).
2. **Aserción NEGATIVA de no-circularidad (§4).** El cimiento NUNCA alcanza el path del voto: ninguna traza de cimiento tiene `role='votante'`, el grader es `fidelity_scorer` (jamás voto), `vote_tally` es undefined. El contenido sí vota, el cimiento no · nunca se cruzan.
3. **Bocas LLM → golden transcripts.** El flujo E2E completo corre casi gratis · rutas felices (pass · correct→pass · voto aprueba) y de falla (cap · monotonic-stop · irreconciliable → todas ESCALATE).
4. **Verificación POR TRAZA (no re-corriendo).** Espejos JS de las queries §148 (#277) asertan sobre `metadata.jefatura` + `metadata.jefatura_verdict`: `review_id` · `scores` · `verdict` · `corrections_count≥1` · `evidence_refs`/`grounding` · `cost_usd` (suma de invocaciones). El `cimiento_prose_only` se ve en la traza cuando no hay chunk_id (no se sobre-vende groundedness).

## Escenarios golden

| Escenario | Clase | Resultado esperado |
|---|---|---|
| `G_CIMIENTO_PASS` | cimiento | PASS · 0 ciclos · chunk_linked |
| `G_CIMIENTO_CORRECT_THEN_PASS` | cimiento | PASS · 1 ciclo (corrige rojo factual) |
| `G_CIMIENTO_CAP_ESCALATE` | cimiento | ESCALATE (cap agotado) · prose_only |
| `G_CIMIENTO_MONOTONIC_STOP` | cimiento | ESCALATE (§7.6 · re-síntesis no sube fidelidad) |
| `G_CIMIENTO_IRRECONCILABLE` | cimiento | ESCALATE (§7.4 · dos rojos cruzando ejes) |
| `G_CONTENIDO_VOTE_PASS` | contenido | PASS (voto 3-de-N) |

## Operativo F2.2 (registrado · no ejecutado acá)

La corrida real de Peniche cierra el hito **y** captura traces + outputs de cada jefe/scorer/creador como fixtures golden → regresión futura replaya a $0 (pagar una vez, replicar gratis). Los `goldenDeps`/escenarios de acá son el molde que esas capturas rellenan.

## Qué NO hace (§144 STOP)

- NO invoca ningún LLM · NO corre en prod · NO cierra ningún hito (solo amplitud).
- NO cablea el driver a run-sdk (eso es F2 · el seam es `ResolutionDeps`).
