/**
 * 11-nov · #21 · el vigía de la oficina con la regla única de vida: el plazo de un paso sale del techo medido de SU agente y de su latido, nunca más corto que los 12 min.
 * Mismo armado que `vigia-rutas.test.ts` (base falsa, cliente de memoria). Números reales medidos el 11-nov: jefe-marketing hasta 25 min (Náufrago).
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { lectorDeVidaDeLaOficina, revisarPasosMuertos } from '../vigia'
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
    const pedidos: string[][] = []
    const lector: LectorDeVida = { despacho: async (e, a) => { pedidos.push([e, a]); return e === 'ex-acuse' && a === 'agente-nuevo' ? { status: 'running', created_at: turno.inicio as string, running_at: turno.inicio as string, updated_at: new Date(hora.getTime() - 30_000).toISOString() } : null }, duraciones: async () => [] }
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

describe('el lector de vida de la oficina (11-nov · #21)', () => {
  it('🔴 el brazo de video se mide por SUS turnos terminados (fin − inicio); un agente, por sus corridas reales; base caída LANZA', async () => {
    const db = new DbFalsa()
      .semilla('oficina_turnos', [
        { id: 't1', encargo_id: 'e-nau', n: 4, tipo: 'brazo', estado: 'hecho', inicio: '2026-11-10T10:00:00Z', fin: '2026-11-10T10:07:00Z' },
        { id: 't2', encargo_id: 'e-b2b', n: 4, tipo: 'brazo', estado: 'hecho', inicio: '2026-11-10T11:00:00Z', fin: '2026-11-10T11:31:00Z' },
        { id: 't3', encargo_id: 'e-b2b', n: 5, tipo: 'brazo', estado: 'corriendo', inicio: '2026-11-10T12:00:00Z', fin: null },
        { id: 't4', encargo_id: 'e-nau', n: 2, tipo: 'agente', estado: 'hecho', inicio: '2026-11-10T09:00:00Z', fin: '2026-11-10T09:50:00Z' },
      ])
      .semilla('agent_invocations', [
        { id: 'i1', agent_id: 'jefe-marketing', status: 'completed', cost_usd: 0.4, duration_ms: 25 * MIN, started_at: '2026-11-10T08:00:00Z' },
        { id: 'i2', agent_id: 'jefe-marketing', status: 'completed', cost_usd: 0, duration_ms: 90 * MIN, started_at: '2026-11-10T08:10:00Z' },
      ])
    const l = lectorDeVidaDeLaOficina(db)
    expect([...(await l.duraciones('brazo:video'))].sort((x, y) => x - y)).toEqual([7 * MIN, 31 * MIN])
    expect(await l.duraciones('jefe-marketing')).toEqual([25 * MIN])
    db.fallar['oficina_turnos'] = 'base caída'
    await expect(l.duraciones('brazo:video')).rejects.toThrow(/base caída/)
  })
})

describe('el vigía de la oficina, tal como lo llama su ruta (sin lector a mano)', () => {
  it('🔴 mide el brazo por sus turnos: si sus videos tardan 60 min, uno de 50 min sin terminar sigue esperando (con los 45 de hoy se daría por vencido)', async () => {
    const hora = new Date('2026-11-11T14:00:00Z')
    const hechos = Array.from({ length: CORRIDAS_MINIMAS }, (_, i) => ({ id: `h${i}`, encargo_id: i % 2 ? 'e-nau' : 'e-b2b', n: 4, paso: 'video', tipo: 'brazo', estado: 'hecho', inicio: '2026-11-10T10:00:00Z', fin: '2026-11-10T11:00:00Z' }))
    const db = new DbFalsa().semilla('oficina_turnos', [...hechos, { id: 'vivo', encargo_id: 'e-b2b', n: 5, paso: 'video', tipo: 'brazo', estado: 'corriendo', workflow_execution_id: 'ex-1', inicio: new Date(hora.getTime() - 50 * MIN).toISOString() }])
    let recibidos = 0
    const enc = { id: 'e-b2b', estado: 'esperando', client_id: CLIENTE, brief_id: 'BRF-9', sala_ref: null, gasto_usd: 0, estado_del_motor: { vueltas: {}, artefactos: { pedido_video: { datos: { envio: { request_id: 'r1' } } } } } }
    const P = {
      almacen: { leerEncargo: async () => enc, registrarPaso: async () => { recibidos++ }, guardar: async () => { recibidos++ } },
      video: { estado: async () => ({ ok: true, terminal: false, status: 'IN_PROGRESS' }) },
      avisar: async () => undefined,
    } as never
    const r = await revisarPasosMuertos(P, db, hora)
    expect([r.reanudar, r.fallidos, recibidos]).toEqual([[], [], 0])
    expect(db.tablas['oficina_turnos'].find((t) => t.id === 'vivo')?.estado).toBe('corriendo')
  })
})

describe('el latido llega a la oficina por ejecución + agente, con las llaves REALES (CC6 21A)', () => {
  it('🔴 por la ruta (sin lector a mano): el turno guarda `oficina:<encargo>:<n>` y el libro `dispatch:<flujo>:<agente>:<ejecución>`; casan por ejecución + agente y el que late vive', async () => {
    const { db, P, hora, turno } = await conPasoDe('agente-nuevo', 20)
    expect(String(turno.dispatch_key)).toMatch(/^oficina:.+:1$/)
    db.semilla('agent_dispatches', [{ id: 'd1', dispatch_key: 'dispatch:wf-oficina:agente-nuevo:ex-acuse', workflow_execution_id: 'ex-acuse', agent_name: 'agente-nuevo', status: 'running', created_at: turno.inicio, running_at: turno.inicio, updated_at: new Date(hora.getTime() - 30_000).toISOString() }])
    expect(await revisarPasosMuertos(P, db, hora)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(turno.estado).toBe('corriendo')
    // el mismo latido pero de OTRO agente de la misma ejecución no lo salva
    db.tablas['agent_dispatches'][0].agent_name = 'otro-agente'
    expect((await revisarPasosMuertos(P, db, hora)).reanudar).toHaveLength(1)
  })
})

describe('el brazo cuando su historial no se lee (sabotaje vivo de CC6)', () => {
  it('🔴 esta vuelta NO vence ningún video (aunque pase los 45 min) y se anota sin_dato', async () => {
    const hora = new Date('2026-11-11T14:00:00Z')
    const db = new DbFalsa().semilla('oficina_turnos', [{ id: 'vivo', encargo_id: 'e-nau', n: 5, paso: 'video', tipo: 'brazo', estado: 'corriendo', workflow_execution_id: 'ex-2', inicio: new Date(hora.getTime() - 50 * MIN).toISOString() }])
    let recibidos = 0
    const enc = { id: 'e-nau', estado: 'esperando', client_id: CLIENTE, brief_id: 'BRF-7', sala_ref: null, gasto_usd: 0, estado_del_motor: { vueltas: {}, artefactos: { pedido_video: { datos: { envio: { request_id: 'r2' } } } } } }
    const P = {
      almacen: { leerEncargo: async () => enc, registrarPaso: async () => { recibidos++ }, guardar: async () => { recibidos++ } },
      video: { estado: async () => ({ ok: true, terminal: false, status: 'IN_PROGRESS' }) },
      avisar: async () => undefined,
    } as never
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => { throw new Error('base caída') } }
    const r = await revisarPasosMuertos(P, db, hora, lector)
    expect([r.reanudar, r.fallidos, recibidos]).toEqual([[], [], 0])
    expect(r.sin_dato).toEqual([{ encargo_id: 'e-nau', paso: 'video', motivo: expect.stringContaining('base caída') }])
  })
})
