/**
 * GET /api/dashboard/realtime
 *
 * Dashboard surface · Supabase Realtime subscription configuration.
 * Returns the public anon key + Supabase URL + channel/table mappings the
 * dashboard UI should subscribe to via `@supabase/supabase-js` client SDK
 * (`supabase.channel(...).on('postgres_changes', { event, schema, table })`).
 *
 * Why this pattern (vs SSE / WebSocket in Next.js):
 *   • Supabase Realtime is the project's canonical push channel for DB
 *     events · multiplexes INSERT/UPDATE/DELETE postgres_changes natively.
 *   • Next.js serverless functions cannot hold long-lived WebSocket
 *     connections (Vercel function timeout) · client-side Realtime SDK is
 *     the supported path.
 *   • The anon key + URL are already public (NEXT_PUBLIC_*) · returning
 *     them here just consolidates channel-config in a single endpoint so
 *     dashboard UI doesn't hard-code table names.
 *
 * Read-only · no auth required (only exposes already-public values).
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ChannelConfig {
  table: string
  schema: string
  events: Array<'INSERT' | 'UPDATE' | 'DELETE' | '*'>
  description: string
}

const CHANNELS: Record<string, ChannelConfig> = {
  agent_invocations: {
    table: 'agent_invocations',
    schema: 'public',
    events: ['INSERT', 'UPDATE'],
    description:
      'Per-invocation lifecycle · fires on new run + status/cost updates · primary feed for live activity panel.',
  },
  agent_image_generations: {
    table: 'agent_image_generations',
    schema: 'public',
    events: ['INSERT', 'UPDATE'],
    description: 'Image generation lifecycle · fires on new GPT-image-1 run + storage upload completion.',
  },
  clients: {
    table: 'clients',
    schema: 'public',
    events: ['INSERT', 'UPDATE'],
    description: 'Cliente registry · fires on new onboarding + profile/brand-assets updates.',
  },
  client_journey_state: {
    table: 'client_journey_state',
    schema: 'public',
    events: ['INSERT', 'UPDATE'],
    description: 'Journey orchestrator · fires on stage transitions + HITL pending counter changes.',
  },
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Supabase public env not configured',
        code: 'E-DASHBOARD-REALTIME-CONFIG-MISSING',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    supabase_url: supabaseUrl,
    anon_key: anonKey,
    channels: CHANNELS,
    usage_example: {
      sdk: '@supabase/supabase-js',
      snippet:
        "const supa = createClient(supabase_url, anon_key); supa.channel('agent_invocations').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_invocations' }, payload => { /* handle */ }).subscribe()",
    },
    timestamp: new Date().toISOString(),
  })
}
