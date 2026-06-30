/**
 * Dry-Run Mode · Sprint 9 entry canon (2026-05-25 CC#2)
 *
 * Architectural spike `wiki/decisions/2026-05-25-cc2-dry-run-mass-audit-brazos-ejecutores-spike.md`.
 * Habilita mass-audit functional Phase 2 · validate 58 workflows pipelines
 * end-to-end SIN gastar LLM cost (~$3 total vs $30-100 sin dry-run).
 *
 * Activation patterns canonical · multi-source priority (mirror `resolveForceRestart`
 * from CC#2 PR #111 workflow-checkpoint canon) ·
 *
 *   1. Request body top-level `dry_run: true` (n8n httpRequest jsonBody)
 *   2. Nested `context.dry_run: true` (workflows that forward context entire)
 *   3. Header `X-Dry-Run: true` (curl tests · operator manual)
 *   4. Env var `DRY_RUN_DEFAULT=true` (panic button global · production warn)
 *
 * Default · false ALWAYS unless explicit source. Production guards · default off ·
 * panic-button env warn on startup if active · agents_log.input.dry_run + metadata
 * persisted for audit · prevent silent dry-run masquerading as real execution.
 *
 * Canon principle · dry-run validates STRUCTURE / PLUMBING (workflow integration ·
 * webhook routing · checkpoint logic · workflow_id enforcement) · NOT agent
 * reasoning output. Downstream consumers parse responseText for next-step
 * branching · canonical fake provides predictable placeholder.
 */

export interface DryRunResolveInput {
  body?: Record<string, unknown> | null
  context?: Record<string, unknown> | null
  headers?: Record<string, string | undefined> | null
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}

/**
 * Resolve the canonical dry-run flag from a multi-source input.
 *
 * Returns true if ANY source declares dry_run=true · default false.
 * Order is informational only · "first true wins" semantics work
 * identically since output is boolean OR.
 */
export function resolveDryRun(input: DryRunResolveInput = {}): boolean {
  // 1. Body top-level
  if (input.body) {
    if ((input.body as Record<string, unknown>).dry_run === true) return true
    if ((input.body as Record<string, unknown>).dryRun === true) return true
  }
  // 2. Nested context
  if (input.context && typeof input.context === 'object') {
    const ctx = input.context as Record<string, unknown>
    if (ctx.dry_run === true) return true
    if (ctx.dryRun === true) return true
  }
  // 3. Header
  if (input.headers) {
    const h = input.headers
    const v =
      h['x-dry-run'] ?? h['X-Dry-Run'] ?? h['X-DRY-RUN'] ?? h['x-dryrun'] ?? null
    if (typeof v === 'string' && v.toLowerCase() === 'true') return true
  }
  // 4. Env var panic button
  if (input.env) {
    const e = input.env.DRY_RUN_DEFAULT
    if (typeof e === 'string' && e.toLowerCase() === 'true') return true
  }
  return false
}

/**
 * Shape canonical of the fake stream-drain result returned when dry-run mode
 * is active. Mirrors the StreamDrainResult interface from agent-sdk-runner.ts
 * · keep in sync if upstream shape changes (compile-time check via typed
 * intersection at the call site).
 */
export interface DryRunFakeResponse {
  sessionId: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  cacheCreation5mTokens: number
  cacheCreation1hTokens: number
  responseText: string
  /**
   * SPEC lazo agentico 2026-06-05 follow-up · Discovery tool capture · always
   * null in dry-run (the canonical fake doesn't invoke MCP tools · `discoveryToolCall`
   * surface stays canonical so downstream typing stays simple).
   */
  discoveryToolCall: null
  /** Brand Book · siempre null en dry-run (no invoca MCP tools). */
  brandSectionToolCall: null
}

/**
 * Build the canonical dry-run fake response.
 *
 * Single-shape fake (NOT per-agent_slug differentiation) · canon principle
 * dry-run validates plumbing not reasoning. Response text format embeds the
 * canonical slug + truncated task description so downstream parsers can
 * branch predictably (e.g. n8n Code nodes that check responseText prefix).
 *
 * Token counts · all zero (no Anthropic API call · no MCP tool invocation ·
 * no Client Brain enrichment). Cost computation downstream produces 0
 * automatically given zero token inputs.
 */
export function buildDryRunFakeResponse(
  slug: string,
  task: string,
): DryRunFakeResponse {
  const taskExcerpt =
    task.length > 100 ? `${task.slice(0, 100)}...` : task
  return {
    sessionId: `dryrun-${slug}-${Date.now()}`,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    responseText:
      `[DRY_RUN] agent=${slug} · task="${taskExcerpt}" · canonical fake response · ` +
      `NO Anthropic API call · NO MCP tools invoked · NO Client Brain enrichment`,
    discoveryToolCall: null,
    brandSectionToolCall: null,
  }
}

/**
 * Production safety log · call once at startup if DRY_RUN_DEFAULT is set.
 * Emits a [SECURITY] tagged warning so monitoring/ops surface it quickly.
 * Idempotent (no internal state · safe to call repeatedly) but intended
 * for one-shot invocation in server bootstrap.
 */
export function warnIfPanicButtonActive(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const v = env.DRY_RUN_DEFAULT
  if (typeof v === 'string' && v.toLowerCase() === 'true') {
    console.warn(
      '[SECURITY] DRY_RUN_DEFAULT=true active · ALL agent invocations will return canonical fake responses · zero LLM cost · production traffic IS DEGRADED · revert env var to restore normal operation',
    )
  }
}
