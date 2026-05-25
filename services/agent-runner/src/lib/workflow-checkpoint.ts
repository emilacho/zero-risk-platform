/**
 * Workflow Checkpoint/Resume Pattern · Sprint 8D canon (2026-05-25 CC#2)
 *
 * Idempotency guardrail #3 (per `wiki/decisions/2026-05-24-canon-loop-coherente-6-guardrails.md`).
 * Prevents duplicate upstream work when a workflow is re-triggered with the
 * same (workflow_id, client_id, step_name) tuple · CC#3 forensics deep
 * detected $7.78 waste/day from 3 Peniche re-smokes restarting Steps 1+4+5
 * from scratch.
 *
 * Public API ·
 *   getCheckpoint        · read existing checkpoint for tuple · null if none
 *   shouldSkipStep       · true iff completed-canonical · returns cached output_ref
 *   saveCheckpoint       · upsert (pending → in_progress → completed/failed)
 *   listCheckpointsForClient · all rows for a (workflow_id, client_id) pair · debug
 *
 * Semantics canonical ·
 *   - status='completed' + output_ref → callers may skip step + re-hydrate
 *     cached output from output_ref (e.g. agents_log row id)
 *   - status='in_progress' → concurrent run · callers should NOT also start
 *     (race-safe via unique constraint on insert)
 *   - status='failed' → re-trigger allowed by default · failed steps re-run
 *   - status='skipped' → caller explicitly skipped (e.g. agent identity_md
 *     didn't declare tool · caller can record reason)
 *
 * Force-restart override · callers pass `forceRestart=true` to bypass cache
 * (shouldSkipStep returns false regardless of stored status · save still
 * writes new state). Use for HITL rejection re-runs · operator-forced
 * fresh-start smokes · etc.
 *
 * Errors · all functions log via console.warn + return null/false on
 * Supabase failures · NEVER throw upstream (graceful degradation · canon
 * fire-and-forget pattern). Callers must NOT depend on checkpoint write
 * success for correctness · only optimization.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type CheckpointStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface Checkpoint {
  id: string
  workflow_id: string
  workflow_execution_id: string | null
  client_id: string | null
  step_name: string
  step_status: CheckpointStatus
  output_ref: Record<string, unknown> | null
  cost_usd: number | null
  duration_ms: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface CheckpointKey {
  workflowId: string
  clientId: string | null
  stepName: string
}

export interface CheckpointSaveInput extends CheckpointKey {
  workflowExecutionId?: string | null
  status: CheckpointStatus
  outputRef?: Record<string, unknown> | null
  costUsd?: number | null
  durationMs?: number | null
  errorMessage?: string | null
}

export interface ShouldSkipResult {
  skip: boolean
  reason: 'no_client_id' | 'force_restart' | 'no_checkpoint' | 'in_progress' | 'failed' | 'completed' | 'unknown_status'
  checkpoint: Checkpoint | null
}

/**
 * Read a checkpoint for the given (workflow_id, client_id, step_name) tuple.
 * Returns null if no row exists or client_id missing (checkpointing requires
 * a non-null client_id per schema constraint).
 */
export async function getCheckpoint(
  supabase: SupabaseClient,
  key: CheckpointKey,
): Promise<Checkpoint | null> {
  if (!key.clientId) return null
  try {
    const { data, error } = await supabase
      .from('workflow_checkpoints')
      .select('*')
      .eq('workflow_id', key.workflowId)
      .eq('client_id', key.clientId)
      .eq('step_name', key.stepName)
      .maybeSingle()
    if (error) {
      console.warn('[workflow-checkpoint] getCheckpoint error', error.message)
      return null
    }
    return (data as Checkpoint | null) ?? null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[workflow-checkpoint] getCheckpoint exception', msg)
    return null
  }
}

/**
 * Should the caller skip this step? · Returns canonical decision + reason
 * + cached checkpoint (if any).
 *
 * Decision rules ·
 *   - clientId null → no skip (no checkpointing without client) · reason='no_client_id'
 *   - forceRestart=true → no skip · reason='force_restart' (checkpoint still loaded for context)
 *   - no checkpoint row → no skip · reason='no_checkpoint'
 *   - status='completed' → skip · reason='completed' (cached output available)
 *   - status='in_progress' → no skip · reason='in_progress' (concurrent caller may finish first · we proceed)
 *   - status='failed' → no skip · reason='failed' (retry allowed)
 *   - status='skipped' → no skip · reason='unknown_status' (treat as fresh)
 *   - status='pending' → no skip · reason='unknown_status' (treat as fresh)
 */
export async function shouldSkipStep(
  supabase: SupabaseClient,
  key: CheckpointKey,
  options: { forceRestart?: boolean } = {},
): Promise<ShouldSkipResult> {
  if (!key.clientId) {
    return { skip: false, reason: 'no_client_id', checkpoint: null }
  }
  const cp = await getCheckpoint(supabase, key)
  if (options.forceRestart) {
    return { skip: false, reason: 'force_restart', checkpoint: cp }
  }
  if (!cp) {
    return { skip: false, reason: 'no_checkpoint', checkpoint: null }
  }
  if (cp.step_status === 'completed') {
    return { skip: true, reason: 'completed', checkpoint: cp }
  }
  if (cp.step_status === 'in_progress') {
    return { skip: false, reason: 'in_progress', checkpoint: cp }
  }
  if (cp.step_status === 'failed') {
    return { skip: false, reason: 'failed', checkpoint: cp }
  }
  return { skip: false, reason: 'unknown_status', checkpoint: cp }
}

/**
 * Upsert a checkpoint for the (workflow_id, client_id, step_name) tuple.
 * Uses the unique constraint to avoid duplicate rows · concurrent inserts
 * will produce a single canonical row (last writer wins for status updates).
 *
 * Returns true on success · false on failure (logged · graceful).
 */
export async function saveCheckpoint(
  supabase: SupabaseClient,
  input: CheckpointSaveInput,
): Promise<boolean> {
  if (!input.clientId) {
    // No-op when client_id missing · cannot enforce uniqueness without it
    return false
  }
  try {
    const row = {
      workflow_id: input.workflowId,
      workflow_execution_id: input.workflowExecutionId ?? null,
      client_id: input.clientId,
      step_name: input.stepName,
      step_status: input.status,
      output_ref: input.outputRef ?? null,
      cost_usd: input.costUsd ?? null,
      duration_ms: input.durationMs ?? null,
      error_message: input.errorMessage ?? null,
    }
    const { error } = await supabase
      .from('workflow_checkpoints')
      .upsert(row, { onConflict: 'workflow_id,client_id,step_name' })
    if (error) {
      console.warn('[workflow-checkpoint] saveCheckpoint error', error.message)
      return false
    }
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[workflow-checkpoint] saveCheckpoint exception', msg)
    return false
  }
}

/**
 * List all checkpoints for a (workflow_id, client_id) pair · debug/inspection.
 * Returns empty array on error or missing client_id.
 */
export async function listCheckpointsForClient(
  supabase: SupabaseClient,
  workflowId: string,
  clientId: string | null,
): Promise<Checkpoint[]> {
  if (!clientId) return []
  try {
    const { data, error } = await supabase
      .from('workflow_checkpoints')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[workflow-checkpoint] listCheckpointsForClient error', error.message)
      return []
    }
    return (data as Checkpoint[]) ?? []
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[workflow-checkpoint] listCheckpointsForClient exception', msg)
    return []
  }
}

/**
 * Resolve the canonical force_restart flag from an input shape that may
 * carry the flag at top level, under context, or as a string. Used by
 * agent-sdk-runner to interpret n8n workflow input.
 */
export function resolveForceRestart(input: unknown): boolean {
  if (input == null || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  if (obj.forceRestart === true || obj.force_restart === true) return true
  if (typeof obj.context === 'object' && obj.context != null) {
    const ctx = obj.context as Record<string, unknown>
    if (ctx.forceRestart === true || ctx.force_restart === true) return true
  }
  return false
}
