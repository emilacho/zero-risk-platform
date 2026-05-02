/**
 * POST /api/social-queue/update — update a social_queue row after publish.
 *
 * Closes W15-D-27. Workflow caller:
 *   `Zero Risk - Social Multi-Platform Publisher v2`
 *
 * Updates status (pending|scheduled|published|failed|cancelled) plus the
 * external post_id/post_url/published_at fields. Idempotent: re-running with
 * the same id+status is a no-op. Graceful fallback when row not found or
 * table missing so the publisher doesn't fail loudly.
 *
 * Auth: tier 2 INTERNAL.
 * Validation: Ajv schema `social-queue-update`.
 * Persistence: `social_queue` (update by id).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface UpdateBody {
  id: string
  status: 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled'
  platform?: string | null
  post_id?: string | null
  post_url?: string | null
  published_at?: string | null
  error?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<UpdateBody>(request, 'social-queue-update')
  if (!v.ok) return v.response
  const body = v.data

  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  }
  if (body.platform !== undefined) patch.platform = body.platform
  if (body.post_id !== undefined) patch.post_id = body.post_id
  if (body.post_url !== undefined) patch.post_url = body.post_url
  if (body.published_at !== undefined) patch.published_at = body.published_at
  if (body.error !== undefined) patch.last_error = body.error

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<{ id: string }[]>(
    () => supabase.from('social_queue').update(patch).eq('id', body.id).select('id'),
    { context: '/api/social-queue/update' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      id: body.id,
      status: body.status,
      updated: false,
      note: r.reason,
    })
  }

  const updatedRows = Array.isArray(r.data) ? r.data : []
  return NextResponse.json({
    ok: true,
    id: body.id,
    status: body.status,
    updated: updatedRows.length > 0,
    rows_affected: updatedRows.length,
  })
}
