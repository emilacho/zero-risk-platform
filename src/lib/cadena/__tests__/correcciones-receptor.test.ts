/**
 * 17-nov · cambio 4 · entrega 2 · EL RECEPTOR de las correcciones de la jefatura (núcleo · US$ 0, sin red).
 * Mide: la llegada (autorizada, validada, idempotente por llave) · la respuesta del creador (línea fija, no_dicha si no se lee, la dura no se cierra con «no tomada»)
 * · el reparto de la vigía (sin creador queda visible y sin gastar intentos, una sola mesa aunque corran dos vigías, plazo vencido, tope de intentos).
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { ACCIONES } from '../acciones'
import { bloqueaLaPieza, guardarRespuesta, INTENTOS_POR_CORRECCION, leerRespuestaDelCreador, marcoDeLaCorreccion, PLAZO_DEL_CREADOR_MIN, repartirCorrecciones, type CreadorDeCorreccion } from '../correcciones'
import type { Campana } from '../almacen'

const AHORA = '2026-11-17T21:00:00.000Z'
const mas = (min: number) => new Date(Date.parse(AHORA) + min * 60_000).toISOString()
const CAMPANA = { id: 'cmp-1', client_id: 'cli-1', estado: 'activa' } as unknown as Campana
function almacen() {
  const al = new AlmacenMemoria({ config: { flujos: ['wf-cadena'] } })
  al.campanas.push(CAMPANA)
  return al
}
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const pedido = (extra: Record<string, unknown> = {}) => ({ ...wf, campana_id: 'cmp-1', fila_id: 'f-7', destino: 'calendario', motivo: 'la oferta está cerrada ese día', linea_de_la_ficha: 'cierre: el brunch se retiró', encargo_id: 'enc-1', dura: true, origen: 'codigo', ...extra })
const recibir = (al: AlmacenMemoria, c: Record<string, unknown>) => ACCIONES.correcciones.recibir(al, c, AHORA)

describe('1 · la llegada', () => {
  it('🔴 recibe: 201, una fila «recibida» con la llave fila_id:destino; repetirla devuelve la misma (200, ya_estaba) y no duplica', async () => {
    const al = almacen()
    const r = await recibir(al, pedido())
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201)
    expect(al.correcciones).toHaveLength(1)
    expect(al.correcciones[0]).toMatchObject({ llave: 'f-7:calendario', estado: 'recibida', dura: true, intentos: 0, campana_id: 'cmp-1' })
    const otra = await recibir(al, pedido({ motivo: 'otro motivo' }))
    expect(otra.status).toBe(200)
    expect(otra.cuerpo.ya_estaba).toBe(true)
    expect(al.correcciones).toHaveLength(1)
    expect(al.correcciones[0].motivo).toBe('la oferta está cerrada ese día')
  })
  it('🔴 sin contexto de flujo o con un flujo ajeno ⇒ 400/403 y nada se guarda', async () => {
    const al = almacen()
    expect((await recibir(al, pedido({ workflow_id: undefined }))).status).toBe(400)
    expect((await recibir(al, pedido({ workflow_id: 'wf-ajeno' }))).status).toBe(403)
    expect(al.correcciones).toHaveLength(0)
  })
  it('🔴 validación: destino «pieza» u otro, sin motivo, sin encargo, dura no booleana, llave que no corresponde, campaña inexistente', async () => {
    const al = almacen()
    for (const [extra, status] of [[{ destino: 'pieza' }, 400], [{ destino: 'brief' }, 400], [{ motivo: '  ' }, 400], [{ encargo_id: null }, 400], [{ dura: 'si' }, 400], [{ llave: 'f-7:banco' }, 400], [{ campana_id: 'no-existe' }, 404]] as const) {
      expect((await recibir(al, pedido(extra as Record<string, unknown>))).status, JSON.stringify(extra)).toBe(status)
    }
    expect(al.correcciones).toHaveLength(0)
    expect((await recibir(al, pedido({ llave: 'f-7:calendario' }))).status).toBe(201)
  })
  it('🔴 la misma fila con OTRO destino es otra corrección', async () => {
    const al = almacen()
    await recibir(al, pedido())
    await recibir(al, pedido({ destino: 'banco' }))
    expect(al.correcciones.map((c) => c.llave).sort()).toEqual(['f-7:banco', 'f-7:calendario'])
  })
  it('la bandeja lee por encargo', async () => {
    const al = almacen()
    await recibir(al, pedido())
    const r = await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'enc-1' }, AHORA)
    expect((r.cuerpo.correcciones as unknown[]).length).toBe(1)
    expect(((await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'otro' }, AHORA)).cuerpo.correcciones as unknown[]).length).toBe(0)
  })
})

describe('3 · la respuesta del creador (una línea fija)', () => {
  const R = 'RESPUESTA A LA JEFATURA C1'
  it('🔴 los tres valores, con su porqué', () => {
    expect(leerRespuestaDelCreador(`bla\n${R}: tomada`, false)).toEqual({ respuesta: 'tomada', explicacion: null })
    expect(leerRespuestaDelCreador(`${R}: tomada en parte: muevo la fecha pero no la red`, false)).toEqual({ respuesta: 'tomada_en_parte', explicacion: 'muevo la fecha pero no la red' })
    expect(leerRespuestaDelCreador(`- **${R}** · no tomada: la ficha es vieja`, false)).toEqual({ respuesta: 'no_tomada', explicacion: 'la ficha es vieja' })
  })
  it('🔴 lo que no se lee es no_dicha (nunca se inventa): sin línea, valor raro, en parte o no tomada SIN porqué, dos respuestas distintas, otro id', () => {
    for (const t of ['', 'tomada', `${R}: quizás`, `${R}: tomada en parte`, `${R}: no tomada:   `, `${R}: tomada\n${R}: no tomada: no`, 'RESPUESTA A LA JEFATURA C2: tomada']) {
      expect(leerRespuestaDelCreador(t, false).respuesta, t).toBe('no_dicha')
    }
    expect(leerRespuestaDelCreador(`${R}: tomada\n${R}: tomada`, false).respuesta).toBe('tomada')
  })
  it('🔴 una DURA no se cierra con «no tomada»: queda no_dicha (con su porqué guardado); tomada o en parte sí valen', () => {
    const r = leerRespuestaDelCreador(`${R}: no tomada: no me parece`, true)
    expect(r.respuesta).toBe('no_dicha')
    expect(r.explicacion).toBe('no me parece')
    expect(leerRespuestaDelCreador(`${R}: tomada en parte: cambio la fecha`, true).respuesta).toBe('tomada_en_parte')
  })
  it('🔴 el marco es insumo, no orden; la dura dice que se toma sí o sí; pide la línea fija', () => {
    const m = marcoDeLaCorreccion({ fila_id: 'f-7', motivo: 'm', linea_de_la_ficha: 'l', dura: false })
    expect(m).toMatch(/insumo, no una orden/)
    expect(m).toContain('«l»')
    expect(m).toContain(`${R}: tomada`)
    expect(marcoDeLaCorreccion({ fila_id: 'f-7', motivo: 'm', linea_de_la_ficha: null, dura: true })).toMatch(/se toma sí o sí/)
  })
})

async function conUna(extra: Record<string, unknown> = {}) {
  const al = almacen()
  await recibir(al, pedido(extra))
  return al
}
const abre: CreadorDeCorreccion = async () => ({ estado: 'entregada' })

describe('2 · el reparto de la vigía', () => {
  it('🔴 sin creador para el destino (hoja hoy · banco sin el puerto): queda recibida y visible, SIN gastar intentos', async () => {
    const al = await conUna({ destino: 'hoja' })
    const r = await repartirCorrecciones(al, AHORA, { calendario: abre })
    expect(r.lineas).toEqual([])
    expect(r.aplicado).toEqual([])
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 0 })
  })
  it('🔴 entrega: en manos del creador, intento 1, una sola vez aunque la vigía corra dos veces', async () => {
    const al = await conUna()
    let llamadas = 0
    const contar: CreadorDeCorreccion = async () => { llamadas++; return { estado: 'entregada' } }
    await repartirCorrecciones(al, AHORA, { calendario: contar })
    await repartirCorrecciones(al, mas(1), { calendario: contar })
    expect(llamadas).toBe(1)
    expect(al.correcciones[0]).toMatchObject({ estado: 'en_manos_del_creador', intentos: 1, entregada_en: AHORA })
  })
  it('🔴 dos vigías a la vez: la escritura condicional deja abrir UNA sola mesa', async () => {
    const al = await conUna()
    let llamadas = 0
    const contar: CreadorDeCorreccion = async () => { llamadas++; return { estado: 'entregada' } }
    await Promise.all([repartirCorrecciones(al, AHORA, { calendario: contar }), repartirCorrecciones(al, AHORA, { calendario: contar })])
    expect(llamadas).toBe(1)
  })
  it('🔴 la mesa no abre: vuelve a recibida y el intento CUENTA; sin creador en ese momento, no cuenta', async () => {
    const al = await conUna()
    await repartirCorrecciones(al, AHORA, { calendario: async () => ({ estado: 'no_abre', motivo: 'la oficina no respondió' }) })
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1, entregada_en: null })
    await repartirCorrecciones(al, AHORA, { calendario: async () => ({ estado: 'sin_creador', motivo: 'apagado' }) })
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1 })
  })
  it('🔴 el creador no responde en el plazo: se reintenta; al agotar los intentos queda respondida no_dicha y visible (no bloquea más)', async () => {
    const al = await conUna()
    await repartirCorrecciones(al, AHORA, { calendario: abre })
    await repartirCorrecciones(al, mas(PLAZO_DEL_CREADOR_MIN - 1), { calendario: abre })
    expect(al.correcciones[0].estado).toBe('en_manos_del_creador')
    await repartirCorrecciones(al, mas(PLAZO_DEL_CREADOR_MIN + 1), { calendario: abre })
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1 })
    await repartirCorrecciones(al, mas(PLAZO_DEL_CREADOR_MIN + 2), { calendario: abre })
    expect(al.correcciones[0]).toMatchObject({ estado: 'en_manos_del_creador', intentos: INTENTOS_POR_CORRECCION })
    await repartirCorrecciones(al, mas(3 * PLAZO_DEL_CREADOR_MIN), { calendario: abre })
    expect(al.correcciones[0]).toMatchObject({ estado: 'respondida', respuesta: 'no_dicha' })
  })
  it('un creador que lanza no tumba la vigía: lo dice y sigue con la siguiente', async () => {
    const al = await conUna()
    await recibir(al, pedido({ fila_id: 'f-8' }))
    let segunda = false
    const r = await repartirCorrecciones(al, AHORA, { calendario: async (_a, c) => { if (c.fila_id === 'f-7') throw new Error('boom'); segunda = true; return { estado: 'entregada' } } })
    expect(r.lineas.join()).toMatch(/boom/)
    expect(segunda).toBe(true)
  })
})

describe('3b · guardar la respuesta', () => {
  async function enManos() { const al = await conUna(); await repartirCorrecciones(al, AHORA, { calendario: abre }); return al }
  it('🔴 tomada / en parte / no tomada cierran «respondida» con su explicación; repetir no cambia nada', async () => {
    const al = await enManos()
    expect(await guardarRespuesta(al, 'f-7:calendario', { respuesta: 'tomada_en_parte', explicacion: 'muevo la fecha' }, mas(5), { fecha: '2026-11-21' })).toEqual({ estado: 'respondida', respuesta: 'tomada_en_parte' })
    expect(al.correcciones[0]).toMatchObject({ estado: 'respondida', respuesta: 'tomada_en_parte', explicacion: 'muevo la fecha', version_nueva: { fecha: '2026-11-21' }, respondida_en: mas(5) })
    const otra = await guardarRespuesta(al, 'f-7:calendario', { respuesta: 'no_tomada', explicacion: 'x' }, mas(6))
    expect(otra?.ya_respondida).toBe(true)
    expect(al.correcciones[0].respuesta).toBe('tomada_en_parte')
  })
  it('🔴 no_dicha con intentos por delante vuelve a recibida (la vigía la reintenta); agotados, cierra no_dicha con el motivo', async () => {
    const al = await enManos()
    expect((await guardarRespuesta(al, 'f-7:calendario', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'sin línea' }, mas(5)))?.estado).toBe('recibida')
    await repartirCorrecciones(al, mas(6), { calendario: abre })
    expect(al.correcciones[0].intentos).toBe(2)
    expect((await guardarRespuesta(al, 'f-7:calendario', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'sin línea otra vez' }, mas(7)))?.estado).toBe('respondida')
    expect(al.correcciones[0]).toMatchObject({ respuesta: 'no_dicha', explicacion: 'sin línea otra vez' })
  })
  it('una llave que no existe ⇒ null (no inventa una corrección)', async () => {
    expect(await guardarRespuesta(almacen(), 'nada:calendario', { respuesta: 'tomada', explicacion: null }, AHORA)).toBeNull()
  })
})

describe('4 · ¿la pieza sigue frenada? (🟡 CC6 punto 5 · la decisión final es de Lenovo)', () => {
  it('🔴 sin responder frena; tomada, en parte y no tomada liberan; una DURA cerrada no_dicha SIGUE frenando; una de criterio no_dicha libera', () => {
    for (const estado of ['recibida', 'en_manos_del_creador'] as const) expect(bloqueaLaPieza({ estado, respuesta: null, dura: false })).toBe(true)
    for (const respuesta of ['tomada', 'tomada_en_parte', 'no_tomada'] as const) {
      expect(bloqueaLaPieza({ estado: 'respondida', respuesta, dura: false })).toBe(false)
      if (respuesta !== 'no_tomada') expect(bloqueaLaPieza({ estado: 'respondida', respuesta, dura: true })).toBe(false)
    }
    expect(bloqueaLaPieza({ estado: 'respondida', respuesta: 'no_dicha', dura: true })).toBe(true)
    expect(bloqueaLaPieza({ estado: 'respondida', respuesta: 'no_dicha', dura: false })).toBe(false)
  })
  it('🔴 de punta a punta: una DURA que el creador no toma dos veces queda cerrada no_dicha y la bandeja la ve frenando', async () => {
    const al = await conUna({ dura: true })
    const R = 'RESPUESTA A LA JEFATURA C1: no tomada: no me parece'
    await repartirCorrecciones(al, AHORA, { calendario: abre })
    await guardarRespuesta(al, 'f-7:calendario', leerRespuestaDelCreador(R, true), mas(5))
    await repartirCorrecciones(al, mas(6), { calendario: abre })
    await guardarRespuesta(al, 'f-7:calendario', leerRespuestaDelCreador(R, true), mas(7))
    const v = (await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'enc-1' }, AHORA)).cuerpo.correcciones as Array<Record<string, unknown>>
    expect(v[0]).toMatchObject({ estado: 'respondida', respuesta: 'no_dicha', bloquea_la_pieza: true })
  })
})
