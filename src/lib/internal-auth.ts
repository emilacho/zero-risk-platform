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
