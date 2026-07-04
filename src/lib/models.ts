/**
 * Central Claude model config (src side) · single source of truth for direct
 * Anthropic calls made from Next.js code (brand-analyzer, meta-agent,
 * generate-content, …). Mirrors the agent-runner's MODEL_MAP
 * (services/agent-runner/src/lib/agent-sdk-runner.ts) so the two stay aligned.
 *
 * WHY THIS FILE EXISTS (CC#3 2026-07-04): the stale id `claude-sonnet-4-20250514`
 * was hardcoded in 3 places and returned Anthropic 404 (model not found) — it
 * broke the Day-1 onboarding discovery (`/api/onboarding` → OnboardingOrchestrator
 * → BrandAnalyzer). Routing every ref through here means retuning the model is a
 * one-line change, no re-drift.
 *
 * To retune: update the value here (keep in sync with the agent-runner MODEL_MAP).
 */

/** Canonical current model ids · keep in sync with agent-runner MODEL_MAP. */
export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const

/** Default model for analysis-grade direct Anthropic calls (Sonnet). */
export const DEFAULT_ANALYSIS_MODEL: string = MODELS.sonnet

const ALIASES: Record<string, string> = {
  'claude-sonnet': MODELS.sonnet,
  'claude-sonnet-4-6': MODELS.sonnet,
  'claude-opus': MODELS.opus,
  'claude-opus-4-6': MODELS.opus,
  'claude-haiku': MODELS.haiku,
  'claude-haiku-4-5': MODELS.haiku,
  'claude-haiku-4-5-20251001': MODELS.haiku,
  // deprecated / drifted ids → current Sonnet (defensive · so an old override
  // string never 404s again).
  'claude-sonnet-4-20250514': MODELS.sonnet,
}

/**
 * Resolve a model key/alias to a valid current id. Unknown/empty → the default
 * analysis model. Never returns a deprecated id.
 */
export function resolveModel(key?: string | null): string {
  if (!key) return DEFAULT_ANALYSIS_MODEL
  return ALIASES[key] ?? DEFAULT_ANALYSIS_MODEL
}
