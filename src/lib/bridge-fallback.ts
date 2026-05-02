/**
 * Bridge fallback helper · Wave 17 · CC#2 · T2
 *
 * Extracts the repeated pattern from W16's 12 backend endpoints:
 *
 *   try {
 *     const { data, error } = await supabase.from(...).insert(row)...
 *     if (error) return { fallback_mode: true, ... }
 *     return { ok: true, persisted_id: data.id }
 *   } catch (err) {
 *     return { fallback_mode: true, ... }
 *   }
 *
 * The helpers below preserve the W16 contract (workflows always get 200 + a
 * shape they can read) but DRY the boilerplate so future bridge endpoints
 * (Notion, ad-platform readers, GHL real-API tier) can opt in with one call.
 *
 * Three flavors so callers don't have to bend their op shape:
 *
 *   withSupabaseResult<T>(op, ctx?)
 *     For Supabase ops that resolve with `{ data, error }` (the standard PG
 *     postgrest return). Detects both the explicit `error` branch AND thrown
 *     exceptions. Returns `{ data: T | null, fallback_mode, reason? }`.
 *
 *   withFallback<T>(op, fallback, ctx?)
 *     Generic wrapper for any async op that may throw. Returns
 *     `{ data: T, fallback_mode, reason? }` — falls back to `fallback`
 *     argument on exception.
 *
 *   ladderFallback<T>(tiers, ctx?)
 *     N-tier source ladder (preferred → heuristic → legacy → stub). Tries
 *     each tier in order until one resolves with non-null data. Useful for
 *     read endpoints with multiple data sources of varying freshness.
 *
 * Sentry breadcrumbs are emitted on fallback so post-mortem can find which
 * endpoint silently degraded. No-op if Sentry isn't initialized.
 */

export interface FallbackResult<T> {
  /** The data returned by the op, or the fallback value when degraded. */
  data: T | null
  /** `true` when the op failed and we fell back. `false` on the happy path. */
  fallback_mode: boolean
  /** Human-readable reason — only present when `fallback_mode` is true. */
  reason?: string
}

interface BridgeContext {
  /**
   * Short identifier of the calling endpoint, e.g. "/api/churn-predictions"
   * or "tiktok-ads/campaigns". Surfaces in Sentry breadcrumb + log line.
   */
  context?: string
}

// ---------- Sentry breadcrumb (lazy, optional) -------------------------------

/**
 * Best-effort Sentry breadcrumb on fallback. We do not import @sentry/nextjs
 * at module top-level because:
 *   1. Tests (vitest) don't always wire Sentry.
 *   2. Some callers run in the Edge runtime where the Node SDK isn't loaded.
 *
 * The dynamic import is wrapped in try/catch so a failed/missing Sentry
 * never affects the helper's behavior.
 */
async function emitSentryBreadcrumb(reason: string, ctx?: string): Promise<void> {
  try {
    const sentry = await import('@sentry/nextjs').catch(() => null)
    if (!sentry || typeof sentry.addBreadcrumb !== 'function') return
    sentry.addBreadcrumb({
      category: 'bridge-fallback',
      level: 'warning',
      message: ctx ? `${ctx}: ${reason}` : reason,
      data: { context: ctx ?? null, reason },
    })
  } catch {
    // swallow — never let observability break the request path
  }
}

// ---------- withSupabaseResult ----------------------------------------------

/**
 * Wraps a Supabase op (anything that resolves with `{ data, error }`).
 *
 * Behavior:
 *   - op resolves with data + no error → `{ data, fallback_mode: false }`
 *   - op resolves with error           → `{ data: null, fallback_mode: true, reason: error.message }`
 *   - op throws                        → `{ data: null, fallback_mode: true, reason: <exception> }`
 *
 * Examples:
 *
 *   const r = await withSupabaseResult(() =>
 *     supabase.from('churn_predictions').insert(row).select('id').single(),
 *     { context: '/api/churn-predictions' },
 *   )
 *   if (r.fallback_mode) {
 *     return NextResponse.json({ ok: true, fallback_mode: true, persisted_id: null, note: r.reason })
 *   }
 *   return NextResponse.json({ ok: true, persisted_id: (r.data as any)?.id })
 */
export async function withSupabaseResult<T>(
  op: () => Promise<{ data: T | null; error: { message: string } | null } | null | undefined>,
  ctx?: BridgeContext,
): Promise<FallbackResult<T>> {
  try {
    const result = await op()
    if (!result) {
      const reason = 'Supabase op returned undefined/null result'
      await emitSentryBreadcrumb(reason, ctx?.context)
      return { data: null, fallback_mode: true, reason }
    }
    if (result.error) {
      const reason = `DB write failed: ${String(result.error.message ?? 'unknown').slice(0, 200)}`
      await emitSentryBreadcrumb(reason, ctx?.context)
      return { data: null, fallback_mode: true, reason }
    }
    return { data: result.data ?? null, fallback_mode: false }
  } catch (err) {
    const reason = `DB exception: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
    await emitSentryBreadcrumb(reason, ctx?.context)
    return { data: null, fallback_mode: true, reason }
  }
}

// ---------- withFallback (generic) ------------------------------------------

/**
 * Generic async wrapper. Use when the op is not a Supabase chain — e.g.,
 * fetching from an external API where you want a deterministic fallback
 * payload rather than 5xx propagation.
 *
 * On exception, returns `{ data: fallback, fallback_mode: true, reason }`.
 * On happy path, returns `{ data: <op result>, fallback_mode: false }`.
 *
 * Example:
 *
 *   const r = await withFallback(
 *     () => fetchTikTokAdsCampaignList(clientId),
 *     [],  // empty array fallback
 *     { context: '/api/tiktok-ads/campaigns' },
 *   )
 *   return NextResponse.json({ ok: true, count: r.data?.length ?? 0, campaigns: r.data, ...(r.fallback_mode ? { fallback_mode: true } : {}) })
 */
export async function withFallback<T>(
  op: () => Promise<T>,
  fallback: T,
  ctx?: BridgeContext,
): Promise<FallbackResult<T>> {
  try {
    const data = await op()
    return { data, fallback_mode: false }
  } catch (err) {
    const reason = `op exception: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
    await emitSentryBreadcrumb(reason, ctx?.context)
    return { data: fallback, fallback_mode: true, reason }
  }
}

// ---------- ladderFallback (N-tier source ladder) ---------------------------

/**
 * Try each tier in order until one returns non-null data. Useful for read
 * endpoints with a preferred → heuristic → legacy → stub source ladder.
 *
 * Each tier is `() => Promise<T | null>`. A tier that throws or resolves to
 * null/undefined moves to the next. The final tier should always succeed
 * (typically a deterministic stub) — if all tiers fail, returns
 * `{ data: null, fallback_mode: true, reason: <last error> }`.
 *
 * Example:
 *
 *   const r = await ladderFallback<Champion[]>([
 *     () => readFromGhlApi(clientId),       // preferred
 *     () => readFromCachedSnapshot(clientId), // heuristic
 *     () => Promise.resolve(stubChampions(clientId)),  // stub
 *   ], { context: '/api/ghl/primary-champion' })
 */
export async function ladderFallback<T>(
  tiers: Array<() => Promise<T | null | undefined>>,
  ctx?: BridgeContext,
): Promise<FallbackResult<T>> {
  let lastReason = 'no tiers defined'
  let degraded = false

  for (let i = 0; i < tiers.length; i++) {
    try {
      const data = await tiers[i]()
      if (data !== null && data !== undefined) {
        // First tier wins on the happy path; subsequent tiers count as fallback.
        return { data, fallback_mode: degraded, ...(degraded ? { reason: `served by tier ${i} after upstream failures` } : {}) }
      }
      lastReason = `tier ${i} returned null/undefined`
      degraded = true
    } catch (err) {
      lastReason = `tier ${i} threw: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
      degraded = true
      await emitSentryBreadcrumb(lastReason, ctx?.context)
    }
  }

  // All tiers exhausted without a non-null answer.
  await emitSentryBreadcrumb(`all tiers exhausted: ${lastReason}`, ctx?.context)
  return { data: null, fallback_mode: true, reason: `all tiers exhausted: ${lastReason}` }
}
