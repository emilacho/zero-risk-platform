import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// GET /api/content — List all content
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

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
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const supabase = getSupabase()
  const body = await request.json()

  const { data, error } = await supabase
    .from('content')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
