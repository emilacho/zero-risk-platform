/**
 * G2b-plataforma · «nada se recorta» (GO Lenovo 18-nov 15:52Z · CC5): lo que Emilio escribe desde el tablero llega ENTERO a la base, hasta el tope
 * único de 100 000 (`TOPE_DEL_TEXTO_DEL_DUENO`); arriba se rechaza con 400 sin tocar la base. Prueba de conducta sobre los manejadores reales.
 */
import { describe, expect, it } from 'vitest'
import { ACCIONES } from '../tablero/acciones'
import { validarSobre } from '../sobre'
import { OBSERVACIONES_MAX } from '../video/aprobacion'
import { MAX_MOTIVO } from '../../dueno-preguntas/preguntas'
import { LARGO_MAXIMO_DE_CAMPO } from '../../cadena/banco-de-ideas'
import { TOPE_DEL_TEXTO_DEL_DUENO } from '../../limites-de-tamano'
import { DbFalsa } from './dbfalsa'

const AHORA = new Date('2026-11-18T23:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const H = '11111111-1111-4111-8111-111111111111'
const largo = 'w'.repeat(5000)
const demas = 'w'.repeat(100_001)

describe('G2b-plataforma · el tope es el único de 100 000', () => {
  it('🔴 las constantes que tocan texto de Emilio no tienen un tope propio más corto', () => {
    expect(TOPE_DEL_TEXTO_DEL_DUENO).toBe(100_000)
    for (const [n, x] of Object.entries({ OBSERVACIONES_MAX, MAX_MOTIVO, LARGO_MAXIMO_DE_CAMPO })) expect(x, n).toBe(100_000)
  })
})

describe('G2b-plataforma · revision-resolver guarda el comentario entero', () => {
  it('🔴 un comentario de 5000 queda entero en resolution_notes; uno de 100 001 es 400 y no toca la fila', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [{ id: H, type: 'plan_con_pendientes', status: 'pending', client_id: 'c1' }])
    const s = await llamar('revision-resolver', db, { hitl_id: H, decision: 'rechazar', comentario: largo })
    expect(s.status).toBe(200)
    expect(db.tablas['hitl_queue'][0].resolution_notes).toBe(largo)
    const db2 = new DbFalsa().semilla('hitl_queue', [{ id: H, type: 'plan_con_pendientes', status: 'pending', client_id: 'c1' }])
    expect((await llamar('revision-resolver', db2, { hitl_id: H, decision: 'rechazar', comentario: demas })).status).toBe(400)
    expect(db2.tablas['hitl_queue'][0].status).toBe('pending')
  })
})

describe('G2b-plataforma · plan-aprobar guarda el comentario entero', () => {
  it('🔴 un comentario de 5000 queda entero en la compuerta del plan (antes el tope era 1000)', async () => {
    const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const plan = { id: H, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-11-18T10:00:00Z', provenance_tag: { fuente: 'planeacion' } }
    const SOBRE = { _journey_id: 'j1', _sala_correlation_id: 'corr-1', client_name: 'Cliente', con_pendientes: false, dry_run: false }
    const db = new DbFalsa().semilla('client_historical_outputs', [plan]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: H, client_id: C, estado: 'pendiente', sobre_de_reanudacion: SOBRE }])
    const s = await llamar('plan-aprobar', db, { plan_id: H, comentario: largo })
    expect(s.status).toBe(200)
    expect(db.tablas['plan_aprobaciones'][0].comentario).toBe(largo)
  })
})

describe('G2b-plataforma · la baja del cliente y rehacer la pieza', () => {
  it('🔴 un motivo de baja de 5000 queda entero en archived_reason (antes el tope era 500)', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: H, status: 'active' }])
    expect((await llamar('cliente-baja', db, { client_id: H, comentario: largo })).status).toBe(200)
    expect(db.tablas['clients'][0].archived_reason).toBe(largo)
  })
  it('🔴 rehacer: un comentario de 5000 pasa la validación entero y sigue al freno del gasto (antes el tope era 300)', async () => {
    const s = await llamar('rehacer-pieza', new DbFalsa(), { encargo_id: H, comentario: largo })
    expect(s.cuerpo.error).not.toBe('entrada_invalida')
    expect((s as { toca?: { comentario?: unknown } }).toca?.comentario).toBe(largo)
    expect((await llamar('rehacer-pieza', new DbFalsa(), { encargo_id: H, comentario: demas })).cuerpo.error).toBe('entrada_invalida')
  })
})

describe('G2b-plataforma · la causa corregida al reabrir', () => {
  it('🔴 5000 pasa; 100 001 no', () => {
    const base = { parte_id: H, brief_id: 'BRF-0003', dry_run: false }
    expect(validarSobre({ ...base, reabrir_causa_corregida: largo })).toMatchObject({ ok: true })
    expect(validarSobre({ ...base, reabrir_causa_corregida: demas })).toMatchObject({ ok: false })
  })
})
