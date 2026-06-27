/**
 * Canon canonical · agent async callback dispatch (SPEC 2026-06-09 · Track N
 * base + Track P resilience · §144 GO 2026-06-26).
 *
 * The Vercel `/api/agents/run-sdk` route POSTs the final baseResponse to an
 * optional caller-provided `callback_url` after persist hooks complete · the
 * canonical use-case is n8n's `Wait` node generating `$execution.resumeUrl`
 * (the n8n exec pauses on Wait until the URL receives a POST · then resumes
 * with the body).
 *
 * Why · n8n's HTTP client disconnects long-running requests at ~155s observed
 * 2026-06-09 (round 4 smoke) · the agent + persist take ~250-300s · canonical
 * fix is fire-and-resume via the Wait pattern.
 *
 * Track P · the callback was intermittent (round 6 VERDE, round 7 ROJO same
 * code · a single POST with no retry). When it failed silently the n8n exec
 * stayed stuck on Wait forever (900s agent wait · 24h Camino III wait) with
 * NO observability. Track P adds 3 layers of resilience ·
 *   1 · retry · up to 3 attempts with exponential backoff (2s · 4s)
 *   2 · per-attempt audit log (Supabase `agent_callback_attempts`) · wired by
 *       the caller via the `onAttempt` hook (this lib stays Supabase-free)
 *   3 · `status: 'all_retries_failed'` tag when every attempt fails · the
 *       route raises a Sentry `captureMessage` on it
 * Maps to canon guardrail 2 (retries con cap) + guardrail 4 (audit trail).
 *
 * §148 honest · this lib NEVER throws past the route boundary · all errors
 * are captured into a tagged result · the route logs + returns the canonical
 * baseResponse regardless. The callback is a SIDE EFFECT · not a contract.
 *
 * Timeout bounded · default 10s PER ATTEMPT · prevents the route from blocking
 * when the caller's webhook is slow or unreachable.
 */

/** Canon canonical · default timeout for EACH callback POST attempt · 10s.
 *  n8n's resume webhook returns 200 quickly when working · 10s is a generous
 *  cap that avoids tying up the route function indefinitely on network blips. */
export const ASYNC_CALLBACK_TIMEOUT_MS = 10_000

/** Track P · default max attempts (1 immediate + 2 retries). */
export const ASYNC_CALLBACK_MAX_ATTEMPTS = 3

/** Track P · default backoff delays applied BEFORE attempt N (1-indexed gap).
 *  index 0 = delay before attempt 2 (2s) · index 1 = delay before attempt 3 (4s).
 *  Exponential · 2s · 4s. */
export const ASYNC_CALLBACK_BACKOFF_MS: readonly number[] = [2_000, 4_000]

/** Canon canonical · how callers identify their flow via headers. */
export const ASYNC_CALLBACK_SOURCE_HEADER = 'x-zr-async-callback'

/** Track P · per-attempt status tag · persisted to the audit log. */
export type CallbackAttemptStatus =
  | 'ok'
  | 'invalid_url'
  | 'fetch_threw'
  | 'timeout'
  | 'non_2xx'
  | 'callback_threw'

/** Track P · one row of the per-attempt audit trail. The caller's `onAttempt`
 *  hook receives this and persists it to `agent_callback_attempts` (or logs to
 *  console if the table is absent). Shape mirrors the migration columns. */
export interface CallbackAttemptLog {
  readonly workflow_id: string | null
  readonly callback_url: string
  readonly attempt_number: number
  readonly status: CallbackAttemptStatus
  readonly http_status_code: number | null
  readonly error_message: string | null
  readonly attempted_at: string
}

export interface AsyncCallbackInput {
  /** Canon · the resume URL provided by the caller (e.g. `$execution.resumeUrl` from n8n). */
  readonly callback_url: string
  /** Canon · the canonical baseResponse to deliver · POSTed verbatim as JSON. */
  readonly body: Record<string, unknown>
  /** Optional · timeout override PER ATTEMPT · tests use this. */
  readonly timeout_ms?: number
  /** Optional · fetch override · tests inject. Production uses global fetch. */
  readonly fetcher?: typeof fetch
  /** Track P · max attempts · default `ASYNC_CALLBACK_MAX_ATTEMPTS` (3). */
  readonly max_attempts?: number
  /** Track P · backoff delays (ms) before attempts 2,3,… · default
   *  `ASYNC_CALLBACK_BACKOFF_MS`. Last value reused if fewer than needed. */
  readonly backoff_ms?: readonly number[]
  /** Track P · injectable sleep · default `setTimeout`-backed. Tests pass a
   *  no-op to skip the real backoff delays. */
  readonly sleep?: (ms: number) => Promise<void>
  /** Track P · fire-and-forget per-attempt audit hook. Called once per
   *  attempt with the log row. The lib does NOT await it · the caller wires
   *  the Supabase write (`agent_callback_attempts`) here. Must never throw. */
  readonly onAttempt?: (log: CallbackAttemptLog) => void
  /** Track P · workflow_id stamped onto each audit row (§149 / guardrail 4). */
  readonly workflow_id?: string | null
}

export type AsyncCallbackResult =
  | {
      readonly ok: true
      readonly status_code: number
      readonly duration_ms: number
      /** Track P · attempts taken before success (1-indexed). */
      readonly attempts: number
    }
  | {
      readonly ok: false
      readonly kind: CallbackAttemptStatus
      readonly detail: string
      readonly duration_ms: number
      readonly status_code?: number
      /** Track P · attempts taken before giving up. */
      readonly attempts: number
      /** Track P · present when EVERY retryable attempt failed · the route
       *  raises a Sentry `captureMessage('async_callback_all_retries_failed')`
       *  on this tag. Absent for terminal non-retryable failures (invalid_url). */
      readonly status?: 'all_retries_failed'
    }

/** Internal · the outcome of a SINGLE POST attempt (no retry). */
type SingleAttemptResult =
  | { readonly ok: true; readonly status_code: number; readonly duration_ms: number }
  | {
      readonly ok: false
      readonly kind: Exclude<CallbackAttemptStatus, 'ok' | 'invalid_url'>
      readonly detail: string
      readonly duration_ms: number
      readonly status_code?: number
    }

/**
 * Canon canonical · validate the URL string · accept only http(s) · reject
 * anything else (file://, javascript:, data:, etc.) to prevent SSRF against
 * loopback or filesystem paths. Returns the parsed URL or null.
 */
export function validateCallbackUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return u
}

/** Internal · a single timeout-bounded POST to the (already validated) URL. */
async function attemptCallbackOnce(
  url: URL,
  input: AsyncCallbackInput,
): Promise<SingleAttemptResult> {
  const start = Date.now()
  const fetcher = input.fetcher ?? fetch
  const timeout_ms = input.timeout_ms ?? ASYNC_CALLBACK_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout_ms)

  let res: Response
  try {
    res = await fetcher(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [ASYNC_CALLBACK_SOURCE_HEADER]: 'agents-run-sdk',
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    const duration_ms = Date.now() - start
    const isAbort = e instanceof Error && e.name === 'AbortError'
    if (isAbort) {
      return {
        ok: false,
        kind: 'timeout',
        detail: `callback POST exceeded ${timeout_ms}ms`,
        duration_ms,
      }
    }
    return {
      ok: false,
      kind: 'fetch_threw',
      detail: e instanceof Error ? e.message : String(e),
      duration_ms,
    }
  }
  clearTimeout(timer)

  const duration_ms = Date.now() - start
  if (!res.ok) {
    return {
      ok: false,
      kind: 'non_2xx',
      detail: `callback URL responded ${res.status}`,
      duration_ms,
      status_code: res.status,
    }
  }
  return { ok: true, status_code: res.status, duration_ms }
}

/** Internal · safely fire the audit hook · never let it break the dispatch. */
function emitAttemptLog(
  input: AsyncCallbackInput,
  attempt: number,
  result: SingleAttemptResult | { ok: false; kind: 'invalid_url'; detail: string },
): void {
  if (!input.onAttempt) return
  const status: CallbackAttemptStatus = result.ok ? 'ok' : result.kind
  const http_status_code =
    'status_code' in result && typeof result.status_code === 'number'
      ? result.status_code
      : null
  try {
    input.onAttempt({
      workflow_id: input.workflow_id ?? null,
      callback_url: input.callback_url,
      attempt_number: attempt,
      status,
      http_status_code,
      error_message: result.ok ? null : result.detail,
      attempted_at: new Date().toISOString(),
    })
  } catch {
    // The audit hook must never break the dispatch · swallow.
  }
}

/**
 * Canon canonical · POST the baseResponse to the callback URL with Track P
 * resilience · up to `max_attempts` attempts (default 3) with exponential
 * backoff (2s · 4s) · timeout bounded PER attempt · never throws. Each
 * attempt is reported to `onAttempt` for the audit trail.
 *
 * Returns `ok:true` on the first 2xx (short-circuits remaining retries).
 * Returns `ok:false` with `status:'all_retries_failed'` when every attempt
 * fails. `invalid_url` is terminal (no retry · a bad URL will not self-heal)
 * and carries NO `all_retries_failed` tag.
 */
export async function dispatchAsyncCallback(
  input: AsyncCallbackInput,
): Promise<AsyncCallbackResult> {
  const url = validateCallbackUrl(input.callback_url)
  if (!url) {
    const detail = `callback_url is not a valid http(s) URL`
    emitAttemptLog(input, 1, { ok: false, kind: 'invalid_url', detail })
    return { ok: false, kind: 'invalid_url', detail, duration_ms: 0, attempts: 0 }
  }

  const maxAttempts = Math.max(1, input.max_attempts ?? ASYNC_CALLBACK_MAX_ATTEMPTS)
  const backoffs = input.backoff_ms ?? ASYNC_CALLBACK_BACKOFF_MS
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let last: SingleAttemptResult = {
    ok: false,
    kind: 'fetch_threw',
    detail: 'no attempt executed',
    duration_ms: 0,
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await attemptCallbackOnce(url, input)
    emitAttemptLog(input, attempt, last)

    if (last.ok) {
      return {
        ok: true,
        status_code: last.status_code,
        duration_ms: last.duration_ms,
        attempts: attempt,
      }
    }

    if (attempt < maxAttempts) {
      const delay = backoffs[attempt - 1] ?? backoffs[backoffs.length - 1] ?? 0
      if (delay > 0) await sleep(delay)
    }
  }

  // Every attempt failed · tag for Sentry + return the last failure detail.
  return {
    ok: false,
    kind: last.kind,
    detail: last.detail,
    duration_ms: last.duration_ms,
    status_code: 'status_code' in last ? last.status_code : undefined,
    attempts: maxAttempts,
    status: 'all_retries_failed',
  }
}

/**
 * Canon canonical · resolve the callback URL from the RunSdk body · accepts
 * top-level OR nested under `context.callback_url` · symmetric with workflow
 * attribution + force_restart + dry_run patterns already in the route.
 */
export function resolveCallbackUrl(body: {
  callback_url?: string | null
  callbackUrl?: string | null
  context?: Record<string, unknown> | null
}): string | null {
  const ctx = (body.context ?? {}) as Record<string, unknown>
  const candidates: Array<unknown> = [
    body.callback_url,
    body.callbackUrl,
    ctx.callback_url,
    ctx.callbackUrl,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}
