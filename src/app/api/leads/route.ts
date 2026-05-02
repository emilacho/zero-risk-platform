import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
