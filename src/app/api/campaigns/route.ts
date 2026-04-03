import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// GET /api/campaigns — List all campaigns
export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/campaigns — Create a new campaign
export async function POST(request: Request) {
  const supabase = getSupabase()
  const body = await request.json()

  const { data, error } = await supabase
    .from('campaigns')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
