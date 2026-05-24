/**
 * Internal API auth — used by n8n workflows to call back into Zero Risk.
 *
 * Workflows pass `x-api-key: <INTERNAL_API_KEY>` in headers. We compare
 * (timing-safe) against process.env.INTERNAL_API_KEY.
 *
 * Wrap a route handler with `requireInternalKey(handler)` to enforce.
 */
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'

export function checkInternalKey(request: Request): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) {
    return { ok: false, reason: 'INTERNAL_API_KEY env var not configured on server' }
  }
  const got = request.headers.get('x-api-key') || ''
  if (!got) return { ok: false, reason: 'Missing x-api-key header' }

  // Timing-safe compare; both buffers must be same length to avoid throw.
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return { ok: false, reason: 'Invalid x-api-key' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'Invalid x-api-key' }

  return { ok: true }
}

export type RouteHandler = (request: Request, ctx: { params: Record<string, string> }) => Promise<Response> | Response

export function requireInternalKey(handler: RouteHandler): RouteHandler {
  return async (request, ctx) => {
    const auth = checkInternalKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
    }
    return handler(request, ctx)
  }
}

/**
 * Dual-auth · accepts EITHER `x-api-key: $INTERNAL_API_KEY` (n8n · Slack
 * webhooks · CLI scripts) OR a valid admin Supabase session (dashboard
 * UI fetches that ride the existing cookie-based middleware).
 *
 * Sprint 8 D5 audit · used by routes with mixed consumers like
 * `/api/hitl/resolve` (called by n8n HITL workflow AND by the dashboard
 * inbox "Approve/Reject" button). Picking only one auth path would
 * either expose the route or break the UI.
 *
 * Returns `{ ok: true, via: 'internal' | 'admin' }` on success. Always
 * tries `x-api-key` first (synchronous · zero DB roundtrip) so n8n hot
 * paths don't pay the admin-session lookup cost.
 */
export async function checkInternalOrAdmin(
  request: Request,
): Promise<{ ok: true; via: 'internal' | 'admin' } | { ok: false; reason: string }> {
  const internalCheck = checkInternalKey(request)
  if (internalCheck.ok) return { ok: true, via: 'internal' }
  // Lazy-import admin-auth to avoid pulling Supabase SSR + cookies wiring
  // into every route that only needs the cheap x-api-key path.
  try {
    const { requireAdmin } = await import('./admin-auth')
    const admin = await requireAdmin(request)
    if (admin.ok) return { ok: true, via: 'admin' }
    return { ok: false, reason: 'internal-key missing · admin-session denied' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return { ok: false, reason: `internal-key missing · admin auth threw · ${msg}` }
  }
}
