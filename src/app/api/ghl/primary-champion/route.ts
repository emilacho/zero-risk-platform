/**
 * GET /api/ghl/primary-champion — NPS + CSAT Monthly Pulse read-path.
 *
 * Closes W15-D-13. Workflow caller:
 *   `Zero Risk — Client NPS + CSAT Monthly Pulse (1st of Month 10am)`
 *
 * Purpose: identify the primary champion contact for a client (the person
 * who actually engages, not necessarily the billing owner). The monthly
 * pulse cron emails the champion an NPS prompt; without this endpoint it
 * was sending to /dev/null on the 1st of every month.
 *
 * Champion resolution:
 *   1. ghl_client_champions row with role='champion' (preferred · explicit)
 *   2. ghl_contacts row with engagement_score > 70 (heuristic fallback)
 *   3. clients.primary_contact_email if column exists
 *   4. Stub `champion@<client>.example.com` (workflow gets a stable string)
 *
 * Query params:
 *   client_id · required
 *
 * Response (200):
 *   {
 *     ok: true,
 *     client_id: string,
 *     champion: { name: string, email: string, role: string, engagement_score: number | null, source: string },
 *     fallback_mode?: true
 *   }
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Champion {
  name: string
  email: string
  role: string
  engagement_score: number | null
  source: string
}

function stubChampion(clientId: string): Champion {
  // Stable derived email so workflows can be smoke-tested deterministically.
  const slug = clientId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) || 'unknown'
  return {
    name: `Champion (${clientId})`,
    email: `champion@${slug}.example.com`,
    role: 'champion',
    engagement_score: null,
    source: 'stub',
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_client_id', code: 'E-INPUT-MISSING', detail: 'client_id query param is required' },
      { status: 400 },
    )
  }

  let champion: Champion | null = null
  let fallbackMode = false

  // 1. Explicit champion row.
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('ghl_client_champions')
      .select('contact_name, contact_email, role, engagement_score')
      .eq('client_id', clientId)
      .eq('role', 'champion')
      .order('engagement_score', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error && data && data.contact_email) {
      champion = {
        name: String(data.contact_name || 'Unknown'),
        email: String(data.contact_email),
        role: String(data.role || 'champion'),
        engagement_score: typeof data.engagement_score === 'number' ? data.engagement_score : null,
        source: 'ghl_client_champions',
      }
    }
  } catch {
    // table missing · keep going
  }

  // 2. Heuristic: high-engagement GHL contact.
  if (!champion) {
    try {
      const supabase = getSupabaseAdmin()
      const { data } = await supabase
        .from('ghl_contacts')
        .select('contact_name, email, engagement_score')
        .eq('client_id', clientId)
        .gt('engagement_score', 70)
        .order('engagement_score', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data && data.email) {
        champion = {
          name: String(data.contact_name || data.email),
          email: String(data.email),
          role: 'inferred_champion',
          engagement_score: typeof data.engagement_score === 'number' ? data.engagement_score : null,
          source: 'ghl_contacts.heuristic',
        }
      }
    } catch {
      // table missing · keep going
    }
  }

  // 3. clients.primary_contact_email.
  if (!champion) {
    try {
      const supabase = getSupabaseAdmin()
      const { data } = await supabase
        .from('clients')
        .select('client_id, primary_contact_email, primary_contact_name')
        .eq('client_id', clientId)
        .maybeSingle()
      if (data && data.primary_contact_email) {
        champion = {
          name: String(data.primary_contact_name || data.primary_contact_email),
          email: String(data.primary_contact_email),
          role: 'primary_contact',
          engagement_score: null,
          source: 'clients.primary_contact_email',
        }
      }
    } catch {
      // column missing · keep going
    }
  }

  // 4. Final stub.
  if (!champion) {
    fallbackMode = true
    champion = stubChampion(clientId)
  }

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    champion,
    ...(fallbackMode ? { fallback_mode: true } : {}),
  })
}
