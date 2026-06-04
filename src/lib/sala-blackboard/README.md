# `sala-blackboard` · library interface

Sprint 12 Fase 0 Ronda 2 Track D · CC#1.

**Blackboard compartido** (`campaign_lifecycle_artifacts`) **derivado del event-log** · proyección append-only · sin estado mutable paralelo. Cierra el **gap #5** identificado por CC#3 (NEXUS hacía merge ad-hoc en JS).

**Built on top of** · `src/lib/sala-event-log/` (Track A · PR #143).

---

## Idea canónica

El blackboard NO tiene tabla propia. Cada vez que un paso del libreto produce artefactos (briefs · assets · decisiones) · emite un evento canónico (`step_completed` por default) con `payload.artifact_writes: ArtifactWrite[]`. El estado actual del blackboard se deriva proyectando esos eventos · last-write-wins por `key`. Replayable · reconstruible desde cualquier punto.

## Quick start

```ts
import {
  writeArtifacts,
  readBlackboard,
  projectBlackboard,
} from '@/lib/sala-blackboard'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'

const storage = new InMemoryEventLogStorage()

// canon · cualquier paso escribe artefactos al blackboard
await writeArtifacts(storage, {
  tenant_id: '...',
  campaign_id: '...', // = stream_id en el log
  client_id: '...',
  correlation_id: '...',
  journey_type: 'PRODUCE',
  operation_type: 'brand_strategist_phase',
  logical_period: '2026-W23',
  artifacts: [
    { key: 'brand_voice', value: 'casual', written_by: 'brand-strategist' },
    { key: 'target_audience', value: 'millennials', written_by: 'brand-strategist' },
  ],
})

// canon · cualquier paso (o monitor) lee el estado actual del blackboard
const state = await readBlackboard(storage, {
  tenant_id: '...',
  campaign_id: '...',
})
// state.artifacts.brand_voice.value → 'casual'
// state.artifacts.brand_voice.version → 1
// state.artifacts.brand_voice.written_by → 'brand-strategist'
```

---

## API

### `writeArtifacts(storage, input)`

Construye un evento con `payload.artifact_writes` y lo appendea al log. Idempotencia heredada del log (`UNIQUE(tenant_id, idempotency_key)`) · si el mismo `{operation_type + client_id + logical_period [+ input_hash]}` se repite, el segundo write devuelve `inserted: false` + la row pre-existente (el daemon-$19 case se colapsa transparente).

- REQUIERE 1+ artefactos · throw si vacío (caller bug · no es no-op silencioso)
- `event_type` por default `step_completed` (caller puede pasar `handoff` o otros · gate events NO permitidos por tipo)
- `idempotency_key` opcional · auto-construido vía `buildIdempotencyKey()` si ausente
- `step_state` por default `done` cuando `event_type=step_completed`
- `extra_payload` se mergea con `artifact_writes` (otras keys de negocio coexisten)

Retorna `{ event: PersistedEvent, inserted: boolean }`.

### `readBlackboard(storage, input)`

Lee eventos del log para el `campaign_id` (= `stream_id`) y proyecta el estado actual del blackboard.

- REQUIERE `tenant_id` + `campaign_id` (RLS-respected)
- `since` / `until` opcional · time-window snapshot (rollback view · recent-only view)
- `max_events` opcional · default 1000 (cap del log subyacente)
- order interno fijo: `sequence_asc` (canonical replay)

Retorna `BlackboardState`. Vacío si no hay eventos.

### `projectBlackboard(events, options?)`

Pure function · canonical core de la lib. Toma un array de `PersistedEvent` y devuelve `BlackboardState`. Last-write-wins por `key`. Versión incrementa por overwrite. Stable sort por `sequence`.

- `options.tenant_id` / `options.campaign_id` filtros opcionales (defense in depth · `read()` ya pre-filtra)
- skip silencioso de payloads malformados (defense · `payload.artifact_writes` no-array o `key` vacío se ignora · no crash)

---

## Convención canon · `event.payload.artifact_writes`

```ts
interface ArtifactWrite {
  key: string           // canon · slot canónico, ej. "brand_voice"
  value: unknown        // canon · JSON serializable
  written_by?: string   // canon · agent_id u operator
  semantic_version?: string  // canon · versión semántica del artefacto
}

// canon · event.payload puede tener otras keys libres + artifact_writes:
{
  artifact_writes: [
    { key: 'brand_voice', value: 'casual', written_by: 'brand-strategist' },
    { key: 'target_audience', value: 'millennials' },
  ],
  // canon · otras claves coexisten libremente (metric · run_label · etc.)
  metric: 0.95,
}
```

---

## `BlackboardState` shape

```ts
interface BlackboardState {
  campaign_id: string
  tenant_id: string
  artifacts: Record<string, {
    key: string
    value: unknown
    version: number               // canon · 1-based overwrite count
    written_at: string             // canon · occurred_at del LATEST write
    written_by_event_id: string    // canon · event_id del LATEST write
    written_by?: string
    semantic_version?: string
  }>
  last_sequence: number            // canon · max sequence escaneado
  total_events_scanned: number     // canon · audit
  projected_at: string             // canon · ISO timestamp del proyectado
}
```

---

## §148 honest

- **NO tabla propia · derivado 100% del log** · esto es el principio canónico. NO hay estado mutable paralelo.
- **In-memory storage adapter** (de Track A · PR #143) es el test substrate. Real Supabase adapter compila + typechecks pero canon-NO exercised hasta §144 migration apply.
- **Tests shadow-only** · 44 nuevos cases · 0 DB touch · 0 prod.
- **Gate events NO permitidos** · `event_type` en `writeArtifacts()` excluye `gate_pending`/`gate_resolved` a nivel de tipo (canon canon-gate lifecycle es separado · no es artifact write).
- **Convención de payload · estable** · `artifact_writes` es el único key reservado. Otras keys de negocio coexisten libres (`extra_payload`).
- **NEXUS gap #5 cerrado** · cualquier agente puede escribir su slot · el merge ad-hoc en JS se reemplaza por el projection canonical-deterministic.
