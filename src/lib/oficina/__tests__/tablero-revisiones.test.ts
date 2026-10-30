/**
 * Acciones del tablero, tramo 2 (30-oct): revision-resolver · firmar-tablero. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { ACCIONES } from '../tablero/acciones'
import { DbFalsa } from './dbfalsa'

const AHORA = new Date('2026-10-30T13:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const H = '11111111-1111-4111-8111-111111111111'
const T = '22222222-2222-4222-8222-222222222222'
const hitl = (extra: Record<string, unknown> = {}) => ({ id: H, type: 'plan_con_pendientes', status: 'pending', client_id: 'c1', ...extra })

describe('revision-resolver', () => {
  it.each([
    ['confirm_competitor_list', 'aprobar', 'approved', 'lista confirmada'], ['confirm_competitor_list', 'rechazar', 'rejected', 'lista rechazada'],
    ['editor_escalation', 'aprobar', 'approved', 'revisada'], ['editor_escalation', 'rechazar', 'rejected', 'devuelta'],
    ['plan_con_pendientes', 'aprobar', 'approved', 'aprobado así'], ['plan_con_pendientes', 'rechazar', 'rejected', 'cambios pedidos'],
  ])('%s · %s → %s (%s), con quién y cuándo, sin tocar notas ni otras filas', async (tipo, decision, estado, palabra) => {
    const db = new DbFalsa().semilla('hitl_queue', [hitl({ type: tipo }), hitl({ id: 'otra', type: tipo })])
    const s = await llamar('revision-resolver', db, { hitl_id: H, decision, comentario: 'motivo' })
    expect(s.status).toBe(200); expect(s.cuerpo).toMatchObject({ ok: true, estado, resultado: palabra })
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: estado, reviewer: 'emilio', resolved_by: 'emilio', decided_at: AHORA.toISOString(), resolution_notes: 'motivo', decision: { via: 'tablero', tipo, decision, resultado: palabra, comentario: 'motivo' } })
    expect(db.tablas['hitl_queue'][1].status).toBe('pending')
  })
  it('rechazar exige comentario; aprobar no; entradas malas → 400 sin tocar la base', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [hitl()])
    expect((await llamar('revision-resolver', db, { hitl_id: H, decision: 'rechazar' })).status).toBe(400)
    expect((await llamar('revision-resolver', db, { hitl_id: 'x', decision: 'aprobar' })).status).toBe(400)
    expect((await llamar('revision-resolver', db, { hitl_id: H, decision: 'quizá' })).status).toBe(400)
    expect((await llamar('revision-resolver', db, { hitl_id: H, decision: 'aprobar', comentario: 'x'.repeat(1001) })).status).toBe(400)
    expect(db.tablas['hitl_queue'][0].status).toBe('pending')
    expect((await llamar('revision-resolver', db, { hitl_id: H, decision: 'aprobar' })).status).toBe(200)
  })
  it('inexistente → 404; una pieza u otro tipo → 409; ya resuelta → 409 y no se pisa', async () => {
    expect((await llamar('revision-resolver', new DbFalsa().semilla('hitl_queue', []), { hitl_id: H, decision: 'aprobar' })).status).toBe(404)
    const pieza = await llamar('revision-resolver', new DbFalsa().semilla('hitl_queue', [hitl({ type: 'content_piece_review' })]), { hitl_id: H, decision: 'aprobar' })
    expect(pieza.status).toBe(409); expect(pieza.cuerpo.error).toBe('tipo_no_resoluble_aqui')
    const db = new DbFalsa().semilla('hitl_queue', [hitl({ status: 'approved' })])
    expect((await llamar('revision-resolver', db, { hitl_id: H, decision: 'rechazar', comentario: 'x' })).status).toBe(409)
    expect(db.tablas['hitl_queue'][0].status).toBe('approved')
  })
})

describe('firmar-tablero', () => {
  const tab = (extra: Record<string, unknown> = {}) => ({ id: T, client_id: 'c1', estado: 'sin_firma', vigente: true, dry_run: false, huella: 'abc', ...extra })
  it('firma con nombre y fecha un tablero vigente sin_firma, conservando su huella', async () => {
    const db = new DbFalsa().semilla('finanzas_tableros', [tab()])
    const s = await llamar('firmar-tablero', db, { tablero_id: T })
    expect(s.status).toBe(200)
    expect(db.tablas['finanzas_tableros'][0]).toMatchObject({ estado: 'firmado', firmado_por: 'emilio', firmado_en: AHORA.toISOString(), huella: 'abc' })
  })
  it.each([
    ['ya firmado', { estado: 'firmado' }], ['borrador', { estado: 'borrador' }], ['ensayo', { dry_run: true }], ['no vigente', { vigente: false }], ['sin huella', { huella: null }],
  ])('%s → 409 y no cambia', async (_n, extra) => {
    const db = new DbFalsa().semilla('finanzas_tableros', [tab(extra)])
    expect((await llamar('firmar-tablero', db, { tablero_id: T })).status).toBe(409)
    expect(db.tablas['finanzas_tableros'][0].estado).toBe(extra.estado ?? 'sin_firma')
  })
  it('id malo → 400; inexistente → 404', async () => {
    expect((await llamar('firmar-tablero', new DbFalsa(), { tablero_id: 'x' })).status).toBe(400)
    expect((await llamar('firmar-tablero', new DbFalsa().semilla('finanzas_tableros', []), { tablero_id: T })).status).toBe(404)
  })
})
