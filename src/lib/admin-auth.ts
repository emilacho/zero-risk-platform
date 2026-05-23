/**
 * Admin auth · Sprint 4 · CC#2
 *
 * Single-tenant canon (CLAUDE.md Stack clave V4) · admin = Emilio Pérez (único owner).
 * Composes requireSupabaseSession + app_roles lookup so API routes can gate on admin only.
 *
 * RLS at DB level enforces this via app_roles.role = 'admin' policies (PR #56 pattern).
 * API layer uses service_role (bypasses RLS), so this helper is the API-layer admin check.
 */
import { NextResponse } from 'next/server'
import { requireSupabaseSession, type AuthFail } from './auth-middleware'
import { getSupabaseAdmin } from './supabase'

export interface AdminAuthOk {
  ok: true
  userId: string
  email: string | null
}
export type AdminAuthResult = AdminAuthOk | AuthFail

export async function requireAdmin(request: Request): Promise<AdminAuthResult> {
  const session = await requireSupabaseSession(request)
  if (!session.ok) return session

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('app_roles')
    .select('role')
    .eq('user_id', session.userId)
    .eq('role', 'admin')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'admin_check_failed', code: 'E-ADMIN-DB', detail: error.message },
        { status: 500 },
      ),
    }
  }

  if (!data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'forbidden', code: 'E-ADMIN-DENIED', detail: 'User is not admin' },
        { status: 403 },
      ),
    }
  }

  return { ok: true, userId: session.userId, email: session.email }
}
