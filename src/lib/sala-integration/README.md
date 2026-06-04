# `sala-integration` · shadow E2E harness

Sprint 12 Fase 0 Ronda 3 Track K · CC#1.

**Composición de los 4 libs CC#1 + motor CC#4 + libretos CC#4** en un loop E2E shadow. Router (Track H · CC#3) + Interpreter (Track G · CC#4) quedan STUB hasta que aterricen · canon canon-cuando aterricen, swap stubs por reales.

## Wire diagram canon canonical

```
                            ┌──────────────────┐
                            │  sala-event-log  │  (Track A · PR #143)
                            │   ┌──────────┐   │  (Track J · PR #147 · Supabase)
                            │   │   log    │   │
                            │   └──────────┘   │
                            └────────┬─────────┘
                                     │ append + read
                                     ▼
              ┌──────────────────────┴───────────────────────┐
              │           PROJECTIONS (Tracks D + F)         │
              │  ┌────────────────┐  ┌────────────────────┐  │
              │  │  blackboard    │  │  journey-state     │  │
              │  │  (artifacts)   │  │  (status + pending)│  │
              │  └────────────────┘  └────────────────────┘  │
              └──────────────────────┬───────────────────────┘
                                     │ state
                                     ▼
                             ┌───────────────┐
                             │  STUB ROUTER  │  (canon canon-canon-this lib · Track H placeholder)
                             │   .decide()   │  (canon canon-canon-CC#3 aterrice → real)
                             └───────┬───────┘
                                     │ DispatchDecision
                                     ▼
                             ┌───────────────┐
                             │   HARNESS     │  (canon canon-canon-this lib)
                             │  applyDecision│
                             └───────┬───────┘
                                     │ append
                                     ▼
                            (back to event-log)
```

**Libretos** (canon-Track E · PR #145 · CC#4) son consultados por el stub-router para saber qué step viene. **Stub Interpreter** (canon canon-Track G placeholder) resuelve `NextStepRef` (static + conditional).

**Motor** (canon-Track B · PR #142 · CC#4) NO se invoca en este harness · canon canon-canon-mitad 2 (post-§144) el router real lo wirea.

## Quick start

```ts
import {
  SalaIntegration,
  DefaultStubRouter,
  defaultStubInterpreter,
} from '@/lib/sala-integration'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'

const storage = new InMemoryEventLogStorage()
const integration = new SalaIntegration({
  storage,
  router: new DefaultStubRouter(),
  interpreter: defaultStubInterpreter,
})

// canon · 1 tick
const tick = await integration.runStep({
  tenant_id: '...',
  client_id: '...',
  stream_id: '...',
  journey_type: 'PRODUCE',
  logical_period: '2026-W23',
})
// canon · tick.decision · tick.events_appended · tick.journey_state · tick.blackboard_state

// canon · run hasta halt (terminal / gate / judgment / budget)
const final = await integration.runUntilHalt({
  tenant_id: '...',
  client_id: '...',
  stream_id: '...',
  journey_type: 'ONBOARD',
  logical_period: '2026-W23',
  max_ticks: 50,
})
// canon · final.ticks · final.halted_by · final.last_result
```

## Loop semantics canon canonical

Cada `runStep()`:

1. **Read journey state** · `readJourneyState(storage, {tenant_id, stream_id})` deriva del log
2. **Read blackboard** · `readBlackboard(storage, {tenant_id, campaign_id})` deriva del log
3. **Get libreto** · `getLibreto(journey_type)` desde la registry
4. **Stub-router.decide({journey, blackboard, libreto})** → `DispatchDecision`
5. **Apply decision** · canon-append 1-3 eventos según el tipo de decisión:
   - `dispatch` → 3 events (canon-`dispatch_requested` + `step_started` + `step_completed` con artifact_writes)
   - `gate_pending` → 1 event (canon canon-canon-`gate_pending` con gate_type)
   - `terminal` → 1 event (canon canon-canon-`step_completed`/`step_failed`)
   - `needs_judgment` → 1 event (canon canon-canon-`needs_judgment`)
   - `budget_blocked` → 1 event (canon canon-canon-`budget_blocked`)
6. **Re-read projections** · canon canon-state POST-tick
7. **Return** `RunStepResult`

`runUntilHalt()` hace el loop hasta llegar a un estado donde no se puede avanzar sin intervención externa (gate/judgment/budget/terminal) · canon canon-cap `max_ticks` (default 50) defensive.

## Stub behavior canon canonical (Tracks G+H placeholders)

### `DefaultStubRouter`

Función TOTAL · cero drop silente. Reglas canónicas:

- canon · idle stream → dispatch initial step (`libreto.entry_step_id`)
- canon · current_step set → interpreter.resolveNextStep → decide based on resolution
- canon · `gate_camino_iii` step → `gate_pending(camino_iii)`
- canon · `gate_hitl` step → `gate_pending(hitl)`
- canon · `gate_144` step → `gate_pending(§144)`
- canon · `terminal_success`/`terminal_failure` step → `terminal`
- canon · `action` step → `dispatch`
- canon · unknown step OR fork/join → `needs_judgment`
- canon · `simulateBudgetExceeded: true` → `budget_blocked` (canon canon-test option)
- canon · `simulateNeedsJudgment: true` → `needs_judgment` (canon canon-test option)

### `DefaultStubInterpreter`

Predicate vocabulary canónico (canon canon-Track G real catalog):

| Predicate | Returns |
|---|---|
| `always` | `true` |
| `approved` | `true` (canon-gate shortcut) |
| `has:<key>` | `true` if blackboard.artifacts[key] exists |
| `missing:<key>` | `true` if blackboard.artifacts[key] absent |
| other (JSONPath etc) | `false` (canon-defensive · canon canon-Track G aterrice → real eval) |

## §148 honest

- **Stubs son canon-placeholders** · Track G + H aterricen → swap. Tests no necesitan cambiar (interfaces canónicas).
- **Motor canon canon-NO invocado real** · canon canon-canon-este harness simula el outcome del motor (canon-step_completed + artifact_writes) en lugar de canon-llamar a `executor.enqueue()`. Mitad 2 (post-§144) lo wirea.
- **Tests shadow only** · 23 cases canon canon-cero DB touch · cero prod.
- **NO router enforce real** · canon-este es un harness de integración shadow · canon canon-canon-loop append→project→decide→append demostrado funcional.
- **Predicate stub limitado** · JSONPath-style `classification.fit === "high"` retorna `false` en el stub · canon canon-Track G aterrice → eval real.

## Flag interfaces para Tracks G + H aterrice

Cuando G + H aterricen:

1. **Replace `DefaultStubInterpreter` por canon-real interpreter** que evalúa JSONPath sobre el blackboard
2. **Replace `DefaultStubRouter` por canon-real router** (`decide({event, blackboard}) → Dispatch[]`)
3. **Add real budget hook** · canon canon-canon canon canon-bucket atómico G6 vía RPC
4. **Wire real motor canon canon-`SalaExecutor.enqueue`** dentro del harness en lugar del stub
5. **Tests E2E canon-mantienen** porque las interfaces stub mirroring las reales
