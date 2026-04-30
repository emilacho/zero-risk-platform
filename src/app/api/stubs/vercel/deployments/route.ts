/**
 * POST /api/stubs/vercel/deployments
 *
 * Drop-in stub for Vercel /v13/deployments during smoke tests.
 * The real endpoint requires valid `source` enum + project files — this stub
 * accepts any body and returns a synthetic "READY" deployment.
 *
 * Wire the n8n workflow node via:
 *   ={{ $env.VERCEL_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/vercel/deployments' }}
 *
 * When VERCEL_API_URL is set in n8n to the real Vercel API, this stub is bypassed.
 */

import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))

  const dplId = `dpl_smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const name: string = body?.name || 'smoke-deployment'
  const project: string = body?.project || body?.projectId || 'zero-risk-platform'
  const variant: string = (name.includes('variant-b') ? 'b' : 'a')
  const now = Date.now()

  return NextResponse.json({
    id: dplId,
    url: `smoke-${variant}-${now}.vercel.app`,
    name,
    meta: {},
    plan: 'pro',
    ownerId: 'smoke-owner',
    readyState: 'READY',
    status: 'READY',
    type: 'LAMBDAS',
    createdAt: now,
    buildingAt: now,
    ready: now,
    project,
    target: body?.target || 'preview',
    aliasAssigned: now,
    aliasError: null,
    inspectorUrl: `https://vercel.com/smoke/zero-risk-platform/${dplId}`,
    // Echo request scalars for downstream workflow state
    _stub: true,
    _request_name: name,
    _request_project: project,
    fallback_mode: true,
  })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/stubs/vercel/deployments',
    method: 'POST',
    note: 'Drop-in stub for Vercel /v13/deployments. Override via env VERCEL_API_URL.',
  })
}
