/**
 * Canon canonical types · `src/lib/sala-router/` · Sprint 12 Fase 0 Ronda 3 Track H.
 *
 * Spec · `SALA-FASE0-ronda3-router.md` §5 · the stateless `decide` function.
 *
 * The router COMPOSES three upstream contracts (all built in shadow):
 *   - Track F (PR #146) · `JourneyState` projection (where the stream is)
 *   - Track G (PR #145 data + future interpreter PR) · libreto lookup +
 *     `resolveNextStep` interpreter
 *   - G6 (existing bucket atómico) · `budgetCheck` seam (NO live wire here)
 *
 * Per Opus ronda 1 §1, the router is a **FUNCION TOTAL**: every
 * `{journey, current_step, event_type}` triple resolves to one of 5
 * decision shapes · cero drop silente. Adding a new event type is a
 * compile-time break (the switch is exhaustive); missing libreto or
 * unknown step routes to `needs_judgment` (§H-a off-script handler).
 *
 * Per Opus ronda 1 §3, the router COMPUTES the business idempotency key;
 * the event-log (PR #143) ENFORCES the dedup via UNIQUE constraint.
 * Router proposes, log deduplicates.
 *
 * Out of scope (per ADR-018 + spec §2):
 *   - Real dispatch · the router emits `Decision[]`, nobody executes.
 *   - Real budget enforcement · the `budgetCheck` fn is a stub seam.
 *   - Real persistence · decisions never hit the log until §144 wires.
 */

import type { PersistedEvent, GateType } from '@/lib/sala-event-log'
import type {
  Libreto,
  JourneyType,
  NextStepRef,
  Step,
} from '@/lib/sala/libretos'
import type { JourneyState } from '@/lib/sala-journey-state'

// =====================================================================
// Decision shapes · the 5 outputs of `decide`
// =====================================================================

/**
 * Canon canonical · the router asks the executor to invoke an agent.
 * The executor (PR #142) memoizes by `idempotency_key`; the log (#143)
 * dedups by `idempotency_key` UNIQUE constraint.
 */
export interface DispatchDecision {
  readonly kind: 'dispatch'
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly step_id: string
  readonly agent_id: string
  /** Canon canonical · attempt counter for the new dispatch · 1 on first
   *  fire, current_step_attempt + 1 on retry · used by the executor's
   *  retry-cap (PR #142 §150 G2). */
  readonly attempt: number
  /** Canon canonical · the business idempotency key the router proposes ·
   *  the log enforces the UNIQUE constraint · two routers can race the
   *  same key and only one INSERT wins (canon §150 G3). */
  readonly idempotency_key: string
  /** Canon canonical · `operation_type + client_id + logical_period
   *  [+ input_hash]` parts before hashing · kept for forensics + replay. */
  readonly idempotency_inputs: IdempotencyInputs
  /** Canon canonical · the libreto version the router used for this
   *  decision · the log records this for reproducibility (libreto can
   *  evolve · re-runs use the original version). */
  readonly libreto_version: number
  /** Canon canonical · causation chain · the event_id that triggered
   *  this dispatch (cadena causal · ADR-009 field #8). */
  readonly caused_by_event_id: string

  /** Canon canonical · Model B (conexión 2026-06-05) · which executor
   *  consumes this dispatch:
   *    - 'agent'    (default · backwards-compat) · executor invokes
   *      `/api/agents/run-sdk` directly with `agent_id` as the slug
   *    - 'workflow' · executor POSTs to the existing n8n workflow
   *      webhook (see `workflow_target`) and lets the workflow run as-is
   *      while the sala observes events via projection + callbacks
   *
   *  When omitted, callers MUST treat as 'agent' (the legacy path).
   *  `target='workflow'` is opt-in per JOURNEY_WORKFLOW_MAP lookup. */
  readonly target?: 'agent' | 'workflow'

  /** Canon canonical · Model B · target details when `target='workflow'`.
   *  The router populates this from `JOURNEY_WORKFLOW_MAP[journey_type]`
   *  via the dispatcher's resolver. `target='agent'` leaves it `undefined`. */
  readonly workflow_target?: {
    readonly workflow_id: string
    readonly webhook_path: string
    readonly webhook_url: string
  }
}

/**
 * Canon canonical · the router parks a branch waiting for a gate
 * resolution. Camino III voting + HITL inbox + §144 Emilio approvals
 * are gates of first class (NOT booleans on action steps · ADR-009 flag
 * #5). The branch is frozen until a `gate_resolved` event lands.
 */
export interface GatePendingDecision {
  readonly kind: 'gate_pending'
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly step_id: string
  readonly gate_type: GateType
  /** Canon canonical · same key contract as dispatch · log dedups */
  readonly idempotency_key: string
  readonly idempotency_inputs: IdempotencyInputs
  readonly libreto_version: number
  readonly caused_by_event_id: string
}

/**
 * Canon canonical · the libreto terminated on this stream. `outcome`
 * mirrors the libreto's terminal_success / terminal_failure step type.
 */
export interface TerminalDecision {
  readonly kind: 'terminal'
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly step_id: string
  readonly outcome: 'success' | 'failure'
  readonly libreto_version: number
  readonly caused_by_event_id: string
}

/**
 * Canon canonical · §H-a · off-script handler. The router could not
 * resolve `{journey, current_step, event_type}` to a known transition.
 * Emits `needs_judgment` to route to a coordinator-agent or HITL ·
 * resolved later by a `judgment_resolved` event. Function TOTAL means
 * THIS is what the router emits instead of dropping silently.
 */
export interface NeedsJudgmentDecision {
  readonly kind: 'needs_judgment'
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType | null
  readonly step_id: string | null
  readonly reason: NeedsJudgmentReason
  readonly detail: string
  readonly idempotency_key: string
  readonly idempotency_inputs: IdempotencyInputs
  readonly caused_by_event_id: string
}

export type NeedsJudgmentReason =
  /** Event arrived but the projection has no journey (idle stream) and
   *  the event_type doesn't kickstart a libreto. */
  | 'idle_stream_unknown_kickstart'
  /** `journey_type` field on the event doesn't match any libreto
   *  registered in the catalog (Track G `getLibreto` returned undefined). */
  | 'libreto_not_found'
  /** Libreto exists but its status is `pending_144` · the §144 Emilio
   *  decision hasn't landed · the router parks here. */
  | 'libreto_pending_144'
  /** Projection's `current_step` does not exist in the libreto's
   *  `steps` array · the stream is out of sync with the libreto (e.g.
   *  libreto edited mid-run). */
  | 'current_step_not_in_libreto'
  /** Interpreter returned `unresolved` from `resolveNextStep`. */
  | 'interpreter_unresolved'
  /** The event_type is valid for the log but the router has no rule
   *  for what to do with it given the current step. */
  | 'event_type_not_handled'

/**
 * Canon canonical · §H-d + CIERRE OPUS #7 condition #1. The budget bucket
 * (G6 · existing `rate_limit_buckets` + `increment_bucket_atomic`)
 * rejected the dispatch BEFORE it fired. Router emits `budget_blocked`
 * to the log so the projection can render the throttle reason; the
 * dispatch DID NOT happen.
 */
export interface BudgetBlockedDecision {
  readonly kind: 'budget_blocked'
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly step_id: string
  /** Canon canonical · the bucket key the dispatch would have hit ·
   *  `{client_id, journey_type, operation_type}` per Opus §2 (scoping
   *  of CAP). */
  readonly budget_key: string
  /** Canon canonical · the human-readable reason · canon canon canon
   *  G6's response (e.g. "daily cap $100 reached"). */
  readonly reason: string
  readonly libreto_version: number
  readonly caused_by_event_id: string
}

export type Decision =
  | DispatchDecision
  | GatePendingDecision
  | TerminalDecision
  | NeedsJudgmentDecision
  | BudgetBlockedDecision

// =====================================================================
// Idempotency · the inputs the router hashes
// =====================================================================

/**
 * Canon canonical · the components the router COMPUTES into the
 * `idempotency_key`. The hash itself uses `buildIdempotencyKey()`
 * from the event-log lib (PR #143) so the formula stays canonical.
 *
 * Per ADR-009 flag #1, the daemon $19 case (mismo trabajo, distintos
 * execution_id) collapses to the same key because operation_type +
 * client_id + logical_period stays stable across runs.
 */
export interface IdempotencyInputs {
  readonly operation_type: string
  readonly client_id: string
  readonly logical_period: string
  readonly input_hash?: string
}

// =====================================================================
// Composed input · what `decide` receives + the seams it depends on
// =====================================================================

/**
 * Canon canonical · the libreto lookup contract · Track G registry. The
 * router asks for a libreto by journey_type · the registry returns the
 * canonical version (or undefined if missing · which is `needs_judgment`).
 */
export type LibretoLookup = (journey_type: string) => Libreto | undefined

/**
 * Canon canonical · the interpreter contract · Track G stub for Ronda 3.
 * The router calls this to resolve the next step from the libreto +
 * current step + blackboard. Stubbed today; CC#4 ships the real
 * interpreter in a follow-up PR. The router depends on this SHAPE.
 */
export type ResolveNextStepFn = (input: {
  readonly libreto: Libreto
  readonly current_step_id: string
  readonly journey_state: JourneyState
  readonly trigger_event: PersistedEvent
}) => NextStepResolution

export type NextStepResolution =
  | { readonly kind: 'next'; readonly next_step: Step }
  | { readonly kind: 'terminal'; readonly outcome: 'success' | 'failure'; readonly step_id: string }
  | { readonly kind: 'gate'; readonly gate_step: Step }
  | { readonly kind: 'unresolved'; readonly reason: string }

/**
 * Canon canonical · the budget-check seam · G6 bucket atómico.
 *
 * **ASYNC** per escalón 4 desbloqueo (Opción B · 2026-06-04). The real
 * G6 hook (`SupabaseG6BudgetHook.checkAndIncrement`) is an RPC against
 * Supabase and is inherently asynchronous; the seam matches that shape
 * so the router can `await` the check inside `decide()` without losing
 * atomicity (Option A · sync cache · was rejected because it cannot
 * preserve the atomic increment guarantee of the bucket).
 *
 * The router invokes this BEFORE returning a `DispatchDecision`. If the
 * fn returns `{ allowed: false }`, the router emits
 * `BudgetBlockedDecision` instead.
 *
 * In shadow mode (today), the implementation is a noop-allow stub or a
 * deterministic test stub. The wire to the real G6 bucket lives BEHIND
 * this seam · §144-gated · NOT in this PR. Track N (PR #155) ships the
 * `BudgetHook` shape and `SupabaseG6BudgetHook` that the wire will plug
 * into this seam in escalón 5.
 */
export type BudgetCheckFn = (
  input: BudgetCheckInput,
) => Promise<BudgetCheckResult>

/**
 * Canon canonical · the legacy synchronous shape. Kept as a documented
 * alias only · NOT used by `decide()` post escalón 4 desbloqueo. If a
 * sync stub is convenient inside a test, wrap it via `Promise.resolve()`
 * at the call site (or use `allowAllBudgetStub` / `denyByKeyBudgetStub`
 * from `./stubs.ts` which already return Promises).
 */
export type SyncBudgetCheckFn = (input: BudgetCheckInput) => BudgetCheckResult

export interface BudgetCheckInput {
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: JourneyType
  readonly operation_type: string
  readonly step_id: string
  /** Canon canonical · projected cost of the dispatch · the router may
   *  have a per-step estimate; if absent, the bucket check uses count
   *  alone. */
  readonly projected_cost_usd?: number
  /** Canon canonical · the canonical bucket-key the router computed for
   *  this dispatch via `buildBucketKey()`. The fn implementation MAY
   *  ignore this and recompute (escalón 5 G6 binding does that), but
   *  the router passes it so the seam can short-circuit / log without
   *  re-parsing.
   *
   *  Format · `t:{tenant_id}:c:{client_id}:j:{journey_type}:o:{operation_type}`
   *  · per-operation granularity. See `buildBucketKey()` in `./stubs.ts`. */
  readonly bucket_key: string
}

export interface BudgetCheckResult {
  readonly allowed: boolean
  readonly budget_key: string
  /** Canon canonical · populated when `allowed: false` · the
   *  human-readable reason to embed in the `budget_blocked` event. */
  readonly reason?: string
}

/**
 * Canon canonical · the full input to `decide`. Dependency-injected so
 * unit tests can pass stubs for every seam (libreto lookup, interpreter,
 * budget check) and assert the decision purely.
 */
export interface DecideInput {
  /** The event that triggered this routing decision (typically the
   *  latest event for the stream). */
  readonly event: PersistedEvent
  /** Where the stream is right now · from Track F projection. */
  readonly journey_state: JourneyState
  /** How to find the libreto by journey_type · Track G registry. */
  readonly libreto_lookup: LibretoLookup
  /** How to compute the next step inside a libreto · Track G interpreter
   *  (stub today, real later). */
  readonly resolve_next_step: ResolveNextStepFn
  /** Whether the bucket allows the dispatch · G6 seam. */
  readonly budget_check: BudgetCheckFn
  /** Canon canonical · optional deterministic `now` for tests + replay.
   *  Defaults to `new Date()`. */
  readonly now?: () => Date
}
