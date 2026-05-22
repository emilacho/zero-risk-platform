import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// GET /api/content — List all content
export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/content — Create content
export async function POST(request: Request) {
  const supabase = getSupabase()
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('content')
    .insert(body)
    .select()
    .single()

  if (error) {
    // RLS / validation errors map to 400 with explicit context · canonical UX
    // per Sprint 7 D-H2 fix · only true infra errors should bubble as 500
    const code = (error as { code?: string }).code
    const msg = error.message ?? 'db_error'
    if (code === '42501' || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
      return NextResponse.json(
        { error: 'rls_violation', code: 'E-CONTENT-RLS', detail: msg },
        { status: 400 },
      )
    }
    if (code === '23502' || code === '23503' || code === '23514' || code?.startsWith('23')) {
      return NextResponse.json(
        { error: 'validation_error', code: 'E-CONTENT-' + code, detail: msg },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'db_error', code: 'E-CONTENT-DB', detail: msg }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
