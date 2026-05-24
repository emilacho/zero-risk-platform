/**
 * Anthropic SDK call retry helper · Sprint 8D Fase 1 cuenta #1 closure.
 *
 * Wraps `query()` stream consumption with exponential backoff retry on
 * Anthropic API transient capacity errors. Observed in Journey B exec
 * 12125 + 12157 smokes 2026-05-24 · multiple consecutive failures of ·
 *
 *   "The service was not able to process your request"
 *   "Overloaded"
 *   "Server-side issue"
 *
 * These are Anthropic-side capacity / rate-limit transients · NOT bad
 * client requests · safe to retry. Non-transient errors (e.g. invalid
 * model · authentication failure · 4xx) pass through immediately so the
 * caller surfaces them honestly.
 *
 * Returns the same shape as the wrapped call. Records retry count in the
 * returned metadata for observability.
 */

export interface SdkRetryMeta {
  /** How many attempts were needed to succeed (1 = first try). */
  attempts: number
  /** Was the final attempt a retry (true) or first-try success (false)? */
  retried: boolean
  /** Transient error messages from failed attempts (for audit). */
  transientErrors: string[]
}

/** Exponential backoff delays in ms · 3 attempts total (initial + 2 retries). */
export const SDK_CALL_RETRY_DELAYS_MS = [1000, 3000, 10000]

/**
 * Substrings (case-insensitive) that mark an Anthropic error as transient
 * and safe to retry. Matched against the exception message.
 */
const TRANSIENT_PATTERNS = [
  'service was not able to process',
  'overloaded',
  'server-side issue',
  'temporarily unavailable',
  'request timed out',
  'connection reset',
  'connection aborted',
  '502 bad gateway',
  '503 service unavailable',
  '504 gateway timeout',
  'econnreset',
  'etimedout',
]

function isTransient(err: unknown): { transient: boolean; message: string } {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  const transient = TRANSIENT_PATTERNS.some((p) => lower.includes(p))
  return { transient, message }
}

/**
 * Run an async function with retry on Anthropic transient errors.
 * Non-transient errors throw immediately. After all retries exhausted,
 * the last transient error is re-thrown.
 */
export async function callSdkWithRetry<T>(
  fn: () => Promise<T>,
  context: { canonicalSlug: string },
): Promise<{ result: T; retry: SdkRetryMeta }> {
  const transientErrors: string[] = []
  for (let attempt = 0; attempt < SDK_CALL_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await fn()
      return {
        result,
        retry: {
          attempts: attempt + 1,
          retried: attempt > 0,
          transientErrors,
        },
      }
    } catch (err) {
      const { transient, message } = isTransient(err)
      const isLast = attempt === SDK_CALL_RETRY_DELAYS_MS.length - 1
      if (!transient) {
        // Non-transient · surface immediately · no retry noise.
        throw err
      }
      transientErrors.push(`attempt ${attempt + 1}/${SDK_CALL_RETRY_DELAYS_MS.length} · ${message.slice(0, 200)}`)
      if (isLast) {
        console.error(
          `[sdk-call-retry] ERROR ${context.canonicalSlug} · exhausted ${SDK_CALL_RETRY_DELAYS_MS.length} attempts · last·${message.slice(0, 200)}`,
        )
        throw err
      }
      const delay = SDK_CALL_RETRY_DELAYS_MS[attempt]
      console.warn(
        `[sdk-call-retry] WARN ${context.canonicalSlug} · attempt ${attempt + 1} transient · sleeping ${delay}ms · ${message.slice(0, 150)}`,
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
  // Unreachable · loop returns or throws.
  throw new Error('callSdkWithRetry · loop exited unexpectedly')
}
