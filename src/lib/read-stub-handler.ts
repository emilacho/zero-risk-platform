/**
 * Shared helper for stub endpoints that return mock analytics/read data.
 *
 * Different from stub-handler.ts (which is POST/write): this handles GET/POST
 * where the workflow expects a deterministic response shape for smoke tests.
 *
 * Pattern: accepts any body/query, returns mock data matching the shape the
 * workflow expects, echoes input so downstream $json.X keeps flowing.
 */

import { NextResponse } from 'next/server'
import { checkInternalKey } from './internal-auth'

type ReadStubOptions = {
  /** Metric or endpoint name for logging/debugging */
  name: string
  /** Function that returns mock data given the request body */
  makeResponse: (body: Record<string, unknown>, url: URL) => Record<string, unknown>
  /** If false, skip auth check (public stubs). Default true. */
  requireAuth?: boolean
}

export async function handleReadStub(request: Request, opts: ReadStubOptions) {
  try {
    if (opts.requireAuth !== false) {
      const auth = checkInternalKey(request)
      if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
    }

    const url = new URL(request.url)
    let body: Record<string, unknown> = {}
    if (request.method === 'POST') {
      try {
        const raw = await request.json()
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          body = raw as Record<string, unknown>
        }
      } catch {}
    } else {
      // GET: params → body
      for (const [k, v] of url.searchParams) body[k] = v
    }

    const response = opts.makeResponse(body, url)

    // Echo input body/params into response so workflow chain preserves state
    return NextResponse.json({
      ...body,
      ok: true,
      stub_name: opts.name,
      ...response,
      fallback_mode: true,
    })
  } catch (e: unknown) {
    return NextResponse.json({
      ok: true,
      stub_name: opts.name,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
