/**
 * POST /api/notion/create-weekly-report — create a Notion weekly report page.
 *
 * Closes W15-D-23. Workflow caller:
 *   `Zero Risk - Weekly Client Report Generator v2 (Mondays 8am)`
 *
 * Stub today: persists payload to `notion_page_log` + returns a deterministic
 * mock page_id. Real Notion integration when NOTION_API_KEY arrives.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface WeeklyReportBody {
  client_id: string
  week_starting: string
  title: string
  highlights?: string[] | null
  metrics?: Record<string, unknown> | null
  next_week_focus?: string[] | null
  blockers?: string[] | null
  parent_page_id?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<WeeklyReportBody>(request, 'notion-create-weekly-report')
  if (!v.ok) return v.response
  const body = v.data

  const stubPageId = `notion-weekly-${body.client_id}-${body.week_starting}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 64)

  const row = {
    page_id: stubPageId,
    page_type: 'weekly_report',
    client_id: body.client_id,
    week_starting: body.week_starting,
    title: body.title,
    payload: body,
    parent_page_id: body.parent_page_id ?? process.env.NOTION_PARENT_PAGE_ID ?? null,
    fallback_mode: true,
    created_at: new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<{ id: string }>(
    () => supabase.from('notion_page_log').insert(row).select('id').single(),
    { context: '/api/notion/create-weekly-report' },
  )

  return NextResponse.json({
    ok: true,
    page_id: stubPageId,
    notion_url: `https://www.notion.so/${stubPageId}`,
    week_starting: body.week_starting,
    client_id: body.client_id,
    persisted_id: r.fallback_mode ? null : r.data?.id,
    fallback_mode: true,
    note: r.fallback_mode ? `Notion API stubbed + log write failed: ${r.reason}` : 'Notion API stubbed (NOTION_API_KEY pending)',
  })
}
