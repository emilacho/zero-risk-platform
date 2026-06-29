# Brand Book · track colaborativo cero-humano · worker `LyVoKcrypS5uLyuu`

**CC#4 · 2026-06-29 · SHADOW · NO prod sin §144 de Emilio · consejero revisa el PR.**

## Causa raíz (CC#4 §148)
`Persist Canon · brand_book` estaba downstream del gate **Camino III PASS** (`IF · Camino III decision`) → nunca corría → `client_brand_books = 0`. (ICP/competitive sí escriben por emit directo · 10 + 21 rows.) Evidencia · exec 40004 · esos nodos `SKIP` (ruta "observar"→HITL). Spec · `SPEC-brand-book-build-colaborativo-cero-humano-2026-06-29.md`.

## Fix · track propio post-FASE-2, canon por FIDELIDAD (no por voto)
El builder `build-brand-book-rewire.mjs` produce `rewired-worker.json` (62 nodos = 51 base + 11) desde la base live, determinístico, sin tocar el worker vivo.

Flujo nuevo (cableado · ver test `__tests__/brand-book-rewire.test.ts`):
```
Aggregate Service responses (FASE 2)
  └─ [BB] Fan-out prep
       ├─ Lente · brand-strategist     (posicionamiento + ICP)
       ├─ Lente · editor-en-jefe       (voz + forbidden_words + required_terminology)
       └─ Lente · jefe-client-success  (ángulo cliente / retención)
            └─ [BB] Consolidador (maker · funde las 3 lentes en 1 borrador)
                 └─ [BB] Lazo A · corrección (sub-wf)   ← consejero §1 · sub-workflow separado
                      └─ [BB] Faithfulness judge (LLM-judge DIY · per-field ≥0.85)
                           └─ [BB] IF · fidelidad PASS
                                ├─ true  → [BB] Promote → canon  (POST /api/clients/{id}/brand-book · fidelity_passed)
                                └─ false → [BB] IF · ciclos agotados
                                             ├─ true  → [BB] HITL último recurso (NO Emilio)
                                             └─ false → [BB] Consolidador (re-síntesis · cap 3)
```
**Des-gateado** · el viejo `Persist Canon` queda marcado `[BB-REWIRE]` (ya NO persiste brand_book) · ICP/competitive mantienen su path. Camino III sigue gobernando el **contenido**, no el cimiento.

## Decisiones consejero aplicadas
1. Lazo A · **sub-workflow separado** (Execute Workflow · `BB_CORRECTION_SUBWORKFLOW_ID`). **(follow-up · ver abajo)**
2. Scorer fidelidad · **LLM-judge DIY in-stack** (`/api/agents/run-sdk` · editor-en-jefe · per-field ≥0.85) · sin RAGAS/DeepEval (Python/§151).
3. Staging · **en memoria** (data del workflow) · escribe `client_brand_books` recién en PASS de fidelidad.
4. CC#4 lidera el worker · el judge es HTTP-via-code (no necesita endpoint nuevo de CC#2).

## Estado · qué está en este PR vs follow-up
- ✅ Steps 0,2,3,5,6,7 · nodos + cableado + des-gateo + node code + tests.
- ✅ **Step 4 (Lazo A) · sub-workflow de corrección construido** · `correction-subworkflow/` (9 nodos · builder `build-correction-subworkflow.mjs` → `correction-subworkflow.json`). Loop self-contained máx 3 ciclos: trigger → review prep → 3 jefes diagnostican (correcciones accionables `{eje,severidad,donde,problema,por_que,cambio_sugerido}`) → merge → IF seguir · true→re-síntesis (consolidador maker)→loop · false→exit. NO vinculante (la fidelidad decide canon). El nodo `[BB] Lazo A` del worker lo invoca vía `BB_CORRECTION_SUBWORKFLOW_ID` (asignado al importar el sub-wf a n8n).
- 🟡 **Validación E2E real** · post-§144 · al deployar worker + sub-wf a n8n live · smoke que confirme `client_brand_books` > 0. No testeable en shadow (no toco el worker vivo).

## Reconstruir sub-workflow
`node scripts/worker-staging/LyVoKcrypS5uLyuu/brand-book-track/correction-subworkflow/build-correction-subworkflow.mjs`

## Reconstruir
`node scripts/worker-staging/LyVoKcrypS5uLyuu/brand-book-track/build-brand-book-rewire.mjs`
