/**
 * Regla estructural «superada» (30-oct, ADENDA 3): la versión nueva de una pieza retira sola a la anterior que siga pendiente; para cualquier cliente y sin tocar las notas ni los eventos del dueño. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos, type Entorno } from '../adaptadores'
import { retirarLasSuperadas } from '../superadas'
import { DbFalsa } from './dbfalsa'

const ENV = { baseUrl: 'https://app.test', internalKey: 'k', openaiKey: 'x', revisorModelo: 'm', revisorPrecioEntrada: 1, revisorPrecioSalida: 1 } as unknown as Entorno
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const meta = (parte: string, brief: string) => ({ origen: 'oficina', parte_id: parte, brief_id: brief })
const pend = (id: string, client_id: string, parte: string, brief: string, extra: Record<string, unknown> = {}) => ({ id, client_id, type: 'content_piece_review', status: 'pending', metadata: meta(parte, brief), ...extra })
const base = () => new DbFalsa().semilla('notas_del_dueno', []).semilla('eventos_de_emilio', [])

describe('retirarLasSuperadas', () => {
  it('retira la pendiente de la MISMA pieza (cliente + parte + brief), marcada como no-decisión, y deja 0 notas y 0 eventos', async () => {
    const db = base().semilla('hitl_queue', [pend('h1', 'c1', 'p1', 'BRF-1')])
    const r = await retirarLasSuperadas(db, { hitl_id: 'h2', client_id: 'c1', metadata: meta('p1', 'BRF-1') }, () => new Date('2026-10-30T12:00:00Z'))
    expect(r.retiradas).toEqual(['h1'])
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'rejected', resolved_by: 'oficina-superada', decision: { superada: true, superada_por: 'h2', no_es_decision_del_dueno: true } })
    expect(db.tablas['notas_del_dueno']).toHaveLength(0); expect(db.tablas['eventos_de_emilio']).toHaveLength(0)
  })
  it('NO toca: otro cliente, otro brief, otra parte, otro tipo, ya decididas, ni a sí misma', async () => {
    const filas = [
      pend('otro-cliente', 'c2', 'p1', 'BRF-1'), pend('otro-brief', 'c1', 'p1', 'BRF-2'), pend('otra-parte', 'c1', 'p2', 'BRF-1'),
      pend('otro-tipo', 'c1', 'p1', 'BRF-1', { type: 'editor_escalation' }), pend('aprobada', 'c1', 'p1', 'BRF-1', { status: 'approved' }), pend('editada', 'c1', 'p1', 'BRF-1', { status: 'edited' }),
      pend('h2', 'c1', 'p1', 'BRF-1'),
    ]
    const db = base().semilla('hitl_queue', filas)
    expect((await retirarLasSuperadas(db, { hitl_id: 'h2', client_id: 'c1', metadata: meta('p1', 'BRF-1') })).retiradas).toEqual([])
    expect(db.tablas['hitl_queue'].map((f) => f.status)).toEqual(['pending', 'pending', 'pending', 'pending', 'approved', 'edited', 'pending'])
  })
  it('sin parte_id o brief_id en la metadata no retira nada; si la base falla, no lanza', async () => {
    const db = base().semilla('hitl_queue', [pend('h1', 'c1', 'p1', 'BRF-1')])
    expect((await retirarLasSuperadas(db, { hitl_id: 'h2', client_id: 'c1', metadata: {} })).retiradas).toEqual([])
    db.fallar['hitl_queue'] = 'caída'
    await expect(retirarLasSuperadas(db, { hitl_id: 'h2', client_id: 'c1', metadata: meta('p1', 'BRF-1') })).resolves.toEqual({ retiradas: [] })
  })
  it('retira VARIAS pendientes antiguas de la misma pieza', async () => {
    const db = base().semilla('hitl_queue', [pend('h1', 'c1', 'p1', 'BRF-1'), pend('h0', 'c1', 'p1', 'BRF-1')])
    expect((await retirarLasSuperadas(db, { hitl_id: 'h2', client_id: 'c1', metadata: meta('p1', 'BRF-1') })).retiradas.sort()).toEqual(['h0', 'h1'])
  })
})

describe('por la bandeja de verdad (cualquier vía llega por aquí)', () => {
  it('al llegar la versión nueva, la anterior pendiente queda superada por la nueva; la nueva queda pendiente; vale para cualquier cliente', async () => {
    for (const cliente of ['cliente-x', 'cliente-y']) {
      const db = base().semilla('client_historical_outputs', [{ id: A, client_id: cliente }, { id: B, client_id: cliente }])
      const P = crearPuertos(db, ENV, (async () => new Response('{}')) as typeof fetch)
      const v1 = await P.bandeja({ client_id: cliente, output_id: A, titulo: 't1', vista_previa: 'v', metadata: meta('p1', 'BRF-2'), expires_at: null })
      expect(v1.ok).toBe(true)
      const v2 = await P.bandeja({ client_id: cliente, output_id: B, titulo: 't2', vista_previa: 'v', metadata: meta('p1', 'BRF-2'), expires_at: null })
      if (!v1.ok || !v2.ok) throw new Error('bandeja')
      const [f1, f2] = db.tablas['hitl_queue']
      expect(f1).toMatchObject({ id: v1.id, status: 'rejected', decision: { superada: true, superada_por: v2.id, no_es_decision_del_dueno: true } })
      expect(f2).toMatchObject({ id: v2.id, status: 'pending' })
      expect(db.tablas['notas_del_dueno']).toHaveLength(0); expect(db.tablas['eventos_de_emilio']).toHaveLength(0)
    }
  })
})
