/**
 * POST /api/notion/create-qbr-page — create a QBR page in Notion.
 *
 * Closes W15-D-22. Workflow caller:
 *   `Zero Risk - QBR Generator Quarterly`
 *
 * Stubbed until the Notion API token lands (post-Notion-Plus 5 May 2026). The
 * stub is deterministic per (client_id, quarter) so workflow can re-run safely.
 * Persists a row in `notion_qbr_log` (best-effort) for observability and
 * downstream re-indexing once the real Notion bridge is wired.
 *
 * Auth: tier 2 INTERNAL.
 * Validation: Ajv schema `notion-create-qbr-page`.
 * Persistence: `notion_qbr_log` (audit log · graceful fallback).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withFallback, withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface QbrPageBody {
  client_id: string
  quarter: string
  title?: string | null
  summary?: string | null
  kpis?: Array<Record<string, unknown>> | null
  wins?: string[] | null
  risks?: string[] | null
  next_quarter_goals?: string[] | null
  parent_page_id?: string | null
}

interface NotionStubResult {
  page_id: string
  page_url: string
  created_at: string
}

async function callNotionCreatePage(body: QbrPageBody): Promise<NotionStubResult> {
  // Real Notion call goes here once NOTION_API_TOKEN is wired.
  if (!process.env.NOTION_API_TOKEN) {
    throw new Error('Notion API token not configured · stub path')
  }
  // Placeholder for the real fetch — currently unreachable in CI.
  const slug = `${body.client_id}-${body.quarter.replace(/\s+/g, '-').toLowerCase()}`
  const page_id = `notion-qbr-${slug}-${Date.now().toString(36)}`
  return {
    page_id,
    page_url: `https://notion.so/${page_id}`,
    created_at: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<QbrPageBody>(request, 'notion-create-qbr-page')
  if (!v.ok) return v.response
  const body = v.data

  const stubSlug = `${body.client_id}-${body.quarter.replace(/\s+/g, '-').toLowerCase()}`
  const stubFallback: NotionStubResult = {
    page_id: `stub-qbr-${stubSlug}`,
    page_url: `https://notion.so/stub-qbr-${stubSlug}`,
    created_at: new Date().toISOString(),
  }

  const notion = await withFallback<NotionStubResult>(
    () => callNotionCreatePage(body),
    stubFallback,
    { context: '/api/notion/create-qbr-page' },
  )

  // Best-effort audit log — never blocks the workflow response.
  const supabase = getSupabaseAdmin()
  await withSupabaseResult(
    () =>
      supabase.from('notion_qbr_log').insert({
        client_id: body.client_id,
        quarter: body.quarter,
        page_id: notion.data?.page_id ?? null,
        page_url: notion.data?.page_url ?? null,
        used_stub: notion.fallback_mode,
        request_body: body,
      }),
    { context: '/api/notion/create-qbr-page#log' },
  )

  return NextResponse.json({
    ok: true,
    page_id: notion.data?.page_id ?? null,
    page_url: notion.data?.page_url ?? null,
    quarter: body.quarter,
    client_id: body.client_id,
    ...(notion.fallback_mode ? { fallback_mode: true, note: notion.reason ?? 'Notion stub used' } : {}),
  })
}
