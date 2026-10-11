/**
 * Canon canonical · JOURNEY_WORKFLOW_MAP · Sprint 12 Fase 0 prep finale.
 *
 * Model B (conexión 2026-06-05) · per-journey config that maps a
 * canonical journey to the existing n8n worker workflow that runs it.
 * The sala router emits `DispatchDecision{target:'workflow'}` and the
 * dispatcher uses this map to find the webhook URL to POST to.
 *
 * §148 honest · this map encodes ground-truth from n8n live ·
 *   - Workflow IDs verified via n8n REST API 2026-06-05
 *   - ONBOARD targets `LyVoKcrypS5uLyuu` (Client Onboarding E2E v2 ·
 *     21 nodes · Webhook Deal Won entry point) per Phase 1 scope
 *     (entry-bounded · NOT the 32-node RwUo full pipeline · Emilio
 *     decision 2026-06-05 for Náufrago Phase 1)
 *   - Other journeys (PRODUCE, ACQUIRE, etc) intentionally LEFT
 *     UNMAPPED · they remain `target='agent'` (legacy) until each
 *     journey gets its §144 to opt-in to Model B
 *
 * §148 explicit · this file is READ-ONLY data · cero side effects.
 * Reversibility · removing an entry returns the journey to legacy
 * `target='agent'` path (router default behavior).
 *
 * Costura C (closure 2026-06-05) · `phase_boundaries` MUST mirror the
 * 7 canonical phases that CC#4 wired in the worker
 * `modelb-phase-boundary-emit` node payload schema · MODELB-ADAPTER
 * contract §1.3 + §2.2. Contract test
 * `__tests__/sala-modelb-contract-phase-taxonomy.test.ts` ENFORCES
 * exact match · drift on either side breaks CI.
 */
import type { JourneyType } from '@/lib/sala/libretos'

/**
 * Canon canonical · the 7 canonical phases CC#4 emits from the n8n
 * worker `LyVoKcrypS5uLyuu` per the Model B contract spec §1.3 + §2.2.
 *
 * Order canon · matches the worker's execution sequence (APIFY_WIRE is
 * parallel from the webhook but emits last in the canonical ordering
 * for OBSERVE reconciliation per the contract doc Open-question §5.1).
 *
 * §148 honest · CC#4 owns this list on the worker side · sala mirrors
 * it here · drift breaks the contract test in CI.
 */
export const CANONICAL_PHASES_LyVoKcrypS5uLyuu = Object.freeze([
  'INTAKE',
  'DISCOVERY',
  'WORKSPACE',
  'SCHEDULING',
  'NOTIFICATION',
  'CASCADE',
  'APIFY_WIRE',
] as const)

export type CanonicalPhaseLyVo =
  (typeof CANONICAL_PHASES_LyVoKcrypS5uLyuu)[number]

export interface JourneyWorkflowTarget {
  /** Canon canonical · n8n workflow_id (from `GET /api/v1/workflows`). */
  readonly workflow_id: string
  /** Canon canonical · the webhook `path` registered on the workflow's
   *  webhook node (just the path · NOT the full URL · canon mirror of
   *  n8n's workflow.nodes[0].parameters.path). */
  readonly webhook_path: string
  /** Canon canonical · human-readable name for audit + Slack alerts. */
  readonly worker_name: string
  /** Canon canonical · phase boundaries the worker emits to
   *  `/api/sala/ingress` for OBSERVE-mode reconciliation. Aligned to
   *  the 7 canonical phases per CC#4 contract spec §1.3. When the
   *  sala receives one of these phase names, it compares against the
   *  libreto's expected next phase · mismatch → alert. */
  readonly phase_boundaries: ReadonlyArray<string>
  /** Canon canonical · idempotency suffix · combined with stream_id
   *  to derive the dispatch idempotency key · two dispatch-decisions
   *  for the same stream MUST collapse to one webhook fire (STOP-2
   *  dimension (a) · dispatch-único). */
  readonly idempotency_suffix: string
  /** E67 (CC#1 2026-09-16) · el obrero exige la LLAVE DE DESPACHO en la
   *  cabecera `x-sala-dispatch-key` (valor de `SALA_DISPATCH_KEY`). Si es
   *  `true` y la llave no está en el entorno, el despachador NO dispara
   *  (fail-closed · `dispatch_key_missing`): mejor un sobre que vuelve a la
   *  fila con motivo que un webhook que rechaza en silencio. La marca
   *  `trigger_source` sigue viajando: es rastro, no llave. */
  readonly dispatch_key_required?: boolean
  /** r63 (CC#1 2026-10-11 · relevo 61) · otros flujos que vuelven a la sala con SU PROPIO `worker_id` y pertenecen a este viaje: la parte original detrás de la puerta de la cadena
   *  (modo pasarela y viajes ya en vuelo), la pieza simple detrás de la puerta de la oficina. Sin esto el cable de vuelta se rotularía `ONBOARD` (el valor por omisión). */
  readonly alias_workflow_ids?: ReadonlyArray<string>
}

/**
 * Canon canonical · per-journey mapping. ONBOARD is the only entry
 * for Phase 1 Náufrago. Other journeys deliberately UNMAPPED ·
 * legacy `target='agent'` path until each §144 opt-in.
 */
export const JOURNEY_WORKFLOW_MAP: Readonly<
  Partial<Record<JourneyType, JourneyWorkflowTarget>>
> = Object.freeze({
  ONBOARD: {
    workflow_id: 'LyVoKcrypS5uLyuu',
    webhook_path: 'zero-risk/deal-won-onboarding',
    worker_name: 'Client Onboarding E2E v2 (Webhook Deal Won)',
    phase_boundaries: CANONICAL_PHASES_LyVoKcrypS5uLyuu,
    idempotency_suffix: 'onboard-worker-dispatch',
    // E67 · la puerta del alta lleva llave real desde 2026-09-16 · sin
    // `SALA_DISPATCH_KEY` en el entorno el despachador no dispara.
    dispatch_key_required: true,
  },
  // E57 (CC#2 2026-09-16) · el destino de `planeación`, que no existía.
  //
  // 🔴 POR QUÉ SE REUSA `PRODUCE` Y NO SE CREA UN TIPO NUEVO: el encargo pide
  // «el mínimo indispensable, sin abrir la taxonomía entera». `JourneyType` es
  // una unión CERRADA de seis y el lector del repartidor rechaza cualquier
  // valor fuera de ella (`journey_type not in canonical set`) · agregar un
  // séptimo toca la taxonomía, que está reservada a Emilio (§144 · `GROWTH`
  // lleva desde el 04-jun en `pending_144` esperando esa misma firma).
  // `PRODUCE` ya está en la unión y estaba deliberadamente sin destino.
  //
  // ⚠️ EL PRECIO, DICHO: `planeación` queda rotulada «PRODUCE». Es el mismo
  // defecto de rótulo que en E24/E31 costó el manual de GEA · se elige a
  // sabiendas y se declara. El día que se abra la taxonomía, esto se renombra
  // y NADA MÁS cambia: el destino vive sólo acá.
  PRODUCE: {
    workflow_id: 'X9F0zp6LQ2xGEYVS',
    webhook_path: 'zero-risk/planeacion',
    worker_name: 'planeacion (plan de 90 días)',
    // `planeación` sólo emite el cierre · medido en `sala_event_log` (3 filas
    // `journey_completed` con worker_name="planeacion", 09-sep). NO comparte
    // la taxonomía de 7 fases del alta · por eso lista propia y no la constante.
    phase_boundaries: Object.freeze(['journey_completed']),
    idempotency_suffix: 'planeacion-worker-dispatch',
  },
  // 29-sep · el SÉPTIMO tipo de viaje, firmado por Emilio: el parte de trabajo (campaign brief).
  // La cadena: planeación termina → sobre a la sala (planeacion/plan-listo · briefear) → la sala despacha BRIEF.
  // `PRODUCE` NO se toca: sigue siendo planeación. El tipo vive en CINCO listas escritas a mano (libretos/types.ts ·
  // libretos/loader.ts · sala-router-consumer/parsing.ts · api/sala/events/append/route.ts · journey-orchestrator/types.ts):
  // dos de ellas fallan EN CALIENTE sin romper la compilación (descartan el sobre al leerlo / impiden escribir el asiento).
  //
  // 🔴 El obrero PAGA (un agente): exige la llave de despacho, como el alta (E67). Sin `SALA_DISPATCH_KEY` no se dispara.
  //
  // r63 (relevo 61) · EL BRIEF AHORA ENTRA POR LA PUERTA DE LA CADENA (`pBAp5Cx7R39U585i` · `zero-risk/cadena`). Con la cadena `apagada` (o fuera del ensayo) la puerta REENVÍA el cuerpo,
  // sin tocar un campo, a la parte original (`PQdIgbuFexuBsoh8` · `zero-risk/brief`) con la misma llave de despacho: PASARELA NEUTRAL. Reversa: volver a los tres campos de abajo.
  // 🔴 DICHO SIN ADORNO: la parte original (`PQdI…`) devuelve 401 en su nodo BRIEF (le falta `|| $env.INTERNAL_API_KEY`) · esto NO se arregla en el recorrido viejo (encargo de Lenovo, relevo 63);
  // la pasarela hereda ese defecto tal cual, igual que antes del cableado. El camino nuevo (la cadena encendida) no pasa por ese nodo.
  BRIEF: {
    workflow_id: 'pBAp5Cx7R39U585i',
    webhook_path: 'zero-risk/cadena',
    worker_name: 'cadena (puerta · plan → calendario → parte)',
    alias_workflow_ids: Object.freeze(['PQdIgbuFexuBsoh8', 'BNXqlaX1oHSfZIpF']),
    phase_boundaries: Object.freeze(['journey_completed']),
    idempotency_suffix: 'brief-worker-dispatch',
    dispatch_key_required: true,
  },
  // 01-oct · el OCTAVO tipo de viaje: el productor (un brief del parte → una pieza). El nombre evita la colisión con `PRODUCE` (que es planeación).
  // La cadena: el parte listo (o quien lo pida) deja un sobre `brief/parte-listo` · `producir` → la sala despacha PIEZAS. Lo despacha el repartidor y nada más (ADR-018).
  // 🔴 El obrero PAGA (un agente): exige la llave de despacho, como el brief y el alta (E67).
  //
  // r63 (relevo 61) · LA PIEZA AHORA ENTRA POR LA PUERTA DE LA OFICINA (`PzZ3b6cY6DYmIaOQ` · `zero-risk/oficina`). Sin `familia` en el sobre, con la oficina `apagada`, con una familia no activa
  // o fuera del ensayo, la puerta REENVÍA el cuerpo intacto a la pieza simple (`lVCLzxQCKNkd3uS0` · `zero-risk/pieza`): PASARELA NEUTRAL. Reversa: volver a los tres campos de abajo.
  PIEZAS: {
    workflow_id: 'PzZ3b6cY6DYmIaOQ',
    webhook_path: 'zero-risk/oficina',
    worker_name: 'oficina (puerta · producir → sala o pieza simple)',
    alias_workflow_ids: Object.freeze(['lVCLzxQCKNkd3uS0']),
    phase_boundaries: Object.freeze(['journey_completed']),
    idempotency_suffix: 'pieza-worker-dispatch',
    dispatch_key_required: true,
  },
  // ACQUIRE, ALWAYS_ON, REVIEW, GROWTH · intentionally
  // unmapped until each journey gets its §144 opt-in. The router will
  // emit `target='agent'` (default) for them, matching legacy behavior.
})

/** Canon canonical · returns the worker target for a journey OR
 *  undefined when the journey is not mapped (legacy `agent` path). */
export function getJourneyWorkflowTarget(
  journey_type: JourneyType,
): JourneyWorkflowTarget | undefined {
  return JOURNEY_WORKFLOW_MAP[journey_type]
}

/** Canon canonical · whether the journey has Model B opt-in. Used by
 *  callers (router consumers, dashboards) to decide whether to expect
 *  worker-driven OR agent-driven flow. */
export function isWorkflowJourney(journey_type: JourneyType): boolean {
  return getJourneyWorkflowTarget(journey_type) !== undefined
}

/** Canon canonical · helper · whether a phase name is one of the 7
 *  canonical phases CC#4 emits from the worker. */
export function isCanonicalPhase(name: string): name is CanonicalPhaseLyVo {
  return (CANONICAL_PHASES_LyVoKcrypS5uLyuu as ReadonlyArray<string>).includes(name)
}

/** El journey al que pertenece un flujo n8n (por su workflow_id) · `undefined` si no está en el mapa.
 *  El cable de vuelta (`/api/sala/callback`) lo usa para sellar el asiento de cierre con el journey REAL
 *  (antes salía siempre `ONBOARD`, también para el brief · CC#1 2026-09-30). */
export function journeyTypeOfWorkflow(workflow_id: string | null | undefined): JourneyType | undefined {
  if (!workflow_id) return undefined
  for (const [journey, target] of Object.entries(JOURNEY_WORKFLOW_MAP)) {
    if (target && (target.workflow_id === workflow_id || (target.alias_workflow_ids ?? []).includes(workflow_id))) return journey as JourneyType
  }
  return undefined
}
