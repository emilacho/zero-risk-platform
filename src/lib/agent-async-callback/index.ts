/**
 * Canon canonical · agent async callback dispatch (SPEC 2026-06-09 · Track N).
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
 * §148 honest · this lib NEVER throws past the route boundary · all errors
 * are captured into a tagged result · the route logs + returns the canonical
 * baseResponse regardless. The callback is a SIDE EFFECT · not a contract.
 *
 * Timeout bounded · default 10s · prevents the route from blocking when the
 * caller's webhook is slow or unreachable. After this we abort + return
 * tagged failure · the route still returns its own baseResponse to the
 * direct caller (canonical backward-compat).
 */

/** Canon canonical · default timeout for the callback POST · 10s.
 *  n8n's resume webhook returns 200 quickly when working · 10s is a generous
 *  cap that avoids tying up the route function indefinitely on network blips. */
export const ASYNC_CALLBACK_TIMEOUT_MS = 10_000

/** Canon canonical · how callers identify their flow via headers. */
export const ASYNC_CALLBACK_SOURCE_HEADER = 'x-zr-async-callback'

export interface AsyncCallbackInput {
  /** Canon · the resume URL provided by the caller (e.g. `$execution.resumeUrl` from n8n). */
  readonly callback_url: string
  /** Canon · the canonical baseResponse to deliver · POSTed verbatim as JSON. */
  readonly body: Record<string, unknown>
  /** Optional · timeout override · tests use this. */
  readonly timeout_ms?: number
  /** Optional · fetch override · tests inject. Production uses global fetch. */
  readonly fetcher?: typeof fetch
}

export type AsyncCallbackResult =
  | {
      readonly ok: true
      readonly status_code: number
      readonly duration_ms: number
    }
  | {
      readonly ok: false
      readonly kind:
        | 'invalid_url'
        | 'fetch_threw'
        | 'timeout'
        | 'non_2xx'
        | 'callback_threw'
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

/**
 * Canon canonical · POST the baseResponse to the callback URL · timeout
 * bounded · never throws. The route MAY await this · if the wire works
 * the caller (n8n) receives the body and resumes; if not · the route still
 * returns its own response to the direct caller (backward-compat).
 */
export async function dispatchAsyncCallback(
  input: AsyncCallbackInput,
): Promise<AsyncCallbackResult> {
  const start = Date.now()
  const url = validateCallbackUrl(input.callback_url)
  if (!url) {
    return {
      ok: false,
      kind: 'invalid_url',
      detail: `callback_url is not a valid http(s) URL`,
      duration_ms: Date.now() - start,
    }
  }

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
