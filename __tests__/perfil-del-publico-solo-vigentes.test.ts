/**
 * 19-nov · aviso de CC1 (migración 202611190700, publicada con #1208): el perfil del público lee SOLO los públicos VIGENTES (`fusionado_en IS NULL`).
 * Un absorbido por otro no se perfila dos veces. La base falsa APLICA los filtros (eq · is), para que quitar el filtro haga caer la prueba.
 */
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ filtros: [] as string[] }))

vi.mock('@/lib/supabase', () => {
  const FILAS: Record<string, Record<string, unknown>[]> = {
    client_icp_documents: [
      { id: 'p-vigente', client_id: 'c-1', audience_segment: 'Vecinos que desayunan fuera', fusionado_en: null },
      { id: 'p-absorbido', client_id: 'c-1', audience_segment: 'Vecinos del barrio que desayunan', fusionado_en: 'p-vigente' },
      { id: 'p-otro-cliente', client_id: 'c-2', audience_segment: 'Otro', fusionado_en: null },
    ],
  }
  const consulta = (t: string) => {
    let filas = [...(FILAS[t] ?? [])]
    const o: Record<string, unknown> = {}
    o.select = () => o
    o.limit = () => o
    o.order = () => o
    o.eq = (c: string, v: unknown) => { h.filtros.push(`eq:${c}`); filas = filas.filter((f) => f[c] === v); return o }
    o.is = (c: string, v: unknown) => { h.filtros.push(`is:${c}`); filas = filas.filter((f) => (f[c] ?? null) === v); return o }
    o.then = (ok: (x: unknown) => unknown) => ok({ data: filas, error: null })
    return o
  }
  return { getSupabaseAdmin: () => ({ from: consulta }) }
})
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => ({ leerConfig: async () => null }) }))
vi.mock('@/lib/portero-alimenta/consultar', () => ({ rutaConsultar: async () => ({ status: 200, cuerpo: {} }) }))
vi.mock('@/lib/ingress-filter', () => ({ DEFAULT_ROUTE_POLICY: {}, runIngressFilter: async () => ({ allow: true }) }))
vi.mock('@/lib/finanzas/conversa/modelo-run-sdk', () => ({ baseDeRunSdk: () => 'http://x', modeloRunSdk: () => async () => ({ ok: false }) }))

import { dependenciasReales } from '@/lib/perfil-del-publico/dependencias'

describe('el perfil del público lee solo los públicos vigentes', () => {
  it('🔴 el absorbido (fusionado_en con el id del que lo absorbió) no entra; el vigente sí, y solo del cliente', async () => {
    const d = dependenciasReales({ client_id: 'c-1', workflow_id: 'wf', workflow_execution_id: 'ex', idioma: null, trato: null })
    const publicos = await d.leerPublicos()
    expect(publicos.map((p) => p.id)).toEqual(['p-vigente'])
    expect(h.filtros).toContain('is:fusionado_en')
  })
})
