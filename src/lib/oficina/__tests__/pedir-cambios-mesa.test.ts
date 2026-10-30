/**
 * PEDIR CAMBIOS sobre una pieza de la MESA (30-oct, encender-bandeja): la forma exacta de BRF-0002 en producción. Dos ensayos (dry_run) con versiones altas y la pieza real en v3, cerrada, con su fila pendiente en la bandeja.
 * Debe reabrir la mesa en la versión 4 (fuera del tope de 3 versiones), contar en las 5 rondas, mandar el comentario y las láminas al primer agente, y no tocar ni la pieza vieja ni los ensayos. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { esIntentoFallidoDeCambios, MAX_RONDAS_DE_CAMBIOS } from '../cambios-del-dueno'
import { pedirCambios } from '../cambios'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { DbFalsa } from './dbfalsa'
import { BRIEF_CARRUSEL, parteCon } from './mesa-arnes'
import { CLIENTE, PARTE } from './memoria'
import { DIRECTORIO } from './mesa-memoria'

const ENV = { baseUrl: 'https://app.test', internalKey: 'k' }
const HITL = '22222222-2222-4222-8222-222222222222'
const REAL = '33333333-3333-4333-8333-333333333333'
const base = { client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0100', tipo_de_grupo: 'carrusel_mesa', familia: 'carrusel_mesa', tope_usd: 5 }

function mundo(opc: { rondas?: number[]; estadoReal?: string } = {}): DbFalsa {
  return new DbFalsa()
    .semilla('clients', [{ id: CLIENTE, name: 'C', slug: 'c-de-practica', config: {}, brand_colors: [{ hex: '#112233' }], brand_fonts: ['Bebas Neue'] }])
    .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
    .semilla('client_social_images', [])
    .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: parteCon(BRIEF_CARRUSEL) }])
    .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['carrusel_mesa'], clientes_ensayo: [] }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'carrusel_mesa', familia: 'carrusel_mesa', pasos: CARRUSEL_MESA.pasos, indicaciones: CARRUSEL_MESA.indicaciones, limites: CARRUSEL_MESA.limites, activo: true }])
    .semilla('oficina_directorio', DIRECTORIO as never)
    .semilla('oficina_mesa_aportes', [])
    .semilla('hitl_queue', [{ id: HITL, type: 'content_piece_review', status: 'pending', client_id: CLIENTE, metadata: {} }])
    .semilla('oficina_encargos', [
      { ...base, id: '11111111-1111-4111-8111-111111111111', version_encargo: 1, estado: 'fallido', gasto_usd: 0, dry_run: true, sala_ref: {} },
      { ...base, id: '11111111-1111-4111-8111-222222222222', version_encargo: 2, estado: 'cerrado', gasto_usd: 0, dry_run: true, sala_ref: { reapertura: { desde_version: 1 } } },
      { ...base, id: REAL, version_encargo: 3, estado: opc.estadoReal ?? 'cerrado', gasto_usd: 1.690998, dry_run: false, hitl_queue_id: HITL, sala_ref: { _journey_id: null, _sala_correlation_id: null } },
      ...(opc.rondas ?? []).map((r, i) => ({ ...base, id: `4444444${i}-4444-4444-8444-444444444444`, version_encargo: 10 + i, estado: 'cerrado', gasto_usd: 1, dry_run: false, sala_ref: { cambios_del_dueno: { ronda: r } } })),
    ])
}
const puertos = (db: DbFalsa) => crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch)
const pedido = { hitl_id: HITL, comentario: 'La lámina 2 tiene demasiado texto y el titular suena muy formal', laminas: [2], reviewer: 'emilio' }

describe('pedir cambios sobre una pieza de la mesa (BRF-0002)', () => {
  it('reabre la mesa en la versión 4, cuenta como ronda 1 de 5 y NO toca la pieza vieja ni los ensayos', async () => {
    const db = mundo()
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'esperar', ronda: 1, rondas_restantes: MAX_RONDAS_DE_CAMBIOS - 1 })
    const nuevo = db.tablas['oficina_encargos'].find((e) => e.version_encargo === 4)!
    expect(nuevo).toMatchObject({ dry_run: false, brief_id: 'BRF-0100', tipo_de_grupo: 'carrusel_mesa' })
    expect(nuevo.sala_ref).toMatchObject({ cambios_del_dueno: { ronda: 1, laminas: [2], desde_hitl: HITL } })
    expect(db.tablas['oficina_encargos'].find((e) => e.id === REAL)).toMatchObject({ estado: 'cerrado', version_encargo: 3 })
    expect(db.tablas['oficina_encargos'].filter((e) => e.dry_run === true).map((e) => e.estado).sort()).toEqual(['cerrado', 'fallido'])
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'edited', reviewer: 'emilio', decision: { pidio_cambios: true, ronda: 1, laminas: [2] } })
  })
  it('el comentario y la lámina marcada llegan a la tarea de la dirección creativa, el primer turno de la mesa', async () => {
    const db = mundo()
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(200)
    const turno = r.cuerpo.turno as { paso: string; pedido: { task: string } }
    expect(turno.paso).toBe('mesa:dirigir:creative-director-mesa') // la mesa arranca por la dirección creativa, que ya recibe lo que pidió el dueño
    expect(turno.pedido.task).toContain('CAMBIOS QUE PIDE EL DUEÑO (ronda 1 de 5)')
    expect(turno.pedido.task).toContain('La lámina 2 tiene demasiado texto')
    expect(turno.pedido.task).toContain('Láminas que marcó: 2')
  })
  it('no gasta el tope de versiones: tras 4 rondas (versiones 10..13) la quinta se acepta y la sexta se rechaza, siempre con límite de 5 rondas', async () => {
    const quinta = mundo({ rondas: [1, 2, 3, 4] })
    expect((await pedirCambios(quinta as never, puertos(quinta), pedido)).status).toBe(200)
    const sexta = mundo({ rondas: [1, 2, 3, 4, 5] })
    const r = await pedirCambios(sexta as never, puertos(sexta), pedido)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'limite_de_rondas', maximo: MAX_RONDAS_DE_CAMBIOS })
  })
  it('una mesa todavía viva no se reabre: la pieza sigue pendiente', async () => {
    const db = mundo({ estadoReal: 'en_paso' })
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(409)
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'pending' })
  })
  it('si la mesa muere AL ABRIR (sin dirección creativa), la pieza VUELVE a la bandeja, la ronda no se quema y se puede pedir otra vez cuando se arregle', async () => {
    const db = mundo()
    const guardado = db.tablas['oficina_directorio']
    db.tablas['oficina_directorio'] = guardado.filter((t) => t.rol !== 'direccion')
    const r = await pedirCambios(db as never, puertos(db), pedido)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'no_se_pudo_abrir_la_version_siguiente' })
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'pending', reviewer: null })
    expect(db.tablas['oficina_encargos'].find((e) => e.version_encargo === 4)).toMatchObject({ estado: 'fallido' })
    db.tablas['oficina_directorio'] = guardado // la causa se arregla
    const otra = await pedirCambios(db as never, puertos(db), pedido)
    expect(otra.status).toBe(200)
    expect(otra.cuerpo).toMatchObject({ accion: 'esperar', ronda: 1, rondas_restantes: MAX_RONDAS_DE_CAMBIOS - 1 }) // el intento fallido no gastó la ronda 1
    expect(db.tablas['oficina_encargos'].find((e) => e.version_encargo === 5)).toMatchObject({ dry_run: false, estado: 'en_paso' })
  })
  it('solo es un intento fallido «gratis» el que cerró fallido SIN gastar y llevando cambios del dueño; si gastó, cuenta como ronda', () => {
    const c = { cambios_del_dueno: { ronda: 1 } }
    expect(esIntentoFallidoDeCambios({ estado: 'fallido', gasto_usd: 0, sala_ref: c })).toBe(true)
    expect(esIntentoFallidoDeCambios({ estado: 'fallido', gasto_usd: '0.000000', sala_ref: c })).toBe(true)
    expect(esIntentoFallidoDeCambios({ estado: 'fallido', gasto_usd: 0.4, sala_ref: c })).toBe(false)
    expect(esIntentoFallidoDeCambios({ estado: 'cerrado', gasto_usd: 0, sala_ref: c })).toBe(false)
    expect(esIntentoFallidoDeCambios({ estado: 'fallido', gasto_usd: 0, sala_ref: {} })).toBe(false)
  })
})
