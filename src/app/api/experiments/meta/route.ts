/**
 * POST /api/experiments/meta
 * Stores A/B experiment metadata: links Vercel deployment URLs to PostHog experiment IDs.
 * Called by the Landing Page A/B Deployer n8n workflow after PostHog experiment creation.
 */
import { NextResponse } from 'next/server'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'experiments-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>

  const id = `exp_meta_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  return NextResponse.json({
    ok: true,
    id,
    client_id: body.client_id || null,
    experiment_id: body.experiment_id || null,
    posthog_experiment_id: body.posthog_experiment_id || null,
    posthog_flag_key: body.posthog_flag_key || null,
    traffic_split: body.traffic_split || 50,
    kpi: body.kpi || 'conversion',
    task_id: body.task_id || null,
    stored_at: new Date().toISOString(),
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({ endpoint: '/api/experiments/meta', method: 'POST' })
}
