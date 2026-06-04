/**
 * Libretos-como-datos · types · Sprint 12 Fase 0 Ronda 2 Track E.
 *
 * A libreto is a JOURNEY PLAYBOOK expressed as DATA, not code. The
 * router reads the libreto + current state and emits the next
 * dispatch · adding a new journey or changing a step is editing
 * data, NOT shipping code.
 *
 * Per Opus modelo de coordinación aprobado (2026-06-02 §B.3) ·
 * "libretos = datos" · the structure of every journey is a typed
 * graph of steps; the router is the engine that interprets the
 * graph. Add GROWTH = INSERT a row, not a code deploy.
 *
 * Spec source · zr-vault/00-meta/opus-4-8-traspaso/
 *               SALA-FASE0-ronda2-substrate-router.md (Track E)
 * Insumo CC#3 · RESULTS-CC3-router-seed-design-archaeology.md
 *   (§11.1 libretos = data · §11.2 router signature · §8 8 patterns)
 *
 * Naming convention · snake_case mirrors the data layer (event-log
 * rows · ADR-009 · JSON files). The rest of the contract (executor,
 * idempotency-key) uses camelCase because it is the TS-native API
 * surface · libretos sit at the data-layer boundary and serialize
 * to/from DB rows + event payloads.
 */

// ─── Journey taxonomy ────────────────────────────────────────────────
//
// The 6 canonical journeys per Master Nivel 1 (ugK3) absorbed +
// the new GROWTH journey per spec dispatch + CC#3 §7.2 recommendation.
// GROWTH is OPTIONAL / pending §144 Emilio decision · the registry
// allows the GROWTH slot to carry a draft libreto with status =
// 'pending_144' so the router can render an explicit "judgment_needed"
// path until the decision lands.

export type JourneyType =
  | 'ONBOARD'      // new client signed · pipeline kickoff
  | 'PRODUCE'      // campaign creation · NEXUS 7-phase state machine
  | 'ALWAYS_ON'    // steady-state event-driven (email lifecycle, etc)
  | 'REVIEW'       // quarterly QBR generation + HITL approval
  | 'ACQUIRE'      // lead intake + qualification
  | 'GROWTH'       // expansion · YouTube tier per-client (§144 pending)

// ─── Step types ──────────────────────────────────────────────────────
//
// Closed discriminator · adding a new step kind is an additive
// breaking change reviewed at the router level (NOT a string literal
// that drifts). The set matches ADR-009 event types one-to-one ·
// every step transition produces a typed event in the log.

export type StepType =
  /** Invoke an agent · emits dispatch_requested → step_completed
   *  (or step_failed → retry) in the event log. */
  | 'action'
  /** Camino III panel votes · gate_pending(camino_iii) →
   *  gate_resolved. The libreto branch freezes until resolved. */
  | 'gate_camino_iii'
  /** Human-in-the-loop inbox · gate_pending(hitl) → gate_resolved.
   *  Typically used when AI confidence is low or the action is
   *  externally-facing. */
  | 'gate_hitl'
  /** §144 Emilio admin decision · gate_pending(s144) →
   *  gate_resolved. Reserved for material business decisions. */
  | 'gate_144'
  /** Spawn N parallel sub-branches by step_id. */
  | 'fork'
  /** Wait for N sub-branches by step_id to complete before
   *  proceeding. */
  | 'join'
  /** Terminal success · libreto ends here · status=completed. */
  | 'terminal_success'
  /** Terminal failure · libreto ends here · status=failed. */
  | 'terminal_failure'

// ─── Next-step reference ─────────────────────────────────────────────
//
// Steps point to their successor either unconditionally (static) or
// based on event/blackboard predicates (conditional). The condition
// language is intentionally a STRING for the libreto layer · the
// router interprets it. For Mitad 1 we accept JSONPath-style strings
// or plain identifiers; the router build (post §144) finalises the
// expression language.

export interface ConditionalBranch {
  /** Predicate identifier or JSONPath-like expression. The router
   *  evaluates this against the current event + blackboard. */
  readonly when: string
  /** Target step_id if the predicate is truthy. */
  readonly then: string
}

export type NextStepRef =
  | { readonly kind: 'static'; readonly step_id: string }
  | {
      readonly kind: 'conditional'
      /** Evaluated in order · first truthy `when` wins. */
      readonly conditions: ReadonlyArray<ConditionalBranch>
      /** Fall-through step_id if no condition matches. */
      readonly default: string
    }

// ─── Retry budget ────────────────────────────────────────────────────
//
// Per-step retry config. The router translates this to the executor
// RetryPolicy when dispatching. `on_exhausted` decides where the
// libreto goes when retries are spent · dead-letter (router archives)
// vs gate_hitl (human triages) vs terminal_failure (libreto ends).

export type OnExhaustedAction =
  | 'dead_letter'
  | 'gate_hitl'
  | 'terminal_failure'

export interface StepRetryBudget {
  readonly max_attempts: number
  readonly initial_backoff_ms: number
  readonly max_backoff_ms: number
  readonly on_exhausted: OnExhaustedAction
}

// ─── Validation rules ────────────────────────────────────────────────
//
// Optional output checks · stub for Mitad 1. The router build
// finalises the expression language. For now, declare REQUIRED
// fields by name and an optional named schema reference.

export interface ValidationRules {
  readonly required_fields?: ReadonlyArray<string>
  readonly schema?: string
}

// ─── Gate config ─────────────────────────────────────────────────────

export interface GateConfig {
  /** Hard timeout · null = wait indefinitely (anti-reunión-eterna
   *  cap is enforced at the router level per ADR-018). */
  readonly timeout_ms: number | null
  /** Where to escalate if timeout fires (per ADR-018 7-day cap). */
  readonly escalate_to?: 'hitl' | 'gate_144'
  /** Human-readable description shown to reviewers. */
  readonly description: string
  /** Optional pre-formatted approval message. */
  readonly approval_message?: string
}

// ─── Step shapes (discriminated union) ───────────────────────────────

export interface ActionStep {
  readonly step_id: string
  readonly step_type: 'action'
  /** Canonical agent slug · what the router asks the executor to
   *  invoke (e.g. "brand-strategist", "creative-director"). */
  readonly agent_id: string
  readonly retry_budget: StepRetryBudget
  readonly next_step: NextStepRef
  readonly validation_rules?: ValidationRules
  readonly description?: string
}

export interface GateStep {
  readonly step_id: string
  readonly step_type: 'gate_camino_iii' | 'gate_hitl' | 'gate_144'
  readonly gate_config: GateConfig
  /** Where to go on approval (gate_resolved · approved=true). */
  readonly next_step: NextStepRef
  /** Optional · where to go on rejection (gate_resolved ·
   *  approved=false). Defaults to terminal_failure if absent. */
  readonly next_step_rejected?: string
  readonly description?: string
}

export interface ForkStep {
  readonly step_id: string
  readonly step_type: 'fork'
  /** Step ids of parallel branches spawned simultaneously. */
  readonly branches: ReadonlyArray<string>
  /** Step id of the join step that gathers the branches. */
  readonly join_at: string
  readonly description?: string
}

export interface JoinStep {
  readonly step_id: string
  readonly step_type: 'join'
  /** Step ids whose completion this join waits for. Must match
   *  the corresponding fork's `branches`. */
  readonly waits_for: ReadonlyArray<string>
  readonly next_step: NextStepRef
  readonly description?: string
}

export interface TerminalStep {
  readonly step_id: string
  readonly step_type: 'terminal_success' | 'terminal_failure'
  readonly description?: string
}

export type Step =
  | ActionStep
  | GateStep
  | ForkStep
  | JoinStep
  | TerminalStep

// ─── Libreto status ──────────────────────────────────────────────────

export type LibretoStatus =
  /** Authored · not yet reviewed. */
  | 'draft'
  /** Reviewed · running in shadow alongside legacy · not enforced. */
  | 'shadow'
  /** Reviewed + ratified · router enforces this libreto for the
   *  journey type. */
  | 'ready'
  /** Superseded · kept for replay / forensics. */
  | 'deprecated'
  /** Awaiting §144 Emilio decision · the router renders a
   *  judgment_needed path until the decision lands. */
  | 'pending_144'

// ─── Libreto · the playbook ──────────────────────────────────────────

export interface LibretoMetadata {
  /** Original n8n workflow id this libreto was reverse-engineered
   *  from · null for greenfield (e.g. GROWTH). */
  readonly source_workflow?: string
  readonly status: LibretoStatus
  /** §144 items pending Emilio for this journey. */
  readonly pending_decisions?: ReadonlyArray<string>
  /** Free-form author notes for reviewers. */
  readonly notes?: string
}

export interface Libreto {
  readonly journey_type: JourneyType
  /** Monotonic version · bump when steps change. The router
   *  records the libreto version on every dispatch_requested for
   *  reproducibility. */
  readonly version: number
  readonly description: string
  /** First step executed when the libreto starts. Must be a
   *  step_id present in `steps`. */
  readonly entry_step_id: string
  readonly steps: ReadonlyArray<Step>
  readonly metadata: LibretoMetadata
}

// ─── Loader return shape ─────────────────────────────────────────────

export interface LoaderError {
  readonly code: LoaderErrorCode
  readonly message: string
  readonly path?: string
}

export type LoaderErrorCode =
  | 'shape'
  | 'duplicate_step_id'
  | 'unknown_step_ref'
  | 'invalid_entry'
  | 'invalid_retry_budget'
  | 'invalid_gate'
  | 'invalid_fork'
  | 'invalid_join'
  | 'invalid_next_step'
  | 'unreachable_step'

export interface LoadResult {
  readonly ok: boolean
  readonly libreto?: Libreto
  readonly errors: ReadonlyArray<LoaderError>
}
