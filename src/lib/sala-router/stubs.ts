/**
 * Canon canonical · `src/lib/sala-router/stubs.ts` ·
 * Sprint 12 Fase 0 Ronda 3 Track H.
 *
 * Test-friendly stubs for the 2 external contracts the router depends
 * on but doesn't ship inside this PR:
 *   - the Track G libreto interpreter (`resolveNextStep`)
 *   - the G6 budget-check bucket
 *
 * Per spec §5 + §2 (shadow / NO wire), the router operates against
 * stubs in this PR. The Mitad 2 wire-up (§144-gated) swaps these for
 * the real interpreter (CC#4 follow-up) and the real G6 bucket.
 *
 * §148 honest · this file is SHIPPED for tests + downstream callers
 * that want a deterministic dry-run · NOT for production routing.
 * The Ronda 4 build (post §144) replaces these with the real seams.
 */

import type { Step, NextStepRef } from '@/lib/sala/libretos'
import type { BudgetCheckFn, ResolveNextStepFn } from './types'

// =====================================================================
// Interpreter stub · simple registry-walker, no expression language
// =====================================================================

/**
 * Canon canonical · the simplest interpreter that obeys the libreto's
 * `next_step` reference. Handles `static` (always go here) +
 * `conditional` (first matching predicate wins · default fallback).
 *
 * Predicate evaluation is INTENTIONALLY DUMB in the stub · it only
 * supports two patterns useful for tests:
 *   1. The string `"true"` always matches.
 *   2. A JSONPath-ish prefix `"event."` or `"journey_state."` matches
 *      when the referenced field is truthy.
 * Anything else returns `false`.
 *
 * The real interpreter (CC#4 PR follow-up) implements the full
 * predicate registry (named predicates + JSONPath grammar).
 */
export const interpreterStub: ResolveNextStepFn = (input) => {
  const { libreto, current_step_id } = input
  const current = libreto.steps.find((s) => s.step_id === current_step_id)
  if (!current) {
    return {
      kind: 'unresolved',
      reason: `step "${current_step_id}" not in libreto`,
    }
  }

  // Terminal steps · short-circuit, the router will emit terminal.
  if (
    current.step_type === 'terminal_success' ||
    current.step_type === 'terminal_failure'
  ) {
    return {
      kind: 'terminal',
      outcome: current.step_type === 'terminal_success' ? 'success' : 'failure',
      step_id: current.step_id,
    }
  }

  // join is structural · the router treats it as a contract bug if it
  // surfaces here · the stub mirrors that by returning unresolved.
  if (current.step_type === 'join') {
    return {
      kind: 'unresolved',
      reason: `join step "${current.step_id}" is structural · interpreter should resolve through it`,
    }
  }

  // Steps that carry a `next_step` reference (action, gate, fork)
  const next_step_ref = (current as { next_step?: NextStepRef }).next_step
  if (!next_step_ref) {
    return {
      kind: 'unresolved',
      reason: `step "${current.step_id}" carries no next_step reference`,
    }
  }

  const target_id = resolveNextStepRef(next_step_ref, input)
  if (!target_id) {
    return {
      kind: 'unresolved',
      reason: `no conditional matched and no default for step "${current.step_id}"`,
    }
  }

  const target = libreto.steps.find((s) => s.step_id === target_id)
  if (!target) {
    return {
      kind: 'unresolved',
      reason: `next step "${target_id}" not in libreto`,
    }
  }

  if (
    target.step_type === 'terminal_success' ||
    target.step_type === 'terminal_failure'
  ) {
    return {
      kind: 'terminal',
      outcome: target.step_type === 'terminal_success' ? 'success' : 'failure',
      step_id: target.step_id,
    }
  }
  if (
    target.step_type === 'gate_camino_iii' ||
    target.step_type === 'gate_hitl' ||
    target.step_type === 'gate_144'
  ) {
    return { kind: 'gate', gate_step: target }
  }
  return { kind: 'next', next_step: target as Step }
}

function resolveNextStepRef(
  ref: NextStepRef,
  ctx: Parameters<ResolveNextStepFn>[0],
): string | undefined {
  if (ref.kind === 'static') return ref.step_id
  // conditional
  for (const branch of ref.conditions) {
    if (evaluatePredicate(branch.when, ctx)) return branch.then
  }
  return ref.default
}

function evaluatePredicate(
  predicate: string,
  ctx: Parameters<ResolveNextStepFn>[0],
): boolean {
  const trimmed = predicate.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed.startsWith('event.')) {
    const path = trimmed.slice('event.'.length)
    return Boolean(getByPath(ctx.trigger_event as unknown, path))
  }
  if (trimmed.startsWith('journey_state.')) {
    const path = trimmed.slice('journey_state.'.length)
    return Boolean(getByPath(ctx.journey_state as unknown, path))
  }
  return false
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

// =====================================================================
// Bucket-key canonical formula · escalón 4 desbloqueo (2026-06-04)
// =====================================================================

/**
 * Canon canonical bucket-key formula for the G6 atomic counter.
 *
 * `t:{tenant_id}:c:{client_id}:j:{journey_type}:o:{operation_type}`
 *
 * Per-operation granularity · the cap is per operation/agent (the unit
 * of cost). Additional scopes (global, per-client, per-tenant) live in
 * SEPARATE buckets and use SEPARATE keys · future work. The router
 * COMPOSES this string, the G6 seam MATCHES on it, and seeds in
 * `rate_limit_buckets` are keyed by this exact format.
 *
 * Centralized here so any future format change ripples through the wire
 * automatically · canon §148 single source of truth.
 *
 * Examples:
 *   `t:acme:c:client-123:j:ONBOARD:o:ONBOARD.brief-strategist`
 *   `t:zero-risk:c:perez:j:PRODUCE:o:PRODUCE.campaign-brief-agent`
 */
export function buildBucketKey(input: BucketKeyInput): string {
  return [
    't',
    input.tenant_id,
    'c',
    input.client_id,
    'j',
    input.journey_type,
    'o',
    input.operation_type,
  ].join(':')
}

export interface BucketKeyInput {
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: string
  readonly operation_type: string
}

// =====================================================================
// Budget-check stub · always-allow by default, deterministic by ctor
// =====================================================================

/**
 * Canon canonical · the simplest possible budget stub · every dispatch
 * is allowed. Used in tests that do NOT exercise the budget path.
 *
 * **ASYNC** per escalón 4 desbloqueo (Option B 2026-06-04) · matches
 * `BudgetCheckFn` shape so the seam can swap in `SupabaseG6BudgetHook`
 * (PR #155) at escalón 5 without router changes.
 */
export const allowAllBudgetStub: BudgetCheckFn = async (input) => ({
  allowed: true,
  budget_key: budgetKeyOf(input),
})

/**
 * Canon canonical · a deterministic budget stub for tests that DO
 * exercise the `budget_blocked` path. Blocks dispatches whose bucket key
 * is in the deny list. Bucket key uses the canonical formula
 * `t:{tenant}:c:{client}:j:{journey}:o:{operation}` from `buildBucketKey`.
 */
export function denyByKeyBudgetStub(
  deny_keys: ReadonlyArray<string>,
  reason = 'denied by test stub',
): BudgetCheckFn {
  const deny = new Set(deny_keys)
  return async (input) => {
    const key = budgetKeyOf(input)
    if (deny.has(key)) return { allowed: false, budget_key: key, reason }
    return { allowed: true, budget_key: key }
  }
}

function budgetKeyOf(input: Parameters<BudgetCheckFn>[0]): string {
  // Per canon §148 single source of truth · prefer the bucket_key the
  // router computed via buildBucketKey() if it was passed; fall back to
  // canon canonical computation for older callers that don't pass it.
  return (
    input.bucket_key ??
    buildBucketKey({
      tenant_id: input.tenant_id,
      client_id: input.client_id,
      journey_type: input.journey_type,
      operation_type: input.operation_type,
    })
  )
}
