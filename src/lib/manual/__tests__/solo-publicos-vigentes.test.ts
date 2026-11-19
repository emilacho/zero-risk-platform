/**
 * 19-nov · aviso de CC1 (migración 202611190700, #1208): la mesa del manual lee SOLO los públicos VIGENTES (`fusionado_en IS NULL`).
 * Los dos lectores: `leerInsumos` (la revisión) y `sintesisDelCliente` (la ruta de hechos). `DbFalsa` aplica `is`: quitar el filtro hace caer la prueba.
 */
import { describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))

import { leerInsumos } from '../revision'
import { sintesisDelCliente } from '../almacen-supabase'

const C = 'c-vigentes'
const PUBLICOS = [
  { id: 'p-vigente', client_id: C, audience_segment: 'SEGMENTO-VIGENTE', objections: 'o', decision_criteria: 'd', key_messages_for_segment: 'k', content_text: 'texto vigente', fusionado_en: null },
  { id: 'p-absorbido', client_id: C, audience_segment: 'SEGMENTO-ABSORBIDO', objections: 'o2', decision_criteria: 'd2', key_messages_for_segment: 'k2', content_text: 'texto absorbido', fusionado_en: 'p-vigente' },
]
const base = () => new DbFalsa()
  .semilla('clients', [{ id: C, name: 'Cliente de prueba', website_url: null, config: {} }])
  .semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: { voice_description: 'v' } }), created_at: '2026-11-01T00:00:00Z' }])
  .semilla('client_icp_documents', PUBLICOS)

describe('la mesa del manual lee solo los públicos vigentes', () => {
  it('🔴 la revisión (`leerInsumos`): el absorbido no entra en sus fuentes; el vigente sí', async () => {
    const r = await leerInsumos(base() as never, C)
    const todo = JSON.stringify(r)
    expect(todo).toContain('SEGMENTO-VIGENTE')
    expect(todo).not.toContain('SEGMENTO-ABSORBIDO')
  })
  it('🔴 la síntesis de la ruta de hechos (`sintesisDelCliente`): solo el vigente', async () => {
    h.db = base()
    const s = await sintesisDelCliente(C)
    expect(s.filter((x) => x.id.startsWith('icp:')).map((x) => x.id)).toEqual(['icp:p-vigente'])
  })
})
