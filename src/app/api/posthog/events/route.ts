/**
 * GET /api/posthog/events
 *
 * Internal proxy for PostHog event counts — called by Weekly Client Report n8n workflow.
 * Query params:
 *   client_id  — Supabase client UUID (filters by distinct_id or property)
 *   days       — lookback window in days (default: 7, max: 90)
 *   event_count — "true" to include total_events in response (default: true)
 *
 * Auth: x-api-key header (INTERNAL_API_KEY)
 */

import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const url = new URL(request.url)
  const rawClientId = url.searchParams.get('client_id') || ''
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7', 10), 1), 90)
  const includeCount = url.searchParams.get('event_count') !== 'false'

  if (rawClientId && !UUID_RE.test(rawClientId)) {
    return NextResponse.json({ error: 'invalid_client_id', detail: 'client_id must be a UUID' }, { status: 400 })
  }

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID || '397581'
  const apiBase = (process.env.POSTHOG_API_URL || 'https://us.posthog.com').replace(/\/$/, '')

  if (!apiKey) {
    return NextResponse.json({ error: 'posthog_not_configured', detail: 'POSTHOG_PERSONAL_API_KEY not set' }, { status: 503 })
  }

  const periodTo = new Date()
  const periodFrom = new Date(periodTo.getTime() - days * 24 * 60 * 60 * 1000)

  // HogQL: count events in window, filtered by client_id if provided.
  // Filters by distinct_id (primary) OR custom property client_id (secondary).
  const whereClause = rawClientId
    ? `timestamp >= toDateTime('${periodFrom.toISOString()}') AND (distinct_id = '${rawClientId}' OR properties.client_id = '${rawClientId}')`
    : `timestamp >= toDateTime('${periodFrom.toISOString()}')`

  const hogql = `SELECT count() AS total_events, uniq(distinct_id) AS unique_users FROM events WHERE ${whereClause}`

  let totalEvents = 0
  let uniqueUsers = 0
  let phError: string | null = null

  try {
    const phRes = await fetch(`${apiBase}/api/projects/${projectId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
    })

    if (phRes.ok) {
      const phData = await phRes.json() as { results?: unknown[][] }
      const row = phData.results?.[0]
      totalEvents = typeof row?.[0] === 'number' ? row[0] : 0
      uniqueUsers = typeof row?.[1] === 'number' ? row[1] : 0
    } else {
      phError = `PostHog HTTP ${phRes.status}`
    }
  } catch (err: unknown) {
    captureRouteError(err, request, {
      route: '/api/posthog/events',
      source: 'route_handler',
    })
    phError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    client_id: rawClientId || null,
    period_days: days,
    period: {
      from: periodFrom.toISOString(),
      to: periodTo.toISOString(),
    },
    ...(includeCount ? { total_events: totalEvents, unique_users: uniqueUsers } : {}),
    _source: 'posthog',
    ...(phError ? { _posthog_error: phError } : {}),
  })
}
