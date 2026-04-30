/**
 * POST /api/stubs/posthog/experiments
 *
 * Drop-in stub for PostHog /api/experiments during smoke tests.
 * Returns a synthetic experiment matching PostHog's real response shape.
 *
 * Wire the n8n workflow node via:
 *   ={{ $env.POSTHOG_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/posthog' }}/api/experiments
 *
 * Note: the trailing path `/api/experiments` is appended by the workflow,
 * so the env var only overrides the base URL.
 */

import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))

  const experimentId = Math.floor(Math.random() * 90000) + 10000
  const now = new Date().toISOString()
  const name: string = body?.name || 'smoke-experiment'
  const featureFlagKey = `smoke-flag-${Date.now().toString(36)}`

  return NextResponse.json({
    id: experimentId,
    name,
    description: body?.description || 'Smoke test experiment',
    start_date: now,
    end_date: null,
    feature_flag_key: featureFlagKey,
    feature_flag: {
      id: experimentId + 1000,
      key: featureFlagKey,
      active: true,
      filters: {
        groups: [{ properties: [], rollout_percentage: 100 }],
        multivariate: {
          variants: [
            { key: 'control', rollout_percentage: 50 },
            { key: 'test', rollout_percentage: 50 },
          ],
        },
      },
    },
    parameters: body?.parameters || {},
    secondary_metrics: [],
    filters: body?.filters || {
      insight: 'TRENDS',
      events: [{ id: '$pageview', type: 'events' }],
    },
    archived: false,
    created_by: { id: 1, name: 'Smoke Test', email: 'smoke@zero-risk.local' },
    created_at: now,
    updated_at: now,
    // Echo scalars for downstream state
    _stub: true,
    _request_name: name,
    fallback_mode: true,
  })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/stubs/posthog/experiments',
    method: 'POST',
    note: 'Drop-in stub for PostHog /api/experiments. Override via env POSTHOG_API_URL.',
  })
}
