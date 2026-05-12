/**
 * Supabase admin client for the Railway agent-runner service.
 *
 * Copied verbatim from zero-risk-platform/src/lib/supabase.ts. Keep in sync
 * with the Vercel side until a shared package factors this out.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Client-side: uses anon key (subject to RLS). Not used by the runner itself
// but kept for parity with the Vercel module shape.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Server-side: uses service role key (bypasses RLS).
const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  return supabase
}

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured. Set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).')
  }
  return supabaseAdmin
}
