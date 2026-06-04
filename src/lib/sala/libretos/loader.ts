/**
 * Libreto loader + validator · Sprint 12 Fase 0 Ronda 2 Track E.
 *
 * Two responsibilities ·
 * (1) `loadLibreto(input)` · accept an `unknown` (parsed JSON or
 *     hand-typed TS data) and reject anything that does not match
 *     the libreto shape · returns errors with codes + paths · NEVER
 *     throws (so callers can collect errors across many libretos).
 * (2) `validateLibreto(libreto)` · structural checks against a
 *     well-typed libreto · catches the bug classes that the type
 *     system alone cannot · duplicate step_ids, dangling next_step
 *     refs, fork/join mismatches, unreachable steps, insane retry
 *     budgets.
 *
 * Design rationale · the libretos are DATA. The loader is the
 * boundary check that turns untrusted input into a `Libreto`. The
 * validator is the structural guarantee · every libreto that exits
 * the loader can be safely fed to the router. If the loader passes
 * and the validator finds nothing, the router will not surprise.
 */
import type {
  ActionStep,
  ConditionalBranch,
  ForkStep,
  GateStep,
  JoinStep,
  Libreto,
  LoaderError,
  LoaderErrorCode,
  LoadResult,
  NextStepRef,
  Step,
  StepType,
} from './types'

// ─── Constants ───────────────────────────────────────────────────────

const STEP_TYPES: ReadonlyArray<StepType> = [
  'action',
  'gate_camino_iii',
  'gate_hitl',
  'gate_144',
  'fork',
  'join',
  'terminal_success',
  'terminal_failure',
]

const JOURNEY_TYPES: ReadonlyArray<string> = [
  'ONBOARD',
  'PRODUCE',
  'ALWAYS_ON',
  'REVIEW',
  'ACQUIRE',
  'GROWTH',
]

const LIBRETO_STATUSES: ReadonlyArray<string> = [
  'draft',
  'shadow',
  'ready',
  'deprecated',
  'pending_144',
]

const ON_EXHAUSTED_ACTIONS: ReadonlyArray<string> = [
  'dead_letter',
  'gate_hitl',
  'terminal_failure',
]

// ─── Helpers ─────────────────────────────────────────────────────────

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isStringArray(x: unknown): x is ReadonlyArray<string> {
  return Array.isArray(x) && x.every((v) => typeof v === 'string')
}

function err(
  code: LoaderErrorCode,
  message: string,
  path?: string,
): LoaderError {
  return { code, message, path }
}

// ─── loadLibreto · runtime shape check ───────────────────────────────

export function loadLibreto(input: unknown): LoadResult {
  const errors: LoaderError[] = []

  if (!isObject(input)) {
    return {
      ok: false,
      errors: [err('shape', 'input must be an object', '$')],
    }
  }

  // journey_type
  if (
    typeof input.journey_type !== 'string' ||
    !JOURNEY_TYPES.includes(input.journey_type)
  ) {
    errors.push(
      err(
        'shape',
        `journey_type must be one of ${JOURNEY_TYPES.join('|')}`,
        '$.journey_type',
      ),
    )
  }

  // version
  if (typeof input.version !== 'number' || input.version < 1) {
    errors.push(err('shape', 'version must be a positive number', '$.version'))
  }

  // description
  if (typeof input.description !== 'string' || input.description.length === 0) {
    errors.push(
      err('shape', 'description must be a non-empty string', '$.description'),
    )
  }

  // entry_step_id
  if (
    typeof input.entry_step_id !== 'string' ||
    input.entry_step_id.length === 0
  ) {
    errors.push(
      err(
        'invalid_entry',
        'entry_step_id must be a non-empty string',
        '$.entry_step_id',
      ),
    )
  }

  // steps
  if (!Array.isArray(input.steps)) {
    errors.push(err('shape', 'steps must be an array', '$.steps'))
    return { ok: false, errors }
  }
  if (input.steps.length === 0) {
    errors.push(err('shape', 'steps must not be empty', '$.steps'))
  }

  for (let i = 0; i < input.steps.length; i++) {
    const stepErrors = validateStepShape(input.steps[i], `$.steps[${i}]`)
    errors.push(...stepErrors)
  }

  // metadata
  if (!isObject(input.metadata)) {
    errors.push(err('shape', 'metadata must be an object', '$.metadata'))
  } else {
    if (
      typeof input.metadata.status !== 'string' ||
      !LIBRETO_STATUSES.includes(input.metadata.status)
    ) {
      errors.push(
        err(
          'shape',
          `metadata.status must be one of ${LIBRETO_STATUSES.join('|')}`,
          '$.metadata.status',
        ),
      )
    }
    if (
      input.metadata.source_workflow !== undefined &&
      typeof input.metadata.source_workflow !== 'string'
    ) {
      errors.push(
        err(
          'shape',
          'metadata.source_workflow must be a string when present',
          '$.metadata.source_workflow',
        ),
      )
    }
    if (
      input.metadata.pending_decisions !== undefined &&
      !isStringArray(input.metadata.pending_decisions)
    ) {
      errors.push(
        err(
          'shape',
          'metadata.pending_decisions must be a string array when present',
          '$.metadata.pending_decisions',
        ),
      )
    }
  }

  // If shape errors exist, do NOT proceed to structural validation.
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const libreto = input as unknown as Libreto
  const structural = validateLibreto(libreto)
  if (structural.length > 0) {
    return { ok: false, libreto, errors: structural }
  }

  return { ok: true, libreto, errors: [] }
}

// ─── Per-step shape validation ──────────────────────────────────────

function validateStepShape(step: unknown, path: string): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isObject(step)) {
    return [err('shape', 'step must be an object', path)]
  }

  if (typeof step.step_id !== 'string' || step.step_id.length === 0) {
    errors.push(err('shape', 'step_id must be a non-empty string', `${path}.step_id`))
  }
  if (
    typeof step.step_type !== 'string' ||
    !STEP_TYPES.includes(step.step_type as StepType)
  ) {
    errors.push(
      err(
        'shape',
        `step_type must be one of ${STEP_TYPES.join('|')}`,
        `${path}.step_type`,
      ),
    )
    return errors // can't check more without a valid step_type
  }

  const t = step.step_type as StepType
  switch (t) {
    case 'action':
      errors.push(...validateActionStep(step, path))
      break
    case 'gate_camino_iii':
    case 'gate_hitl':
    case 'gate_144':
      errors.push(...validateGateStep(step, path))
      break
    case 'fork':
      errors.push(...validateForkStep(step, path))
      break
    case 'join':
      errors.push(...validateJoinStep(step, path))
      break
    case 'terminal_success':
    case 'terminal_failure':
      // No additional fields required.
      break
  }
  return errors
}

function validateActionStep(
  step: Record<string, unknown>,
  path: string,
): LoaderError[] {
  const errors: LoaderError[] = []
  if (typeof step.agent_id !== 'string' || step.agent_id.length === 0) {
    errors.push(
      err('shape', 'action step requires non-empty agent_id', `${path}.agent_id`),
    )
  }
  errors.push(...validateRetryBudget(step.retry_budget, `${path}.retry_budget`))
  errors.push(...validateNextStepRef(step.next_step, `${path}.next_step`))
  return errors
}

function validateGateStep(
  step: Record<string, unknown>,
  path: string,
): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isObject(step.gate_config)) {
    errors.push(
      err('invalid_gate', 'gate step requires gate_config object', `${path}.gate_config`),
    )
  } else {
    const gc = step.gate_config
    if (gc.timeout_ms !== null && typeof gc.timeout_ms !== 'number') {
      errors.push(
        err(
          'invalid_gate',
          'gate_config.timeout_ms must be number | null',
          `${path}.gate_config.timeout_ms`,
        ),
      )
    } else if (typeof gc.timeout_ms === 'number' && gc.timeout_ms < 0) {
      errors.push(
        err(
          'invalid_gate',
          'gate_config.timeout_ms must be >= 0',
          `${path}.gate_config.timeout_ms`,
        ),
      )
    }
    if (typeof gc.description !== 'string' || gc.description.length === 0) {
      errors.push(
        err(
          'invalid_gate',
          'gate_config.description must be a non-empty string',
          `${path}.gate_config.description`,
        ),
      )
    }
  }
  errors.push(...validateNextStepRef(step.next_step, `${path}.next_step`))
  if (
    step.next_step_rejected !== undefined &&
    typeof step.next_step_rejected !== 'string'
  ) {
    errors.push(
      err(
        'shape',
        'next_step_rejected must be a string when present',
        `${path}.next_step_rejected`,
      ),
    )
  }
  return errors
}

function validateForkStep(
  step: Record<string, unknown>,
  path: string,
): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isStringArray(step.branches) || step.branches.length < 2) {
    errors.push(
      err(
        'invalid_fork',
        'fork.branches must be a string array with at least 2 step_ids',
        `${path}.branches`,
      ),
    )
  }
  if (typeof step.join_at !== 'string' || step.join_at.length === 0) {
    errors.push(
      err(
        'invalid_fork',
        'fork.join_at must be a non-empty step_id',
        `${path}.join_at`,
      ),
    )
  }
  return errors
}

function validateJoinStep(
  step: Record<string, unknown>,
  path: string,
): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isStringArray(step.waits_for) || step.waits_for.length < 2) {
    errors.push(
      err(
        'invalid_join',
        'join.waits_for must be a string array with at least 2 step_ids',
        `${path}.waits_for`,
      ),
    )
  }
  errors.push(...validateNextStepRef(step.next_step, `${path}.next_step`))
  return errors
}

function validateRetryBudget(input: unknown, path: string): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isObject(input)) {
    return [err('invalid_retry_budget', 'retry_budget must be an object', path)]
  }
  if (typeof input.max_attempts !== 'number' || input.max_attempts < 1) {
    errors.push(
      err(
        'invalid_retry_budget',
        'retry_budget.max_attempts must be a number >= 1',
        `${path}.max_attempts`,
      ),
    )
  }
  if (typeof input.initial_backoff_ms !== 'number' || input.initial_backoff_ms < 0) {
    errors.push(
      err(
        'invalid_retry_budget',
        'retry_budget.initial_backoff_ms must be a number >= 0',
        `${path}.initial_backoff_ms`,
      ),
    )
  }
  if (typeof input.max_backoff_ms !== 'number' || input.max_backoff_ms < 0) {
    errors.push(
      err(
        'invalid_retry_budget',
        'retry_budget.max_backoff_ms must be a number >= 0',
        `${path}.max_backoff_ms`,
      ),
    )
  }
  if (
    typeof input.initial_backoff_ms === 'number' &&
    typeof input.max_backoff_ms === 'number' &&
    input.max_backoff_ms < input.initial_backoff_ms
  ) {
    errors.push(
      err(
        'invalid_retry_budget',
        'retry_budget.max_backoff_ms must be >= initial_backoff_ms',
        path,
      ),
    )
  }
  if (
    typeof input.on_exhausted !== 'string' ||
    !ON_EXHAUSTED_ACTIONS.includes(input.on_exhausted)
  ) {
    errors.push(
      err(
        'invalid_retry_budget',
        `retry_budget.on_exhausted must be one of ${ON_EXHAUSTED_ACTIONS.join('|')}`,
        `${path}.on_exhausted`,
      ),
    )
  }
  return errors
}

function validateNextStepRef(input: unknown, path: string): LoaderError[] {
  const errors: LoaderError[] = []
  if (!isObject(input)) {
    return [err('invalid_next_step', 'next_step must be an object', path)]
  }
  if (input.kind === 'static') {
    if (typeof input.step_id !== 'string' || input.step_id.length === 0) {
      errors.push(
        err(
          'invalid_next_step',
          'next_step.step_id must be a non-empty string',
          `${path}.step_id`,
        ),
      )
    }
    return errors
  }
  if (input.kind === 'conditional') {
    if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
      errors.push(
        err(
          'invalid_next_step',
          'next_step.conditions must be a non-empty array',
          `${path}.conditions`,
        ),
      )
    } else {
      for (let i = 0; i < input.conditions.length; i++) {
        const c = input.conditions[i] as Partial<ConditionalBranch>
        if (!isObject(c)) {
          errors.push(
            err(
              'invalid_next_step',
              'conditional branch must be an object',
              `${path}.conditions[${i}]`,
            ),
          )
          continue
        }
        if (typeof c.when !== 'string' || c.when.length === 0) {
          errors.push(
            err(
              'invalid_next_step',
              'conditional branch.when must be a non-empty string',
              `${path}.conditions[${i}].when`,
            ),
          )
        }
        if (typeof c.then !== 'string' || c.then.length === 0) {
          errors.push(
            err(
              'invalid_next_step',
              'conditional branch.then must be a non-empty step_id',
              `${path}.conditions[${i}].then`,
            ),
          )
        }
      }
    }
    if (typeof input.default !== 'string' || input.default.length === 0) {
      errors.push(
        err(
          'invalid_next_step',
          'next_step.default must be a non-empty step_id',
          `${path}.default`,
        ),
      )
    }
    return errors
  }
  errors.push(
    err(
      'invalid_next_step',
      'next_step.kind must be "static" or "conditional"',
      `${path}.kind`,
    ),
  )
  return errors
}

// ─── validateLibreto · structural checks ─────────────────────────────

export function validateLibreto(
  libreto: Libreto,
): ReadonlyArray<LoaderError> {
  const errors: LoaderError[] = []
  const stepsById = new Map<string, Step>()

  // 1. Duplicate step_id check + index.
  for (let i = 0; i < libreto.steps.length; i++) {
    const step = libreto.steps[i]!
    if (stepsById.has(step.step_id)) {
      errors.push(
        err(
          'duplicate_step_id',
          `duplicate step_id "${step.step_id}"`,
          `$.steps[${i}].step_id`,
        ),
      )
    } else {
      stepsById.set(step.step_id, step)
    }
  }

  // 2. Entry step exists.
  if (!stepsById.has(libreto.entry_step_id)) {
    errors.push(
      err(
        'invalid_entry',
        `entry_step_id "${libreto.entry_step_id}" not found in steps`,
        '$.entry_step_id',
      ),
    )
  }

  // 3. Every next_step / fork.branches / fork.join_at / join.waits_for /
  //    gate.next_step_rejected ref resolves to a known step.
  for (const step of libreto.steps) {
    switch (step.step_type) {
      case 'action':
        errors.push(...refsResolve(step.next_step, stepsById, step.step_id))
        break
      case 'gate_camino_iii':
      case 'gate_hitl':
      case 'gate_144': {
        errors.push(...refsResolve(step.next_step, stepsById, step.step_id))
        const g = step as GateStep
        if (g.next_step_rejected && !stepsById.has(g.next_step_rejected)) {
          errors.push(
            err(
              'unknown_step_ref',
              `gate "${step.step_id}".next_step_rejected → "${g.next_step_rejected}" not found`,
              `step:${step.step_id}.next_step_rejected`,
            ),
          )
        }
        break
      }
      case 'fork': {
        const f = step as ForkStep
        for (const br of f.branches) {
          if (!stepsById.has(br)) {
            errors.push(
              err(
                'unknown_step_ref',
                `fork "${step.step_id}".branches → "${br}" not found`,
                `step:${step.step_id}.branches`,
              ),
            )
          }
        }
        if (!stepsById.has(f.join_at)) {
          errors.push(
            err(
              'unknown_step_ref',
              `fork "${step.step_id}".join_at → "${f.join_at}" not found`,
              `step:${step.step_id}.join_at`,
            ),
          )
        }
        break
      }
      case 'join': {
        const j = step as JoinStep
        for (const w of j.waits_for) {
          if (!stepsById.has(w)) {
            errors.push(
              err(
                'unknown_step_ref',
                `join "${step.step_id}".waits_for → "${w}" not found`,
                `step:${step.step_id}.waits_for`,
              ),
            )
          }
        }
        errors.push(...refsResolve(j.next_step, stepsById, step.step_id))
        break
      }
      case 'terminal_success':
      case 'terminal_failure':
        // No refs to check.
        break
    }
  }

  // 4. Reachability · every step must be reachable from entry. Detects
  //    orphan steps (typo in a next_step that points elsewhere · the
  //    orphan would never run).
  if (stepsById.has(libreto.entry_step_id)) {
    const reachable = computeReachable(libreto.entry_step_id, stepsById)
    for (const step of libreto.steps) {
      if (!reachable.has(step.step_id)) {
        errors.push(
          err(
            'unreachable_step',
            `step "${step.step_id}" is not reachable from entry "${libreto.entry_step_id}"`,
            `step:${step.step_id}`,
          ),
        )
      }
    }
  }

  return errors
}

function refsResolve(
  ref: NextStepRef,
  stepsById: Map<string, Step>,
  fromStepId: string,
): LoaderError[] {
  const errors: LoaderError[] = []
  if (ref.kind === 'static') {
    if (!stepsById.has(ref.step_id)) {
      errors.push(
        err(
          'unknown_step_ref',
          `step "${fromStepId}".next_step → "${ref.step_id}" not found`,
          `step:${fromStepId}.next_step`,
        ),
      )
    }
    return errors
  }
  for (let i = 0; i < ref.conditions.length; i++) {
    const c = ref.conditions[i]!
    if (!stepsById.has(c.then)) {
      errors.push(
        err(
          'unknown_step_ref',
          `step "${fromStepId}".next_step.conditions[${i}].then → "${c.then}" not found`,
          `step:${fromStepId}.next_step.conditions[${i}].then`,
        ),
      )
    }
  }
  if (!stepsById.has(ref.default)) {
    errors.push(
      err(
        'unknown_step_ref',
        `step "${fromStepId}".next_step.default → "${ref.default}" not found`,
        `step:${fromStepId}.next_step.default`,
      ),
    )
  }
  return errors
}

function computeReachable(
  entry: string,
  stepsById: Map<string, Step>,
): Set<string> {
  const reachable = new Set<string>()
  const stack: string[] = [entry]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const step = stepsById.get(id)
    if (!step) continue
    for (const successor of successors(step)) {
      if (!reachable.has(successor)) stack.push(successor)
    }
  }
  return reachable
}

function successors(step: Step): string[] {
  switch (step.step_type) {
    case 'action':
      return nextStepIds((step as ActionStep).next_step)
    case 'gate_camino_iii':
    case 'gate_hitl':
    case 'gate_144': {
      const g = step as GateStep
      const out = nextStepIds(g.next_step)
      if (g.next_step_rejected) out.push(g.next_step_rejected)
      return out
    }
    case 'fork': {
      const f = step as ForkStep
      return [...f.branches]
    }
    case 'join':
      return nextStepIds((step as JoinStep).next_step)
    case 'terminal_success':
    case 'terminal_failure':
      return []
  }
}

function nextStepIds(ref: NextStepRef): string[] {
  if (ref.kind === 'static') return [ref.step_id]
  const out = ref.conditions.map((c) => c.then)
  out.push(ref.default)
  return out
}
