/**
 * Tests · identidad de la ficha en `ensureClientExists` (CC#1 2026-08-11).
 *
 * Tiro Peniche `exec 88922`: la tarea del RE-descubrimiento va en español y no dice
 * «for <nombre> (», así que el nombre no se leía y la ficha nacía anónima
 * (`Cliente 53b05ecb`, país por defecto, sin web) un segundo después de que terminara
 * la re-invocación. El nombre SÍ estaba en el texto.
 */
import { describe, it, expect, vi } from 'vitest'
import { parseClientIdentityFromTask, ensureClientExists } from '../ensure-client'

// Textos REALES, tomados de `agent_invocations.input_summary` del tiro.
const TAREA_DESCUBRIMIENTO =
  'Auto-discover Client Brain for Peniche Surf Escape (industry: unknown, location: Peniche, ' +
  'Portugal, website: https://penichesurfescape.com, client_id: 53b05ecb-670a-4411-8a94-427e8dea6d2b).'
const TAREA_REDESCUBRIMIENTO =
  'Rehacé el descubrimiento de competidores de Peniche Surf Escape (https://penichesurfescape.com) ' +
  'aplicando las observaciones de corrección. ANCLA GEOGRÁFICA OBLIGATORIA · DADA, NO LA DEDUZCAS: ' +
  'el cliente está en Peniche, Portugal.'

describe('parseClientIdentityFromTask', () => {
  it('lee el nombre del descubrimiento inicial (en inglés)', () => {
    expect(parseClientIdentityFromTask(TAREA_DESCUBRIMIENTO).name).toBe('Peniche Surf Escape')
  })

  it('lee el nombre del RE-descubrimiento (en español) · el caso que fallaba', () => {
    expect(parseClientIdentityFromTask(TAREA_REDESCUBRIMIENTO).name).toBe('Peniche Surf Escape')
  })

  it('del re-descubrimiento también saca la web', () => {
    expect(parseClientIdentityFromTask(TAREA_REDESCUBRIMIENTO).website).toBe(
      'https://penichesurfescape.com',
    )
  })

  it('sigue sin inventar cuando no hay nombre', () => {
    expect(parseClientIdentityFromTask('hacé algo').name).toBeUndefined()
    expect(parseClientIdentityFromTask('').name).toBeUndefined()
    expect(parseClientIdentityFromTask(null).name).toBeUndefined()
  })
})

// ── arnés mínimo de supabase ──
function fakeSupabase(opts: { existeId?: boolean; slugTomadoPor?: string | null }) {
  const upserts: Array<Record<string, unknown>> = []
  const from = () => ({
    select: () => ({
      eq: (col: string, val: string) => ({
        maybeSingle: async () =>
          col === 'id'
            ? { data: opts.existeId ? { id: val } : null, error: null }
            : { data: opts.slugTomadoPor ? { id: opts.slugTomadoPor } : null, error: null },
      }),
    }),
    upsert: async (row: Record<string, unknown>) => {
      upserts.push(row)
      return { error: null }
    },
  })
  return { supabase: { from } as never, upserts }
}

describe('ensureClientExists · la ficha ya no nace anónima', () => {
  const CID = '53b05ecb-670a-4411-8a94-427e8dea6d2b'

  it('guarda el NOMBRE REAL cuando viene del re-descubrimiento', async () => {
    const { supabase, upserts } = fakeSupabase({ slugTomadoPor: null })
    const r = await ensureClientExists({ supabase, clientId: CID, task: TAREA_REDESCUBRIMIENTO })
    expect(r.status).toBe('created')
    expect(upserts[0].name).toBe('Peniche Surf Escape')
    expect(upserts[0].slug).toBe('peniche-surf-escape')
    expect(upserts[0].website_url).toBe('https://penichesurfescape.com')
  })

  it('desambigua el slug si ya lo usa OTRA ficha · no rompe el guardado', async () => {
    const { supabase, upserts } = fakeSupabase({ slugTomadoPor: 'e388a370-910f-4ee7-9a48-4a79393b8cb4' })
    const r = await ensureClientExists({ supabase, clientId: CID, task: TAREA_REDESCUBRIMIENTO })
    expect(r.status).toBe('created')
    expect(upserts[0].name).toBe('Peniche Surf Escape') // el nombre real se conserva
    expect(upserts[0].slug).toBe('peniche-surf-escape-53b05ecb') // y no choca
  })

  it('si el slug lo tiene ELLA MISMA, no desambigua', async () => {
    const { supabase, upserts } = fakeSupabase({ slugTomadoPor: CID })
    await ensureClientExists({ supabase, clientId: CID, task: TAREA_REDESCUBRIMIENTO })
    expect(upserts[0].slug).toBe('peniche-surf-escape')
  })

  it('sin nombre en la tarea sigue el placeholder · no inventa identidad', async () => {
    const { supabase, upserts } = fakeSupabase({ slugTomadoPor: null })
    await ensureClientExists({ supabase, clientId: CID, task: 'hacé algo' })
    expect(upserts[0].name).toBe('Cliente 53b05ecb')
  })

  it('no toca nada si la ficha ya existe', async () => {
    const { supabase, upserts } = fakeSupabase({ existeId: true })
    const r = await ensureClientExists({ supabase, clientId: CID, task: TAREA_REDESCUBRIMIENTO })
    expect(r.status).toBe('existed')
    expect(upserts).toHaveLength(0)
  })
})
