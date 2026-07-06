# JEFATURA · módulo de calificación · contrato + registry (F0.2 + F0.3)

Sprint JEFATURA · Fase 0 · **CC#2** · ADR-020. **Diseño $0 · PR+doc · NO aplicado a prod.**

La Jefatura es **UN** módulo de calificación con graders distintos por CLASE DE ARTEFACTO. Un solo servicio; adentro, la mecánica se elige por el **tipo** de lo que se le entrega — no por qué workflow lo pidió. *Una sola cosa califica; cualquier workflow que reimplemente calidad adentro es un bug, no una función* (ADR-020 §36).

> **Estado:** contrato + registry DISEÑADOS ($0). El servicio que los consume (F1.1 · generalizar Lazo A + fidelidad + voto 3-de-N) y el `apply` de la migración son build **post-GO de Emilio**.

## F0.3 · Contrato único (`contract.ts`)

Cualquier productor entrega un **sobre uniforme** y recibe un **veredicto uniforme**. La Jefatura no sabe ni le importa qué workflow la llamó.

### Entrada · `JefaturaInput`
```ts
{ artifact_type, artifact_id, client_id, journey_id, payload }
```
- `artifact_type` gobierna todo el tratamiento (vía el registry).
- `payload` = draft + evidencia (shape libre por tipo).

### Salida · `JefaturaOutput`
```ts
{ corrections[], verdict, scores, trace_id }
```
- `corrections[]` · objetos accionables `{eje, severidad, dónde, problema, por_qué, cambio_sugerido}` (formato SPEC-lazo). Los jefes DIAGNOSTICAN · el **creador original** corrige (no-auto-calificación).
- `verdict` · `PASS | REJECT | ESCALATE | CORRECTED`. Un `REJECT` sin `corrections` es un bug (ADR-020 §58).
- `scores` · `fidelity` (cimiento) | `votes {green,amber,red,total}` (contenido).
- `trace_id` · enlace de observabilidad (`agent_invocations.metadata` · sustrato de Braintrust · M1/F4.3).

**Transporte (fasing v1 · ADR-020 §89):** hoy = sub-workflow llamado por contrato (`executeWorkflowTrigger`). Cuando la sala se encienda → mismo contrato, cambia el transporte a event-driven (`artifact.ready` → router → Jefatura → `jefatura.resolved` → router reanuda).

## F0.2 · Registry determinista (`jefatura_grading_policies`)

Tabla `artifact_type → política` (espejo del `routing_rules` de la sala). **Añadir un tipo nuevo (email · landing) = UNA fila**, no un workflow (ADR-020 §44). Migración single-file · `supabase/migrations/202607051200_jefatura_grading_policies.sql` (**NO aplicada**).

### Dos clases (ADR-020 §50)

| artifact_class | CORRECCIÓN (siempre) | JUICIO (gate) | Grader canon | Contrapeso (no bloquea) | fidelity_threshold | max_cycles |
|---|---|---|---|---|---|---|
| **cimiento** (brand_book · icp · competitive) | ✅ Lazo A | ❌ (circular) | `fidelity` ≥0.85 | `shadow_scorer` (dead-end) | 0.85 | 1 |
| **contenido** (ad_creative · copy · email · landing) | ✅ correcciones | ✅ voto 3-de-N vs brand book | `vote_3_of_n` | `gpt55_non_voting` (caza punto ciego) | NULL | 1 |

### Invariantes forzados por CHECK constraints
- **No-circularidad (§4 · no-negociable):** `NOT (cimiento AND judgment_enabled)` — el cimiento jamás gatea por voto (votar calidad sobre lo que *define* la calidad es circular).
- **Consistencia grader↔clase:** cimiento ⇒ `fidelity` · contenido ⇒ `vote_3_of_n`.
- **Loop-cap central (§7 · §121):** `max_cycles BETWEEN 1 AND 3` · default 1 (más seguro que ≥3 · no puede loopear · lección bb-worker degenerado).

### Umbrales de voto (contenido · `vote_config` JSONB · verificado `lib/camino-iii/tabulate.ts`)
```
≥2 green AND 0 red → approved · ≥2 red → reject · resto → HITL
amber = advisory (fuera del tally) · red REQUIERE ≥1 corrección
```

## Satélites (fuera del path bloqueante · ADR-020 §64-68)
- **Fidelidad** = grader del cimiento (automático · `emit_fidelity_scores`). NO es un jefe.
- **Braintrust** = calibración ENCIMA (mide si los graders califican bien · consume trazas via `trace_id`). NO califica artefactos · NO vota.
- **GPT-5.5** = cross-model `non_voting` (caza punto ciego en contenido · scorer sombra en cimiento). Ninguno gatea.

## Pendiente (post-GO · fuera de F0)
- Aplicar la migración a prod (build · §144 GO).
- F1.1 · generalizar los 3 graders existentes en el servicio que lee esta tabla.
- Corregir drift CLAUDE.md §10.1 ("2 revisores Haiku" → 3 jefes sonnet · auditoría CC#2 2026-07-05).
