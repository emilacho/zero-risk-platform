/**
 * POST /api/content/publish/ghl · 410 Gone · Stack V4 canon 2026-05-22.
 *
 * GHL OUT canon (decision 2026-05-22 ·
 * `zr-vault/wiki/decisions/2026-05-22-stack-canon-purge-deprecated-services-audit.md`) ·
 * GHL was NEVER subscribed · "Stack V4 = migration desde GHL" reframe rescinded.
 *
 * Replacement · Stack V4 channel-specific endpoints ·
 *   - Email · /api/email/send (Resend backend)
 *   - SMS · /api/sms/send (Twilio backend)
 *   - WhatsApp · /api/whatsapp/send (Meta Cloud API directo)
 *   - Calendar · /api/calendar/book (Cal.com self-host)
 */
import { buildDeprecatedResponse } from '@/lib/deprecation/response'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return buildDeprecatedResponse({
    endpoint: 'content/publish/ghl',
    replacement: '/api/email/send · /api/sms/send · /api/whatsapp/send',
    request,
  })
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  return buildDeprecatedResponse({
    endpoint: 'content/publish/ghl',
    replacement: '/api/email/send · /api/sms/send · /api/whatsapp/send',
    request,
  })
}
