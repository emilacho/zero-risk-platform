/**
 * Anthropic SDK call retry helper · Sprint 8D Fase 1 cuenta #1 closure +
 * Sprint 8D tail brand-strategist Railway app-level resilience upgrade.
 *
 * Wraps `query()` stream consumption with exponential backoff retry on
 * Anthropic API + Railway-stack transient errors. Detection covers ·
 *
 *   1. String-match patterns ("overloaded" · "service was not able" ·
 *      "connection reset" · "504 gateway timeout" · etc) · backward
 *      compatible with Sprint 8D Fase 1 baseline.
 *   2. Error.code · ECONNRESET · ETIMEDOUT · ECONNREFUSED · ECONNABORTED ·
 *      EAI_AGAIN · EPIPE · structured node.js network errors that bypass
 *      string matching when the SDK swallows raw connection failures.
 *   3. HTTP status code (error.status or error.statusCode) · 5xx + 408
 *      (request timeout) + 425 (too early) all retryable · 429 (rate
 *      limit) also retryable with longer backoff.
 *
 * Driver · Peniche re-smoke exec 12796 + 12803 (2026-05-25) showed Step 3
 * brand-strategist failing with raw "The connection to the server was
 * closed unexpectedly" (ECONNRESET-equivalent · no retry triggered) +
 * "The service was not able to process your request" (HTTP 500 · was
 * matched but only 14s total backoff window insufficient for Anthropic
 * Opus 4.6 capacity recovery). Vault doc reference ·
 * raw/qa/2026-05-25-journey-b-peniche-resmoke-21-21-FINAL.md.
 *
 * Non-transient errors (invalid model · authentication · 4xx except 408/425/429)
 * pass through immediately so the caller surfaces them honestly.
 *
 * Returns the same shape as the wrapped call. Records retry metadata for
 * observability in the runner's logExecution row + Railway stdout logs.
 */

export interface SdkRetryMeta {
  /** How many attempts were needed to succeed (1 = first try). */
  attempts: number
  /** Was the final attempt a retry (true) or first-try success (false)? */
  retried: boolean
  /** Transient error messages from failed attempts (for audit). */
  transientErrors: string[]
}

/**
 * Exponential backoff for regular transients (5xx · ECONNRESET · timeouts).
 * 4 attempts total (initial + 3 retries). Total max wait · ~50s + jitter.
 * Driver · prior schedule [1s · 3s · 10s] was insufficient for Anthropic Opus
 * capacity recovery (typically 30-60s window) per Sprint 8D Peniche evidence.
 */
export const SDK_CALL_RETRY_DELAYS_MS = [5000, 15000, 30000]

/**
 * Longer backoff for HTTP 429 rate-limit errors. Anthropic typically responds
 * with Retry-After ~30-90s · we honor with [30s · 60s · 120s] = ~210s max.
 */
export const SDK_CALL_RATELIMIT_DELAYS_MS = [30000, 60000, 120000]

/** ±20% jitter to avoid thundering-herd retries from parallel agents. */
function applyJitter(baseMs: number): number {
  const factor = 0.8 + Math.random() * 0.4 // 0.8 to 1.2
  return Math.round(baseMs * factor)
}

/**
 * Substrings (case-insensitive) that mark an Anthropic-stack error as
 * transient. Matched against the exception message.
 */
const TRANSIENT_MESSAGE_PATTERNS = [
  'service was not able to process',
  'overloaded',
  'server-side issue',
  'temporarily unavailable',
  'request timed out',
  'connection reset',
  'connection aborted',
  'connection to the server was closed',
  'socket hang up',
  '502 bad gateway',
  '503 service unavailable',
  '504 gateway timeout',
  'econnreset',
  'etimedout',
  'econnrefused',
  'econnaborted',
  'epipe',
]

/** Node.js network error codes that mark a transient connection-layer failure. */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
])

/**
 * Extract HTTP status code from various error shapes the Anthropic SDK +
 * fetch + node-fetch + got etc. throw. Returns 0 if no status detectable.
 */
function extractStatus(err: unknown): number {
  if (!err || typeof err !== 'object') return 0
  const e = err as Record<string, unknown>
  if (typeof e.status === 'number') return e.status
  if (typeof e.statusCode === 'number') return e.statusCode
  const response = e.response as Record<string, unknown> | undefined
  if (response && typeof response.status === 'number') return response.status
  return 0
}

/** Extract node.js-style error code from various error shapes. */
function extractCode(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  const e = err as Record<string, unknown>
  if (typeof e.code === 'string') return e.code
  const cause = e.cause as Record<string, unknown> | undefined
  if (cause && typeof cause.code === 'string') return cause.code
  return ''
}

interface ClassifiedError {
  /** Should this error trigger a retry? */
  transient: boolean
  /** Is this a rate-limit error (use longer backoff)? */
  rateLimit: boolean
  /** Human-readable reason for classification (logged). */
  reason: string
  /** Short message for the audit trail. */
  message: string
}

export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  const status = extractStatus(err)
  const code = extractCode(err)

  // 1. Rate-limit (longer backoff)
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { transient: true, rateLimit: true, reason: `http-429-rate-limit (status=${status})`, message }
  }

  // 2. Node.js network error code (definitive · NEVER false positive)
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return { transient: true, rateLimit: false, reason: `network-error-code=${code}`, message }
  }

  // 3. HTTP 5xx + 408 + 425 (retryable server-side issues)
  if (status >= 500 && status < 600) {
    return { transient: true, rateLimit: false, reason: `http-5xx (status=${status})`, message }
  }
  if (status === 408 || status === 425) {
    return { transient: true, rateLimit: false, reason: `http-${status}-timeout-retryable`, message }
  }

  // 4. Other HTTP 4xx (NOT 408/425/429) · non-retryable client error
  if (status >= 400 && status < 500) {
    return { transient: false, rateLimit: false, reason: `http-4xx-non-retryable (status=${status})`, message }
  }

  // 5. Message-pattern fallback (SDK errors that don't expose status/code)
  if (TRANSIENT_MESSAGE_PATTERNS.some(p => lower.includes(p))) {
    return { transient: true, rateLimit: false, reason: 'message-pattern-match', message }
  }

  return { transient: false, rateLimit: false, reason: 'non-transient', message }
}

/**
 * Run an async function with retry on Anthropic / Railway transient errors.
 * Non-transient errors throw immediately. After all retries exhausted the
 * last transient error is re-thrown to the caller.
 */
export async function callSdkWithRetry<T>(
  fn: () => Promise<T>,
  context: { canonicalSlug: string },
): Promise<{ result: T; retry: SdkRetryMeta }> {
  const transientErrors: string[] = []
  // Max attempts = 1 + length of either schedule (they're aligned at 3 each).
  const maxAttempts = SDK_CALL_RETRY_DELAYS_MS.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      const classified = classifyError(err)
      const isLast = attempt === maxAttempts - 1
      if (!classified.transient) {
        // Non-transient · surface immediately · no retry noise.
        throw err
      }
      transientErrors.push(
        `attempt ${attempt + 1}/${maxAttempts} · ${classified.reason} · ${classified.message.slice(0, 200)}`,
      )
      if (isLast) {
        console.error(
          `[sdk-call-retry] ERROR ${context.canonicalSlug} · exhausted ${maxAttempts} attempts · last·${classified.reason}·${classified.message.slice(0, 200)}`,
        )
        throw err
      }
      const schedule = classified.rateLimit ? SDK_CALL_RATELIMIT_DELAYS_MS : SDK_CALL_RETRY_DELAYS_MS
      const baseDelay = schedule[attempt] ?? schedule[schedule.length - 1]
      const delay = applyJitter(baseDelay)
      console.warn(
        `[sdk-call-retry] WARN ${context.canonicalSlug} · attempt ${attempt + 1}/${maxAttempts} · ${classified.reason} · sleeping ${delay}ms (base=${baseDelay}ms · jitter applied) · ${classified.message.slice(0, 150)}`,
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
  // Unreachable · loop returns or throws.
  throw new Error('callSdkWithRetry · loop exited unexpectedly')
}
