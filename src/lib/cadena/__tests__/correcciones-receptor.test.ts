/**
 * 17-nov · cambio 4 · entrega 2 · EL RECEPTOR de las correcciones de la jefatura (núcleo · US$ 0, sin red).
 * Mide: la llegada (autorizada, validada, idempotente por llave) · la respuesta del creador (línea fija, no_dicha si no se lee, la dura no se cierra con «no tomada»)
 * · el reparto de la vigía (sin creador queda visible y sin gastar intentos, una sola mesa aunque corran dos vigías, plazo vencido, tope de intentos).
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { ACCIONES } from '../acciones'
import { bloqueaLaPieza, destinoFinal, guardarRespuesta, textoDeLaAlarma, INTENTOS_POR_CORRECCION, leerRespuestaDelCreador, marcoDeLaCorreccion, PLAZO_DEL_CREADOR_MIN, repartirCorrecciones, type CreadorDeCorreccion } from '../correcciones'
import type { Campana } from '../almacen'

const AHORA = '2026-11-17T21:00:00.000Z'
const mas = (min: number) => new Date(Date.parse(AHORA) + min * 60_000).toISOString()
const CAMPANA = { id: 'cmp-1', client_id: 'cli-1', estado: 'activa' } as unknown as Campana
function almacen() {
  const al = new AlmacenMemoria({ config: { flujos: ['wf-cadena'] } })
  al.campanas.push(CAMPANA)
  // filas del calendario vigente: con idea del banco, pieza fija y sin idea (el reparto de la hoja y del banco las lee)
  const f = (id: string, extra: Record<string, unknown>) => ({ id, campana_id: 'cmp-1', calendario_version: 1, estado: 'en_oficina', fecha: '2026-11-20', avisos: [], idea_ref: null, pieza_fija: null, ...extra }) as unknown as AlmacenMemoria['filasGuardadas'][number]
  al.filasGuardadas.push(f('f-7', { idea_ref: 'C1-I01' }), f('f-8', { idea_ref: 'C1-I02' }), f('f-fija', { pieza_fija: 'texto fijo de la fila' }), f('f-sin', {}))
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
  it('🔴 sin creador para el destino (banco sin el puerto de CC1): queda recibida y visible, SIN gastar intentos', async () => {
    const al = await conUna({ destino: 'banco' })
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

describe('5 · la hoja va al insumo de donde salió la línea (RESPUESTA-LENOVO 4 · CC3 + CC4 · b con campo_de_la_hoja)', () => {
  it('🔴 el reparto por campo, puro', () => {
    const conIdea = { idea_ref: 'C1-I01', pieza_fija: null }, fija = { idea_ref: 'C1-I01', pieza_fija: 'x' }, sinIdea = { idea_ref: null, pieza_fija: null }
    for (const campo of ['DATOS DEL CALENDARIO', '- LLAMADO A LA ACCIÓN:', 'oferta', 'OBJETIVO', 'PÚBLICO']) expect(destinoFinal('hoja', campo, conIdea).destino, campo).toBe('calendario')
    for (const campo of ['IDEA DEL BANCO', 'MENSAJE (uno)', 'GANCHO SUGERIDO', 'PROTAGONISTA', 'LO DECIDIDO', 'FIJO · mensaje']) {
      expect(destinoFinal('hoja', campo, conIdea).destino, campo).toBe('banco')
      expect(destinoFinal('hoja', campo, fija).destino, `${campo} fija`).toBe('calendario')
      expect(destinoFinal('hoja', campo, sinIdea).destino, `${campo} sin idea`).toBe('pieza')
      expect(destinoFinal('hoja', campo, null).destino, `${campo} sin fila`).toBe('pieza')
    }
    for (const campo of [null, '', 'TONO', 'BRIEF DE CAMPAÑA', 'VOCABULARIO DE LA MARCA']) expect(destinoFinal('hoja', campo, conIdea).destino, String(campo)).toBe('pieza')
    // «banco» pedido directo cumple la MISMA condición de la idea (CC1)
    expect(destinoFinal('banco', null, conIdea).destino).toBe('banco')
    expect(destinoFinal('banco', null, fija).destino).toBe('calendario')
    expect(destinoFinal('banco', null, sinIdea).destino).toBe('pieza')
    expect(destinoFinal('calendario', 'IDEA DEL BANCO', conIdea).destino).toBe('calendario')
  })
  it('🔴 por la ruta: hoja + campo de la idea → se guarda como banco con su idea; la llave conserva «hoja»; a la pieza no se guarda y lo dice', async () => {
    const al = almacen()
    const r = await recibir(al, pedido({ destino: 'hoja', campo_de_la_hoja: 'MENSAJE (uno)' }))
    expect(r.status).toBe(201)
    expect(al.correcciones[0]).toMatchObject({ llave: 'f-7:hoja', destino: 'banco', destino_pedido: 'hoja', idea_id: 'C1-I01', campo_de_la_hoja: 'MENSAJE (uno)' })
    const p = await recibir(al, pedido({ fila_id: 'f-sin', destino: 'hoja', campo_de_la_hoja: 'MENSAJE (uno)' }))
    expect(p.status).toBe(200)
    expect(p.cuerpo).toMatchObject({ va_a: 'pieza', llave: 'f-sin:hoja' })
    expect(al.correcciones).toHaveLength(1)
    const fija = await recibir(al, pedido({ fila_id: 'f-fija', destino: 'banco' }))
    expect(fija.status).toBe(201)
    expect(al.correcciones[1]).toMatchObject({ llave: 'f-fija:banco', destino: 'calendario', idea_id: null })
  })
})

describe('6 · regla dura sin tomar: FRENA y deja UNA alarma (RESPUESTA-LENOVO 3)', () => {
  const NO = 'RESPUESTA A LA JEFATURA C1: no tomada: no me parece'
  async function cerrarDura(al: AlmacenMemoria) {
    await recibir(al, pedido({ dura: true }))
    await repartirCorrecciones(al, AHORA, { calendario: abre })
    await guardarRespuesta(al, 'f-7:calendario', leerRespuestaDelCreador(NO, true), mas(5))
    await repartirCorrecciones(al, mas(6), { calendario: abre })
    await guardarRespuesta(al, 'f-7:calendario', leerRespuestaDelCreador(NO, true), mas(7))
  }
  it('🔴 una alarma, con la fila, la campaña y el motivo; la vigía no la repite', async () => {
    const al = almacen()
    await cerrarDura(al)
    expect(al.alarmasEnviadas).toHaveLength(1)
    expect(al.alarmasEnviadas[0]).toContain('fila f-7')
    expect(al.alarmasEnviadas[0]).toContain('NO se publica')
    expect(al.alarmasEnviadas[0]).toContain('la oferta está cerrada ese día')
    expect(al.correcciones[0].alarma_en).toBe(mas(7))
    await repartirCorrecciones(al, mas(60), { calendario: abre })
    await guardarRespuesta(al, 'f-7:calendario', { respuesta: 'no_dicha', explicacion: null }, mas(61))
    expect(al.alarmasEnviadas).toHaveLength(1)
  })
  it('🔴 si Slack no confirma, la alarma queda pendiente y la vigía la reintenta: sale UNA vez', async () => {
    const al = almacen()
    al.falloDeAviso = 'slack caído'
    await cerrarDura(al)
    expect(al.alarmasEnviadas).toHaveLength(0)
    expect(al.correcciones[0].alarma_en).toBeNull()
    al.falloDeAviso = null
    await repartirCorrecciones(al, mas(30), { calendario: abre })
    await repartirCorrecciones(al, mas(31), { calendario: abre })
    expect(al.alarmasEnviadas).toHaveLength(1)
  })
  it('🔴 una de criterio no tomada, o una dura TOMADA: ninguna alarma', async () => {
    const a = almacen()
    await recibir(a, pedido({ dura: false }))
    await repartirCorrecciones(a, AHORA, { calendario: abre })
    await guardarRespuesta(a, 'f-7:calendario', leerRespuestaDelCreador(NO, false), mas(5))
    const b = almacen()
    await recibir(b, pedido({ dura: true }))
    await repartirCorrecciones(b, AHORA, { calendario: abre })
    await guardarRespuesta(b, 'f-7:calendario', leerRespuestaDelCreador('RESPUESTA A LA JEFATURA C1: tomada', true), mas(5))
    expect([...a.alarmasEnviadas, ...b.alarmasEnviadas]).toEqual([])
  })
  it('el texto de la alarma', () => {
    expect(textoDeLaAlarma({ fila_id: 'f', campana_id: 'c', destino: 'banco', motivo: 'm', linea_de_la_ficha: null, explicacion: null })).toContain('⛔ Regla dura sin tomar · la pieza de la fila f (campaña c) NO se publica.')
  })
})
