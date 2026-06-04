# `sala-journey-state` · library interface

Sprint 12 Fase 0 Ronda 3 Track F · CC#1.

**Pure projection** sobre `sala_event_log` que canon canonical-deriva el journey state de un stream (journey + current_step + status + pending gates/judgments + budget count). Es lo que el **router** (Track H) lee para saber "dónde está" cada cosa.

**Built on top of** · `src/lib/sala-event-log/` (Track A · PR #143).

---

## Idea canónica

El estado del journey NO vive en una tabla. Se deriva proyectando los eventos del log en orden de `sequence`. Replayable · canon-rebuildable · cero estado mutable paralelo.

El router consume esta projection + el blackboard + el libreto para decidir el próximo dispatch (Track H · `decide({event, blackboard}) → Dispatch[]`).

## Quick start

```ts
import {
  readJourneyState,
  projectJourneyState,
  type JourneyState,
} from '@/lib/sala-journey-state'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'

const storage = new InMemoryEventLogStorage()

// canon · router (o cualquier consumer) lee el estado actual
const state: JourneyState = await readJourneyState(storage, {
  tenant_id: '...',
  stream_id: '...',  // = campaign instance
})

// canon canon canon · ejemplo de uso (lo que el router hace después)
switch (state.status) {
  case 'idle':           // canon · nuevo · canon canon-canon-canon-arrancar
  case 'running':        // canon · canon canon-canon-canon-step activo · canon canon-canon-canon-NO interfere
  case 'awaiting_gate':  // canon · canon canon-canon-canon-router emite `gate_resolved` cuando aterrice
  case 'awaiting_judgment': // canon · canon canon-canon-canon canon-canon canon-canon-canon-canon-coordinator-agent o HITL resuelve
  case 'blocked':        // canon · canon canon-canon-canon-budget cap · canon canon-canon-canon-router decide retry o canon canon-canon-canon-escalate
  case 'step_failed':    // canon · canon canon-canon-canon-router consulta libreto · canon canon-canon-canon-canon-retry o canon canon-canon-canon-handoff
  case 'step_done':      // canon · canon canon-canon-canon-router consulta libreto · canon canon-canon-canon-canon-next step o terminal
}
```

---

## API

### `readJourneyState(storage, input)`

Lee eventos de `sala_event_log` para `(tenant_id, stream_id)` y proyecta el estado actual.

- REQUIERE `tenant_id` + `stream_id` (RLS-respected · defense in depth)
- `since` / `until` opcional · canon-time-window snapshot (rollback view · canon-recent-only view)
- `max_events` opcional · default 1000 (cap del log subyacente)
- order interno fijo · `sequence_asc` (canon-canonical replay)

Retorna `JourneyState`. Idle si no hay eventos.

### `projectJourneyState(events, options?)`

Pure function · canon-canonical core de la lib. Toma `PersistedEvent[]` y devuelve `JourneyState`.

- `options.tenant_id` / `options.stream_id` filtros opcionales (canon-defense in depth)
- Sort estable por `sequence` ascending
- Fold sobre eventos · actualizando state per event_type
- Sin IO · sin side-effects · deterministic

---

## `JourneyStatus` enum · canon canon canon-7 valores

| Status | Condición canon canonical |
|---|---|
| `idle` | canon · no events scanned |
| `running` | canon · step activo · canon-canon-no pending gates/judgments · last event NOT terminal-ish |
| `awaiting_gate` | canon · 1+ `gate_pending` unresolved (canon-canon-camino_iii / hitl / §144) |
| `awaiting_judgment` | canon · 1+ `needs_judgment` unresolved (§H-a off-script handler) |
| `blocked` | canon · último event = `budget_blocked` · canon-canon-router decide retry/escalate |
| `step_failed` | canon · último event = `step_failed` · canon-canon-router consulta libreto canon-retry |
| `step_done` | canon · último event = `step_completed` sin handoff posterior · canon-canon-pending next dispatch |

**Out of scope · §148 honest** ·
- `done` / `aborted` (terminal) · canon canon-canon-canon canon-canon-router decide via libreto · NOT here
- `next_step` suggestion · canon canon-canon-canon canon-canon-Track G interpreter owns
- retry strategy · canon canon-canon-canon canon-canon-router decide via libreto

Priority resolution canon canonical · `awaiting_judgment` > `awaiting_gate` > terminal-ish (`blocked`/`step_failed`/`step_done`) > `running`. §H-a off-script precede gates.

---

## `JourneyState` shape

```ts
interface JourneyState {
  stream_id: string
  tenant_id: string
  journey: string | null              // canon · journey_type del libreto
  client_id: string | null
  current_step: string | null         // canon · step_id del último evento step-anchor
  current_step_state: 'pending' | 'running' | 'done' | 'failed' | null
  current_step_attempt: number | null
  status: JourneyStatus
  pending_gates: PendingGate[]        // canon · gate_pending sin gate_resolved
  pending_judgments: PendingJudgment[] // canon · needs_judgment sin judgment_resolved
  budget_blocked_count: number        // canon · contador acumulativo
  correlation_id: string | null
  last_event_id: string | null
  last_event_type: EventType | null
  last_event_at: string | null
  last_sequence: number
  total_events_scanned: number
  projected_at: string                // canon · ISO timestamp
}
```

---

## Convención canon · gate/judgment pairing

- **gate_pending** push a `pending_gates[]`
- **gate_resolved** pop por `causation_id === gate_pending.event_id`
- **FIFO fallback** canon-canon-canon-canon canon-canon-canon-si `causation_id` missing · pop el oldest (defense · canon-canon-router SHOULD set causation_id pero la projection no crashea si no)
- Mismo patrón canon canon canon-canon-canon-canon-`needs_judgment` / `judgment_resolved`

## Convención canon · budget_blocked

- **Counter acumulativo** · NO se "resuelve" automáticamente
- canon-canon-router decide retry vía nuevo `dispatch_requested` (que cambia `last_event_type` → status canon `running`)
- canon-canon-router decide escalate · puede emitir `needs_judgment` (status → `awaiting_judgment`)

---

## §148 honest

- **Pure function · sin IO** · canon-canonical-deterministic · canon-canonical-replayable
- **In-memory storage adapter** (de Track A · PR #143) es canon-canonical-test substrate. Real Supabase canon-canon-NO exercised hasta §144.
- **Tests shadow-only** · 35 nuevos cases · 0 DB touch · 0 prod
- **NO declara terminal** · canon-canon-router consulta libreto (Track G) para `done`/`aborted`
- **§H-a awaiting_judgment precede awaiting_gate** · canon-canon-canon canon-canon canon-canon-priority design (off-script handler primary)
- **FIFO fallback en gate/judgment pairing** · canon-canon-defense in depth · canon-canon-router SHOULD set causation_id

## Flag interface assumptions para Track H router consumer

Si Lenovo+Opus quieren ajustar canon canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-:

1. **Status enum (7 vals)** · canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-`done`/`aborted` quedaron canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-fuera por design (router decide). Si quieren agregarlos · canon canon canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-easy extension.
2. **Status priority** · `awaiting_judgment > awaiting_gate > terminal-ish > running`. Si quieren canon canon canon-canon canon-canon-canon-flip gate primero · canon-canon-canon-canon-1-line change.
3. **FIFO fallback** · canon canon-canon-canon-canon-canon-canon-canon-canon-canon-router SHOULD set causation_id en gate_resolved/judgment_resolved · canon canon canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-fallback es defense.
4. **`budget_blocked_count` acumulativo** · canon canon-canon-canon-canon-canon-canon-canon-canon-canon-router decide cuando "resolver" (canon-canon-canon-emitir dispatch nuevo).
5. **`projected_at` snapshot timestamp** · canon canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-NOT cached internally · canon canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-canon-recompute per call · canon-canon-canon-fresh.
