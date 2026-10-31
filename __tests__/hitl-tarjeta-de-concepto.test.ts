/**
 * T3 (31-oct) · la tarjeta «Gran idea» de la cadena en la bandeja: NO sale en la lista de piezas (salvo que se pida) y NO se decide por `PATCH /api/hitl/[id]` (409 → `/api/cadena/concepto`).
 * US$ 0, base simulada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { esTarjetaDeConcepto, listarAprobaciones } from '@/lib/hitl/bandeja'
import { TIPO_TARJETA_DE_CONCEPTO } from '@/lib/cadena/almacen'

let filaActual: Record<string, unknown> | null = null
const registro: Array<{ op: string; neq?: unknown[] }> = []

vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (datos: Record<string, unknown>) => ({
        eq: () => ({
          neq: (col: string, v: unknown) => {
            registro.push({ op: 'update', neq: [col, v] })
            // como PostgREST: si la fila no pasa el filtro, `.single()` contesta PGRST116 (0 filas)
            return { select: () => ({ single: async () => (filaActual && filaActual[col] !== v ? { data: { ...filaActual, ...datos }, error: null } : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }) }) }
          },
        }),
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => { registro.push({ op: 'select' }); return { data: filaActual, error: null } } }) }),
    }),
  }),
}))

const patch = async (cuerpo: unknown, id = '11111111-1111-4111-8111-111111111111') => {
  const { PATCH } = await import('../src/app/api/hitl/[id]/route')
  const r = await PATCH(new Request('http://x/api/hitl/' + id, { method: 'PATCH', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }), { params: { id } })
  return { status: r.status, json: (await r.json()) as Record<string, any> }
}

beforeEach(() => { registro.length = 0; filaActual = null })

describe('PATCH /api/hitl/[id] y la tarjeta de la gran idea', () => {
  it('🔴 aprobar la tarjeta de concepto por la bandeja de piezas: 409 con la puerta correcta, y la fila NO cambia', async () => {
    filaActual = { id: '11111111-1111-4111-8111-111111111111', type: TIPO_TARJETA_DE_CONCEPTO, status: 'pending', metadata: { origen: 'cadena', tipo: 'concepto' } }
    const r = await patch({ status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe('tarjeta_de_concepto')
    expect(r.json.detail).toContain('/api/cadena/concepto')
    expect(registro[0]).toEqual({ op: 'update', neq: ['type', TIPO_TARJETA_DE_CONCEPTO] })
  })
  it('una pieza cualquiera se decide como siempre (la exclusión viaja en la misma escritura, sin lectura previa)', async () => {
    filaActual = { id: '11111111-1111-4111-8111-111111111111', type: 'otro', status: 'pending', metadata: {} }
    const r = await patch({ status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(200)
    expect(r.json.item.status).toBe('approved')
    expect(registro.map((x) => x.op)).toEqual(['update'])
  })
  it('una fila que no existe sigue siendo 404', async () => {
    filaActual = null
    expect((await patch({ status: 'rejected' })).status).toBe(404)
  })
})

describe('listarAprobaciones y la tarjeta de la gran idea', () => {
  const filas = [
    { id: 'p1', status: 'pending', type: 'content_review', metadata: { origen: 'oficina' }, expires_at: null },
    { id: 'c1', status: 'pending', type: TIPO_TARJETA_DE_CONCEPTO, metadata: { origen: 'cadena', tipo: 'concepto', campana_id: 'x', version: 1 }, expires_at: null },
    { id: 'p2', status: 'pending', type: 'content_review', metadata: { tipo: 'concepto' }, expires_at: null }, // «tipo» sin origen cadena: no es la tarjeta
  ]
  const db = { from: () => { const q: any = { select: () => q, order: () => q, limit: () => q, eq: () => q, in: () => q, then: (res: any) => Promise.resolve({ data: filas, error: null }).then(res) }; return q } }
  it('la lista de pendientes NO trae la tarjeta de concepto; con incluirConceptos sí', async () => {
    expect((await listarAprobaciones(db as never, { estado: 'pending' })).filas.map((x) => x.id)).toEqual(['p1', 'p2'])
    expect((await listarAprobaciones(db as never, { estado: 'pending', incluirConceptos: true })).filas.map((x) => x.id)).toEqual(['p1', 'c1', 'p2'])
    expect((await listarAprobaciones(db as never, { estado: 'all' })).filas.map((x) => x.id)).toEqual(['p1', 'p2'])
  })
  it('esTarjetaDeConcepto exige origen cadena + tipo concepto', () => {
    expect(esTarjetaDeConcepto(filas[1])).toBe(true)
    expect(esTarjetaDeConcepto(filas[2])).toBe(false)
    expect(esTarjetaDeConcepto({ metadata: null })).toBe(false)
    expect(esTarjetaDeConcepto({ metadata: 'x' })).toBe(false)
  })
})
