/**
 * Tests · rama "corregir" del worker productor (SPEC §6) · §144.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadCorrectionPackage,
  buildCorrectionPrompt,
} from '../src/lib/camino-iii/correction-branch'
import type { ConsolidatedCorrection } from '../src/lib/camino-iii/corrections'

const corrections: ConsolidatedCorrection[] = [
  {
    eje: 'voz',
    severidad: 'red',
    donde: 'parrafo 2',
    problema: 'tono demasiado formal',
    por_que: 'brand book pide cercanía',
    cambio_sugerido: 'reescribir en segunda persona',
    reviewer_agent: 'brand-strategist',
    is_voting: true,
  },
]

/** Mock supabase · `.from().select().eq().eq().maybeSingle()`. */
function mockSupabase(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => result)
  const eq2 = vi.fn(() => ({ maybeSingle }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, from, select }
}

describe('loadCorrectionPackage', () => {
  it('reads corrections + revision_count by item key', async () => {
    const { client, from } = mockSupabase({
      data: { corrections, revision_count: 2 },
      error: null,
    })
    const r = await loadCorrectionPackage(client, 'content_deliverable', 'piece-1')
    expect(from).toHaveBeenCalledWith('editorial_decisions')
    expect(r.ok).toBe(true)
    expect(r.pkg.found).toBe(true)
    expect(r.pkg.revision_count).toBe(2)
    expect(r.pkg.corrections).toHaveLength(1)
  })

  it('no row · ok with empty package (found:false)', async () => {
    const { client } = mockSupabase({ data: null, error: null })
    const r = await loadCorrectionPackage(client, 't', 'i')
    expect(r.ok).toBe(true)
    expect(r.pkg.found).toBe(false)
    expect(r.pkg.corrections).toHaveLength(0)
  })

  it('error · fail-open ok:false · never throws', async () => {
    const { client } = mockSupabase({ data: null, error: { message: 'boom' } })
    const r = await loadCorrectionPackage(client, 't', 'i')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('boom')
  })
})

describe('buildCorrectionPrompt', () => {
  it('injects corrections + "corregí SOLO esto" framing + draft', () => {
    const prompt = buildCorrectionPrompt('mi borrador previo', {
      item_type: 'content_deliverable',
      item_id: 'piece-1',
      revision_count: 1,
      corrections,
      found: true,
    })
    expect(prompt).toMatch(/mi borrador previo/)
    expect(prompt).toMatch(/SOLO/)
    expect(prompt).toMatch(/parrafo 2/)
    expect(prompt).toMatch(/reescribir en segunda persona/)
    expect(prompt).toMatch(/brand-strategist/)
    expect(prompt).toMatch(/1\/3/)
  })

  it('returns the draft unchanged when there are no corrections (defensive)', () => {
    const prompt = buildCorrectionPrompt('borrador', {
      item_type: 't',
      item_id: 'i',
      revision_count: 0,
      corrections: [],
      found: false,
    })
    expect(prompt).toBe('borrador')
  })
})
