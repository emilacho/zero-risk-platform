import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

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
  const body = await request.json()

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...body, status: 'new', assigned_to: 'xavier' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
