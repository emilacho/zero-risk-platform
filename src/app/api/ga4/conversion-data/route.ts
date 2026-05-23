/**
 * GA4 — Conversion Data (DEPRECATED · 410 Gone)
 *
 * GA4 is OUT canonical Stack V4 (Sprint 5 decision · GA4 OUT · PostHog IN).
 * Per Sprint 7 D-M1 fix · this endpoint always returns 410 Gone with sunset header.
 * Successor · PostHog conversion query via `/api/agent-outcomes` + custom queries.
 *
 * Sprint 7.7 follow-up · the legacy handler implementation (service-account
 * OAuth + GA4 Data API v1beta call) was removed since GA4 is deprecated.
 * Recover from git history if needed (commit before this fix).
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  return NextResponse.json(
    {
      error: 'gone',
      code: 'E-GA4-OUT',
      detail: 'GA4 OUT canon Stack V4 (Sprint 5 decision · PostHog IN). Endpoint deprecated.',
      successor:
        'PostHog conversion query via /api/agent-outcomes · or direct PostHog /api/projects/{id}/query',
      sunset: '2026-05-22',
    },
    {
      status: 410,
      headers: {
        Deprecation: 'true',
        Sunset: 'Thu, 22 May 2026 00:00:00 GMT',
        Link: '</api/agent-outcomes>; rel="successor-version"',
      },
    },
  )
}
