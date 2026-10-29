/**
 * PEDIR CAMBIOS (29-oct): el dueño devuelve una pieza cerrada con un comentario y láminas marcadas. US$ 0, sin red.
 * Versión siguiente fuera del tope de 3; límite propio de 5 rondas; el comentario llega a la tarea del agente; doble clic = 409 sin abrir nada; si no abre, la pieza vuelve a pendiente.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { MAX_RONDAS_DE_CAMBIOS, seccionDeCambiosDelDueno } from '../cambios-del-dueno'
import { pedirCambios } from '../cambios'
import { recibirResultado } from '../orquestador'
import { validarSobre } from '../sobre'
import { POST_IMG } from '../plantillas/post-img'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL } from './memoria'

const ENV = { baseUrl: 'https://app.test', internalKey: 'k' }
const HITL = '22222222-2222-4222-8222-222222222222'
const ENC = '33333333-3333-4333-8333-333333333333'

function mundo(opc: { estado?: string; dry_run?: boolean; hitl?: string; familiaActiva?: boolean; version?: number; rondas?: number[] } = {}): DbFalsa {
  return new DbFalsa()
    .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
    .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
    .semilla('client_social_images', [])
    .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
    .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: opc.familiaActiva === false ? [] : ['post_img'], clientes_ensayo: [] }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
    .semilla('hitl_queue', [{ id: HITL, type: 'content_piece_review', status: opc.hitl ?? 'pending', client_id: CLIENTE, metadata: {} }])
    .semilla('oficina_encargos', [
      { id: ENC, client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', version_encargo: opc.version ?? 3, estado: opc.estado ?? 'cerrado', gasto_usd: 1.8, tope_usd: 2.5, dry_run: opc.dry_run ?? false, hitl_queue_id: HITL, estado_del_motor: {}, sala_ref: { _journey_id: 'j1', fila: { id: 'f1', fecha: '2026-10-26', hora: '09:00' } } },
      ...(opc.rondas ?? []).map((r, i) => ({ id: `4444444${i}-4444-4444-8444-444444444444`, client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', version_encargo: 10 + i, estado: 'cerrado', gasto_usd: 1, tope_usd: 2.5, dry_run: false, estado_del_motor: {}, sala_ref: { cambios_del_dueno: { ronda: r } } })),
    ])
}
const puertos = (db: DbFalsa) => crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch)
const pedido = { hitl_id: HITL, comentario: 'La lámina 2 está muy cargada de texto', laminas: [2, 4], reviewer: 'emilio' }

describe('pedir cambios', () => {
  it('abre la VERSIÓN SIGUIENTE aunque la pieza ya vaya en la versión 3 (los cambios del dueño no gastan el tope de versiones)', async () => {
    const db = mundo()
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'esperar', ronda: 1, rondas_restantes: MAX_RONDAS_DE_CAMBIOS - 1 })
    const nuevo = db.tablas['oficina_encargos'].find((e) => e.id !== ENC)!
    expect(nuevo).toMatchObject({ version_encargo: 4, dry_run: false, estado: 'en_paso', brief_id: 'BRF-0003', tipo_de_grupo: 'post_img' })
    expect(nuevo.sala_ref).toMatchObject({ cambios_del_dueno: { ronda: 1, comentario: 'La lámina 2 está muy cargada de texto', laminas: [2, 4], desde_hitl: HITL }, _journey_id: 'j1', fila: { id: 'f1', fecha: '2026-10-26' } })
    expect(db.tablas['oficina_encargos'].find((e) => e.id === ENC)).toMatchObject({ estado: 'cerrado', version_encargo: 3 }) // la pieza vieja no se toca
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'edited', reviewer: 'emilio', decision: { pidio_cambios: true, ronda: 1, laminas: [2, 4] } })
  })
  it('el comentario y las láminas marcadas llegan a la tarea del primer AGENTE (tras el portero)', async () => {
    const db = mundo(); const P = puertos(db)
    const r = await pedirCambios(db as never, P, pedido)
    const t0 = r.cuerpo.turno as { n: number; tipo: string }
    expect(t0.tipo).toBe('portero') // el primer turno es del portero: no lleva tarea de redacción
    const sig = await recibirResultado(P, String(r.cuerpo.encargo_id), t0.n, { texto: JSON.stringify({ caso: 'x', cliente: CLIENTE, modo: 'conversado', estado: 'ok', material: [{ dato: 'precio 7.00' }] }), costo_usd: 0, workflow_execution_id: 'ex-1' })
    const tarea = String((sig.cuerpo.turno as { pedido: { task?: string } }).pedido.task)
    expect(tarea).toContain('CAMBIOS QUE PIDE EL DUEÑO (ronda 1 de 5)')
    expect(tarea).toContain('La lámina 2 está muy cargada de texto')
    expect(tarea).toContain('Láminas que marcó: 2, 4')
  })
  it('doble clic (o Slack y ventana a la vez): la segunda llamada es 409 y NO abre otra versión', async () => {
    const db = mundo()
    const P = puertos(db)
    expect((await pedirCambios(db as never, P, pedido)).status).toBe(200)
    const dos = await pedirCambios(db as never, P, pedido)
    expect(dos.status).toBe(409); expect(dos.cuerpo.error).toBe('ya_decidida')
    expect(db.tablas['oficina_encargos']).toHaveLength(2)
  })
  it('carrera: otra decisión gana la pieza ENTRE la lectura y la toma → 409 y no se abre una segunda versión (la toma es condicional en la base)', async () => {
    const db = mundo(); const P = puertos(db)
    const desde = db.from.bind(db)
    let flip = false
    ;(db as unknown as { from: (t: string) => unknown }).from = (tabla: string) => {
      const q = desde(tabla) as { maybeSingle: () => unknown }
      if (tabla !== 'hitl_queue') return q
      const m = q.maybeSingle.bind(q)
      q.maybeSingle = () => ({ then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(m()).then((r) => { if (!flip) { flip = true; db.tablas['hitl_queue'][0].status = 'edited' } return r }).then(ok, ko) })
      return q
    }
    const r = await pedirCambios(db as never, P, pedido)
    expect(r.status).toBe(409); expect(r.cuerpo).toMatchObject({ error: 'ya_decidida', detalle: expect.stringMatching(/mientras tanto/) })
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
  })
  it('la quinta ronda se acepta y la sexta se rechaza (límite propio: 5)', async () => {
    const cuarta = mundo({ rondas: [1, 2, 3, 4] })
    const ok = await pedirCambios(cuarta as never, puertos(cuarta), pedido)
    expect(ok.status).toBe(200); expect(ok.cuerpo).toMatchObject({ ronda: 5, rondas_restantes: 0 })
    const quinta = mundo({ rondas: [1, 2, 3, 4, 5] })
    const no = await pedirCambios(quinta as never, puertos(quinta), pedido)
    expect(no.status).toBe(409); expect(no.cuerpo).toMatchObject({ error: 'limite_de_rondas', rondas_hechas: 5, maximo: 5 })
    expect(quinta.tablas['hitl_queue'][0].status).toBe('pending') // rechazado ANTES de tomar la pieza
  })
  it.each([
    ['una pieza ya decidida', { hitl: 'approved' }, 'ya_decidida'],
    ['un ensayo', { dry_run: true }, 'es_un_ensayo'],
    ['un encargo que no está cerrado', { estado: 'en_paso' }, 'encargo_no_cerrado'],
    ['un encargo fallido', { estado: 'fallido' }, 'encargo_no_cerrado'],
    ['un encargo ya aprobado', { estado: 'aprobada' }, 'encargo_no_cerrado'],
  ])('%s → 409 y no se abre nada', async (_n, opc, error) => {
    const db = mundo(opc as never)
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(409); expect(r.cuerpo.error).toBe(error)
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
  })
  it('pieza inexistente → 404; pieza que no es de la oficina → 409', async () => {
    const db = mundo()
    expect((await pedirCambios(db as never, puertos(db), { ...pedido, hitl_id: '99999999-9999-4999-8999-999999999999' })).status).toBe(404)
    db.tablas['hitl_queue'][0].type = 'confirm_competitor_list'
    expect((await pedirCambios(db as never, puertos(db), pedido)).cuerpo.error).toBe('no_es_una_pieza_de_la_oficina')
  })
  it('si la versión siguiente no se puede abrir (familia apagada), la pieza VUELVE a pendiente: el dueño no la pierde', async () => {
    const db = mundo({ familiaActiva: false })
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).not.toBe(200)
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'pending' })
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
  })
})

describe('el sobre y la tarea', () => {
  const base = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false }
  const cambios = { ronda: 1, comentario: 'Más claro el precio', laminas: [1], desde_hitl: HITL, pedido_por: 'emilio' }
  it('el sobre acepta cambios válidos y los conserva; rechaza los mal formados', () => {
    const v = validarSobre({ ...base, cambios_del_dueno: cambios })
    expect(v.ok && v.sobre.cambios_del_dueno).toEqual(cambios)
    for (const mal of [{ ...cambios, ronda: 6 }, { ...cambios, ronda: 0 }, { ...cambios, comentario: 'no' }, { ...cambios, laminas: [0] }, { ...cambios, laminas: ['1'] }, 'texto', { ...cambios, pedido_por: '' }]) expect(validarSobre({ ...base, cambios_del_dueno: mal }).ok).toBe(false)
  })
  it('sin cambios del dueño la tarea no cambia ni una letra; con ellos suma la sección', () => {
    expect(seccionDeCambiosDelDueno(null)).toBe('')
    expect(seccionDeCambiosDelDueno({ reapertura: {} })).toBe('')
    expect(seccionDeCambiosDelDueno({ cambios_del_dueno: { ...cambios, laminas: [] } })).toContain('No marcó láminas concretas')
  })
  it('el almacén no abre cambios sobre un encargo que sigue vivo (no hay pieza cerrada que devolver)', async () => {
    const db = mundo({ estado: 'en_paso' })
    const P = puertos(db)
    const r = await P.almacen.crearEncargo({ client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', tope_usd: 2.5, dry_run: false, prueba: false, sala_ref: null, estado_del_motor: {} as never, cambios_del_dueno: cambios })
    expect(r.ok).toBe(false)
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
  })
})
