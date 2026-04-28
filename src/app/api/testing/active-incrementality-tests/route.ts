/**
 * GET /api/testing/active-incrementality-tests
 *
 * Lista tests de incrementality con status='active' para el workflow
 * `Zero Risk — Incrementality Test Runner` (n8n live · ID 9WN8ccqg1XPtTZ13)
 * que corre cada 15 min + webhook trigger.
 *
 * Diseño tolerante a fallos:
 *  - Si la table `incrementality_tests` NO existe → devuelve { tests: [], count: 0, _note: ... }
 *  - Si la table existe pero no hay filas activas → { tests: [], count: 0 }
 *  - Si hay errores de red/Supabase → 200 con fallback_mode (NO 5xx para no romper retries del cron)
 *
 * Sin auth obligatoria: el workflow n8n no envía headers de auth y este endpoint
 * solo expone metadatos de tests internos. Si alguna vez se necesita protegerlo,
 * agregar `checkInternalKey` siguiendo el patrón de /api/clients/route.ts.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// PostgREST devuelve PGRST205 cuando la tabla no existe en el schema cache.
// `42P01` (undefined_table) es el código nativo de Postgres por si el error
// se propaga sin pasar por PostgREST.
const TABLE_MISSING_CODES = new Set(['PGRST205', '42P01'])

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('incrementality_tests')
      .select('*')
      .eq('status', 'active')

    if (error) {
      const code = (error as { code?: string }).code
      if (code && TABLE_MISSING_CODES.has(code)) {
        return NextResponse.json({
          tests: [],
          count: 0,
          _note: 'incrementality_tests table not yet created',
        })
      }

      // Error real de Supabase distinto a "table missing" — devuelve 200 con
      // fallback para no spamear el cron con 5xx; deja trazas en la respuesta.
      return NextResponse.json({
        tests: [],
        count: 0,
        fallback_mode: true,
        db_error: error.message.slice(0, 400),
      })
    }

    return NextResponse.json({
      tests: data || [],
      count: data?.length ?? 0,
    })
  } catch (e: unknown) {
    return NextResponse.json({
      tests: [],
      count: 0,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
