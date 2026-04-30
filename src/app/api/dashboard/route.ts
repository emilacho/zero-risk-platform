import { NextResponse } from 'next/server'
import { countRows } from '@/lib/supabase-admin'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// GET /api/dashboard — returns KPI summary
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const [campaigns, activeCampaigns, leads, newLeads, content] = await Promise.all([
      countRows('campaigns'),
      countRows('campaigns', [{ column: 'status', operator: 'eq', value: 'active' }]),
      countRows('leads'),
      countRows('leads', [{ column: 'status', operator: 'eq', value: 'new' }]),
      countRows('content'),
    ])

    return NextResponse.json({
      totalCampaigns: campaigns.count,
      activeCampaigns: activeCampaigns.count,
      totalLeads: leads.count,
      newLeads: newLeads.count,
      totalContent: content.count,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
