/**
 * POST /api/surveys/nps/log-sent — NPS dispatch log write-path.
 *
 * Closes W15-D-28. Workflow caller:
 *   `Zero Risk - NPS + CSAT Monthly Pulse (1st of month 10am)`
 *
 * Records every NPS survey dispatch so we can compute send → response
 * latency, drop-off, and channel A/B effectiveness. Graceful fallback if
 * the table doesn't exist yet.
 *
 * Auth: tier 2 INTERNAL. Validation: Ajv `surveys-nps-log-sent`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface NpsLogSentBody {
  client_id: string
  contact_id: string
  survey_id: string
  channel?: 'email' | 'sms' | 'in_app' | 'whatsapp' | null
  sent_at?: string | null
  template_id?: string | null
  personalization?: Record<string, unknown> | null
  expires_at?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<NpsLogSentBody>(request, 'surveys-nps-log-sent')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    contact_id: body.contact_id,
    survey_id: body.survey_id,
    channel: body.channel ?? 'email',
    template_id: body.template_id ?? null,
    personalization: body.personalization ?? null,
    expires_at: body.expires_at ?? null,
    sent_at: body.sent_at || new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<{ id: string }>(
    () => supabase.from('nps_dispatch_log').insert(row).select('id').single(),
    { context: '/api/surveys/nps/log-sent' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      persisted_id: null,
      note: `DB write failed gracefully: ${r.reason ?? 'unknown'}`,
    })
  }
  return NextResponse.json({ ok: true, persisted_id: r.data?.id ?? null })
}
