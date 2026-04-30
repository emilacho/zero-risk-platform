/**
 * POST /api/stubs/slack-webhook
 *
 * Drop-in replacement for a Slack Incoming Webhook URL during smoke tests.
 * Accepts any JSON body, logs nothing, returns 200 OK — matches Slack's real
 * webhook semantics (Slack returns 200 + plain "ok" on success).
 *
 * Wire the n8n Slack nodes to hit this via:
 *   {{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}
 *
 * When the real SLACK_WEBHOOK_URL is set in Railway env, this stub is bypassed.
 */

import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  await request.text().catch(() => '')
  return new NextResponse('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/stubs/slack-webhook',
    method: 'POST',
    body: 'Slack Incoming Webhook payload (text, blocks, attachments)',
    note: 'Drop-in stub — returns 200 OK. Override via env SLACK_WEBHOOK_URL.',
  })
}
