/**
 * 11-nov · #21 · el vigía de la oficina con la regla única de vida: el plazo de un paso sale del techo medido de SU agente y de su latido, nunca más corto que los 12 min.
 * Mismo armado que `vigia-rutas.test.ts` (base falsa, cliente de memoria). Números reales medidos el 11-nov: jefe-marketing hasta 25 min (Náufrago).
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { revisarPasosMuertos } from '../vigia'
import { POST_IMG } from '../plantillas/post-img'
import { abrirEncargo } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL } from './memoria'
import { CORRIDAS_MINIMAS, type LectorDeVida } from '../../plazo-de-vida'

const ENV = { baseUrl: 'https://app.test', internalKey: 'k' }
const MIN = 60_000
const corridas = (masLargaMin: number) => [...Array.from({ length: CORRIDAS_MINIMAS - 1 }, () => 3 * MIN), masLargaMin * MIN]

async function conPasoDe(agente: string, minutos: number) {
  const db = new DbFalsa()
    .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
    .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
    .semilla('client_social_images', [])
    .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
    .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
  const hora = new Date('2026-10-10T12:00:00Z')
  const P = crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora)
  const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const t = db.tablas['oficina_turnos'].find((x) => x.estado === 'corriendo')!
  Object.assign(t, { agente, dispatch_key: `oficina:${String(a.cuerpo.encargo_id)}:1`, workflow_execution_id: 'ex-acuse', inicio: new Date(hora.getTime() - minutos * MIN).toISOString() })
  return { db, P, hora, id: String(a.cuerpo.encargo_id), turno: t }
}

describe('el vigía de la oficina con el plazo medido', () => {
  it('🔴 un paso de 20 min cuyo agente tarda hasta 25 min en corridas reales NO se da por muerto (hoy moría a los 12)', async () => {
    const { db, P, hora, turno } = await conPasoDe('jefe-marketing', 20)
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => corridas(25) }
    expect(await revisarPasosMuertos(P, db, hora, lector)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(turno.estado).toBe('corriendo')
  })
  it('🔴 pasado su techo medido (38 min) muere, con el texto de siempre y el techo medido', async () => {
    const { db, P, hora, id } = await conPasoDe('jefe-marketing', 40)
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => corridas(25) }
    expect((await revisarPasosMuertos(P, db, hora, lector)).reanudar).toEqual([id])
    expect(db.tablas['oficina_turnos'].find((x) => x.estado === 'muerto')).toMatchObject({ error: 'sin vuelta en 38 min' })
  })
  it('🔴 un agente con poca historia (menos de 10 corridas) muere a los 12 min, como hoy', async () => {
    const { db, P, hora, id } = await conPasoDe('agente-nuevo', 13)
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => [40 * MIN] }
    expect((await revisarPasosMuertos(P, db, hora, lector)).reanudar).toEqual([id])
  })
  it('🔴 un despacho que sigue latiendo vive aunque pase su techo', async () => {
    const { db, P, hora, turno } = await conPasoDe('agente-nuevo', 20)
    const lector: LectorDeVida = { despacho: async () => ({ status: 'running', created_at: turno.inicio as string, running_at: turno.inicio as string, updated_at: new Date(hora.getTime() - 30_000).toISOString() }), duraciones: async () => [] }
    expect(await revisarPasosMuertos(P, db, hora, lector)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
  })
  it('🔴 lo que no se puede leer no mata: el paso queda como está y se anota', async () => {
    const { db, P, hora, id, turno } = await conPasoDe('jefe-marketing', 300)
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => { throw new Error('base caída') } }
    const r = await revisarPasosMuertos(P, db, hora, lector)
    expect(r).toMatchObject({ reanudar: [], fallidos: [], sin_dato: [{ encargo_id: id, motivo: expect.stringContaining('base caída') }] })
    expect(turno.estado).toBe('corriendo')
  })
})
