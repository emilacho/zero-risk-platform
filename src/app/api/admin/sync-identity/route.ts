import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'

// POST /api/admin/sync-identity
// One-time endpoint to sync agent identity content into Supabase.
// Protected by ADMIN_SECRET env var.
//
// Body: {
//   agent_name: "ruflo",
//   identity_content: "# RUFLO — Clasificador...",
//   secret: "admin-secret-from-env"
// }

export async function POST(request: Request) {
  try {
    let _raw: unknown
  try {
    _raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
    const { agent_name, identity_content, secret } = body

    // Verify admin secret
    const adminSecret = process.env.ADMIN_SECRET
    if (!adminSecret || secret !== adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!agent_name || !identity_content) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_name, identity_content' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // Check if agent exists
    const { data: existing } = await supabase
      .from('agents')
      .select('id, name')
      .eq('name', agent_name)
      .single()

    if (!existing) {
      return NextResponse.json(
        { error: `Agent "${agent_name}" not found in database` },
        { status: 404 }
      )
    }

    // Update identity_content
    const { error: updateError } = await supabase
      .from('agents')
      .update({ identity_content })
      .eq('name', agent_name)

    if (updateError) {
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      agent: agent_name,
      content_length: identity_content.length,
      message: `Identity content updated for ${agent_name}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
