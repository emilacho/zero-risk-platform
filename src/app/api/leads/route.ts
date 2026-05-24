import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'
import { checkInternalKey } from '@/lib/internal-auth'

// GET /api/leads — List all leads
export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/leads — Capture a new lead
export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  const supabase = getSupabase()
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const v = validateObject<Record<string, unknown>>(raw, 'leads-create')
  if (!v.ok) return v.response
  const body = v.data

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...body, status: 'new', assigned_to: 'xavier' })
    .select()
    .single()

  if (error) {
    const code = (error as { code?: string }).code
    const msg = error.message ?? 'db_error'
    if (code === '42501' || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
      return NextResponse.json(
        { error: 'rls_violation', code: 'E-LEADS-RLS', detail: msg },
        { status: 400 },
      )
    }
    if (code === '23502' || code === '23503' || code === '23514' || code?.startsWith('23')) {
      return NextResponse.json(
        { error: 'validation_error', code: 'E-LEADS-' + code, detail: msg },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'db_error', code: 'E-LEADS-DB', detail: msg }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
