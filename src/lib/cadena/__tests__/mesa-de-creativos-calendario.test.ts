/**
 * LA MESA DE CREATIVOS EN EL CALENDARIO · el lado de la CADENA (31-oct · diseño v2 + revisión CC#3 v2). US$ 0: sin modelo, sin red, sin base.
 * Se fija: nace APAGADA (la cadena es la de siempre); con la palanca, el calendario va en dos tramos con plazo propio de 45 min fuera del vigía de las corridas; si la mesa falla, vence o cierra vacía el calendario se
 * ordena IGUAL sin ideas; `idea_de_mesa` es un campo requerido-pero-vacío FUERA de `datos[]` que nunca bloquea; el contrato v1 viejo se sigue leyendo; la corrección no reabre la mesa.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar } from '../index'
import { ESQUEMAS, ESQUEMA_CALENDARIO_TANDA, ESQUEMA_CALENDARIO_TANDA_V2 } from '../esquemas'
import { CONTRATO_CON_MESA, CONTRATO_SIN_MESA, PLAZO_DE_LA_MESA_MIN, entregarIdeasDeLaMesa, ideasQueSacaronFilas, mesaEncendida, plazoDeLaMesa, proporcionConIdea, siguienteDeLaMesa } from '../mesa-de-creativos'
import { PLAZO_DE_LLAMADA_POR_DEFECTO_MIN } from '../constantes'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'
import type { MesaDeCalendario } from '../almacen'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })
const minutos = (m: number) => new Date(new Date(AHORA).getTime() + m * 60_000).toISOString()

async function montar(o: { palanca?: unknown } = {}) {
  const config: Record<string, unknown> = { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' }
  if (o.palanca !== undefined) config.mesa_de_creativos = o.palanca
  const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }] })
  const c = await abrirCampana(al, { ...wf, client_id: A.clientId, seco: true }, AHORA)
  const id = (c.cuerpo.campana as { id: string }).id
  const pe = await estrategiaPreparar(al, { ...wf, campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf, campana_id: id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
  return { al, id }
}
const preparar = (al: AlmacenMemoria, id: string, ahora = AHORA, extra: Record<string, unknown> = {}) => calendarioPreparar(al, { ...wf, campana_id: id, tanda: 1, ...extra }, ahora)
const conIdeas = (n = 'A7') => ({ ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => ({ ...p, idea_de_mesa: n })) })

const mesaBase = (o: Partial<MesaDeCalendario> = {}): MesaDeCalendario => ({ id: 1, campana_id: 'c', tanda: 1, version: 1, estado: 'abierta', encargo_id: null, texto: null, costo_usd: null, motivo: null, plazo_en: minutos(45), ideas_que_sacaron_filas: [], seco: true, ...o })

describe('la palanca (nace APAGADA)', () => {
  it('solo está encendida si la clave es { clientes: [...] } y el cliente está en la lista', async () => {
    const con = async (v: unknown) => mesaEncendida(new AlmacenMemoria({ config: v === undefined ? {} : { mesa_de_creativos: v } }), 'cliente-1')
    expect(await con(undefined)).toBe(false)
    expect(await con(null)).toBe(false)
    expect(await con(true)).toBe(false)
    expect(await con(['cliente-1'])).toBe(false)
    expect(await con({})).toBe(false)
    expect(await con({ clientes: [] })).toBe(false)
    expect(await con({ clientes: 'cliente-1' })).toBe(false)
    expect(await con({ clientes: ['otro'] })).toBe(false)
    expect(await con({ clientes: ['otro', 'cliente-1'] })).toBe(true)
  })

  it('apagada: el calendario es el de siempre (contrato v1, esquema sin idea_de_mesa, sin ninguna mención a la mesa, ninguna fila de mesa)', async () => {
    for (const palanca of [undefined, { clientes: [] }, { clientes: ['otro'] }]) {
      const { al, id } = await montar({ palanca })
      const p = await preparar(al, id)
      expect(p.status).toBe(200)
      expect(p.cuerpo.accion).toBeUndefined()
      expect(p.cuerpo.con_mesa).toBeUndefined()
      const run = p.cuerpo.run_sdk as { task: string; output_schema: unknown; extra: { contrato: string } }
      expect(run.extra.contrato).toBe(CONTRATO_SIN_MESA)
      expect(run.output_schema).toEqual(ESQUEMA_CALENDARIO_TANDA)
      expect(JSON.stringify(run.output_schema)).not.toContain('idea_de_mesa')
      expect(run.task).not.toMatch(/mesa/i)
      expect(al.mesas).toHaveLength(0)
    }
  })
})

describe('tramo A · se abre la mesa', () => {
  it('encendida: la primera llamada abre la mesa (NO una corrida), con plazo de 45 min y el marco de la tanda', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    const p = await preparar(al, id)
    expect(p.status).toBe(200)
    expect(p.cuerpo.accion).toBe('abrir_mesa')
    expect(p.cuerpo.run_sdk).toBeUndefined()
    expect(p.cuerpo.plazo_en).toBe(minutos(PLAZO_DE_LA_MESA_MIN))
    expect(PLAZO_DE_LA_MESA_MIN).toBe(45)
    const mesa = p.cuerpo.mesa as { client_id: string; campana_id: string; tanda: number; version: number; dry_run: boolean; marco_texto: string }
    expect(mesa).toMatchObject({ client_id: A.clientId, campana_id: id, tanda: 1, version: 1, dry_run: true })
    expect(mesa.marco_texto).toContain('# Tanda 1 del calendario')
    expect(mesa.marco_texto).toContain('## Huecos de la tanda')
    expect(mesa.marco_texto).toMatch(/s1-d\d-/)
    expect(mesa.marco_texto).toContain('## Plan de marketing')
    // una fila de mesa abierta y NINGUNA corrida del calendario: el vigía de las corridas no tiene nada que marcar vencido
    expect(al.mesas).toHaveLength(1)
    expect(al.mesas[0]).toMatchObject({ estado: 'abierta', plazo_en: minutos(45), seco: true })
    expect((await al.corridasDeCampana(id)).filter((c) => c.paso === 'calendario')).toHaveLength(0)
    expect(await al.corridasEnCurso()).toHaveLength(0)
  })

  it('el marco no lleva datos con valor inventados y sí los huecos con su fecha y los temas ya usados', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    const p = await preparar(al, id)
    const marco = (p.cuerpo.mesa as { marco_texto: string }).marco_texto
    expect(marco).toMatch(/- s1-d\d-\w+ · semana 1 · \w+ 2026-\d\d-\d\d \d\d:\d\d · /)
    expect(marco).toContain('(es la primera tanda)')
  })

  it('una segunda llamada mientras el equipo trabaja ESPERA (no abre otra mesa ni otra corrida)', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    for (const dentro of [1, 20, 44]) {
      const e = await preparar(al, id, minutos(dentro))
      expect(e.cuerpo).toMatchObject({ accion: 'esperar_mesa', plazo_en: minutos(45) })
    }
    expect(al.mesas).toHaveLength(1)
    expect(await al.corridasEnCurso()).toHaveLength(0)
  })
})

describe('tramo B · se ordena con las ideas (o sin ellas)', () => {
  const TEXTO = '## s1-d1-a · semana 1\nIdea elegida: el cangrejo de la isla\n## Citas\nA3 usé: la serie del cangrejo'

  it('mesa lista: la tarea lleva las ideas como DATO, el contrato es v2 y la corrida vuelve al plazo de 6 min', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    const e = await entregarIdeasDeLaMesa(al, { campana_id: id, tanda: 1, version: 1, encargo_id: 'enc-1', texto: TEXTO, costo_usd: 1.23456, motivo: null })
    expect(e).toEqual({ ok: true, estado: 'lista', ya_cerrada: false })
    const p = await preparar(al, id, minutos(10))
    expect(p.cuerpo.accion).toBeUndefined()
    expect(p.cuerpo.con_mesa).toBe(true)
    const run = p.cuerpo.run_sdk as { task: string; output_schema: { properties: { piezas: { items: { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> } } } }; extra: { contrato: string } }
    expect(run.extra.contrato).toBe(CONTRATO_CON_MESA)
    expect(run.task).toContain('# IDEAS DE LA MESA')
    expect(run.task).toContain('DATO de trabajo')
    expect(run.task).toContain(TEXTO)
    expect(run.task).toContain('anota la referencia')
    // el campo está en el esquema, requerido (el helper `objeto()` hace todo obligatorio) y FUERA de `datos[]`
    const item = run.output_schema.properties.piezas.items
    expect(item.required).toContain('idea_de_mesa')
    expect(item.additionalProperties).toBe(false)
    expect(JSON.stringify((item.properties.datos as { items: unknown }).items)).not.toContain('idea_de_mesa')
    // la corrida es la de siempre: plazo de 6 min
    expect(p.cuerpo.plazo_en).toBe(minutos(10 + PLAZO_DE_LLAMADA_POR_DEFECTO_MIN))
    expect(al.mesas[0]).toMatchObject({ estado: 'lista', texto: TEXTO, costo_usd: 1.2346, encargo_id: 'enc-1' })
  })

  it('mesa venció sin entregar: se cierra «sin mesa» y el calendario se ordena IGUAL sin ideas (la campaña nunca se queda sin calendario)', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    const p = await preparar(al, id, minutos(46))
    expect(p.status).toBe(200)
    expect(p.cuerpo.con_mesa).toBe(false)
    const run = p.cuerpo.run_sdk as { task: string; extra: { contrato: string } }
    expect(run.extra.contrato).toBe(CONTRATO_CON_MESA)
    expect(run.task).not.toContain('# IDEAS DE LA MESA')
    expect(run.task).toContain('la mesa no entregó ideas')
    expect(al.mesas[0]).toMatchObject({ estado: 'sin_mesa', motivo: 'la mesa venció su plazo' })
    expect((await al.corridasEnCurso()).length).toBe(1)
  })

  it('justo en el plazo (45 min) la mesa YA venció; un minuto antes todavía trabaja', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    expect((await preparar(al, id, minutos(44))).cuerpo.accion).toBe('esperar_mesa')
    expect((await preparar(al, id, minutos(45))).cuerpo.accion).toBeUndefined()
  })

  it('la mesa que falla o cierra vacía deja la campaña ordenando sin ideas, con su motivo', async () => {
    for (const [texto, motivo] of [[null, 'fallo: el directorio no tiene dirección'], ['   ', null]] as Array<[string | null, string | null]>) {
      const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
      await preparar(al, id)
      const e = await entregarIdeasDeLaMesa(al, { campana_id: id, tanda: 1, version: 1, encargo_id: 'enc-x', texto, costo_usd: 0.2, motivo })
      expect(e).toEqual({ ok: true, estado: 'sin_mesa', ya_cerrada: false })
      expect(al.mesas[0].motivo).toBe(motivo ?? 'la mesa cerró sin ideas')
      const p = await preparar(al, id, minutos(5))
      expect(p.cuerpo.con_mesa).toBe(false)
      expect((p.cuerpo.run_sdk as { task: string }).task).not.toContain('# IDEAS DE LA MESA')
    }
  })

  it('la PRIMERA entrega que cierra gana: una entrega tardía o repetida no cambia la fila ni las ideas', async () => {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    await preparar(al, id, minutos(46)) // venció → sin_mesa
    const tarde = await entregarIdeasDeLaMesa(al, { campana_id: id, tanda: 1, version: 1, encargo_id: 'enc-1', texto: 'ideas tardías', costo_usd: 1, motivo: null })
    expect(tarde).toEqual({ ok: true, estado: 'sin_mesa', ya_cerrada: true })
    expect(al.mesas[0].texto).toBeNull()
    const { al: al2, id: id2 } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al2, id2)
    await entregarIdeasDeLaMesa(al2, { campana_id: id2, tanda: 1, version: 1, encargo_id: 'enc-1', texto: 'primera', costo_usd: 1, motivo: null })
    const repetida = await entregarIdeasDeLaMesa(al2, { campana_id: id2, tanda: 1, version: 1, encargo_id: 'enc-1', texto: 'segunda', costo_usd: 9, motivo: null })
    expect(repetida).toEqual({ ok: true, estado: 'lista', ya_cerrada: true })
    expect(al2.mesas[0]).toMatchObject({ texto: 'primera', costo_usd: 1 })
    expect(await entregarIdeasDeLaMesa(al2, { campana_id: 'no-existe', tanda: 1, version: 1, encargo_id: 'e', texto: 'x', costo_usd: 0, motivo: null })).toMatchObject({ ok: false })
  })

  it('la CORRECCIÓN no reabre la mesa: sin mesa previa se corrige sin ideas (y no crea fila); con la mesa lista conserva sus ideas', async () => {
    const corr = { fichas: [], fila_ids: [], modo: 'tanda' }
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    const p = await preparar(al, id, AHORA, { correccion: corr })
    expect(p.cuerpo.accion).toBeUndefined()
    expect(p.cuerpo.con_mesa).toBe(false)
    expect(al.mesas).toHaveLength(0)
    const { al: al2, id: id2 } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al2, id2)
    await entregarIdeasDeLaMesa(al2, { campana_id: id2, tanda: 1, version: 1, encargo_id: 'e', texto: TEXTO, costo_usd: 1, motivo: null })
    const p2 = await preparar(al2, id2, minutos(3), { correccion: corr })
    expect(p2.cuerpo.con_mesa).toBe(true)
    expect((p2.cuerpo.run_sdk as { task: string }).task).toContain(TEXTO)
    expect((p2.cuerpo.run_sdk as { task: string }).task).toContain('CORRECCIÓN')
  })
})

describe('guardar · idea_de_mesa fuera de datos[] y el contrato v1 viejo', () => {
  async function conMesaLista() {
    const { al, id } = await montar({ palanca: { clientes: [A.clientId] } })
    await preparar(al, id)
    await entregarIdeasDeLaMesa(al, { campana_id: id, tanda: 1, version: 1, encargo_id: 'e', texto: 'ideas', costo_usd: 1, motivo: null })
    const p = await preparar(al, id, minutos(2))
    return { al, id, corrida: p.cuerpo.corrida_id }
  }

  it('citar una idea NO dispara V22 ni bloquea: la tanda se valida y la campaña pasa a activa; la respuesta cuenta cuántas piezas traen idea (métrica, no regla)', async () => {
    const { al, id, corrida } = await conMesaLista()
    const g = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: corrida, resultado: ok(conIdeas('A7')) }, minutos(3))
    expect(g.cuerpo.correccion).toBeUndefined()
    expect(g.cuerpo.necesita_humano).toBeUndefined()
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('activa')
    const piezas = tandaBuena(A).piezas.length
    expect(g.cuerpo.mesa).toMatchObject({ estado: 'lista', piezas, con_idea: piezas, ideas_que_sacaron_filas: 0 })
    // el campo no viaja a las filas guardadas
    for (const f of await al.filas(id)) expect(JSON.stringify(f)).not.toContain('A7')
  })

  it('la tanda con el contrato v1 de siempre (sin idea_de_mesa) se sigue leyendo y se guarda igual', async () => {
    const { al, id, corrida } = await conMesaLista()
    const g = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: corrida, resultado: ok(tandaBuena(A)) }, minutos(3))
    expect(g.cuerpo.correccion).toBeUndefined()
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('activa')
    expect(g.cuerpo.mesa).toMatchObject({ con_idea: 0 })
  })

  it('R9 · una idea cuya fila sale por dato sin fuente queda ANOTADA en la mesa y contada en la respuesta (la métrica no existe si se quita el registro)', async () => {
    const { al, id, corrida } = await conMesaLista()
    const dato = [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'no-existe', nivel: 'F1', opcional: false }]
    const mala = { ...conIdeas('A7'), piezas: conIdeas('A7').piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: dato } : p)) }
    const g = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: corrida, resultado: ok(mala) }, minutos(3))
    expect(g.cuerpo.correccion).toBe(true)
    const p2 = await calendarioPreparar(al, { ...wf, campana_id: id, tanda: 1, correccion: { fichas: g.cuerpo.fichas, fila_ids: g.cuerpo.fila_ids, modo: 'filas' } }, minutos(4))
    const soloMala = { piezas: [{ ...piezaBuena(A, 1, 'a', 'Nuestro pan de 45 g'), datos: dato, idea_de_mesa: 'A9' }], ajustes_al_patron: [] }
    const g2 = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok(soloMala) }, minutos(5))
    expect(g2.cuerpo).toMatchObject({ salieron_sin_fuente: ['s1-d1-a'] })
    expect((g2.cuerpo.mesa as { ideas_que_sacaron_filas: number }).ideas_que_sacaron_filas).toBe(1)
    expect(al.mesas[0].ideas_que_sacaron_filas).toEqual([expect.objectContaining({ idea: 'A9', fila_id: 's1-d1-a' })])
  })

  it('una entrega REPETIDA a la mesa ya cerrada es inocua: no cambia texto, costo, estado ni encargo (la guarda está en el almacén)', async () => {
    const { al, id } = await conMesaLista()
    const antes = JSON.stringify(al.mesas[0])
    for (const texto of ['otra', null]) {
      const r = await entregarIdeasDeLaMesa(al, { campana_id: id, tanda: 1, version: 1, encargo_id: 'otro', texto, costo_usd: 7, motivo: 'fallo: x' })
      expect(r).toEqual({ ok: true, estado: 'lista', ya_cerrada: true })
    }
    expect(JSON.stringify(al.mesas[0])).toBe(antes)
    expect(await al.cerrarMesaDeCalendario(al.mesas[0].id, { estado: 'sin_mesa', encargo_id: 'z', texto: null, costo_usd: 0, motivo: 'm' })).toBe(false)
  })

  it('sin mesa (palanca apagada) la respuesta de guardar es la de siempre: sin bloque «mesa»', async () => {
    const { al, id } = await montar()
    const p = await preparar(al, id)
    const g = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
    expect(g.cuerpo.mesa).toBeUndefined()
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('activa')
  })
})

describe('esquemas y piezas puras', () => {
  it('el esquema v1 NO cambia y el v2 es el mismo más idea_de_mesa en cada pieza; ambos están registrados y son válidos para salida estructurada', () => {
    const itemV1 = (ESQUEMA_CALENDARIO_TANDA as unknown as { properties: { piezas: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.piezas.items
    const itemV2 = (ESQUEMA_CALENDARIO_TANDA_V2 as unknown as { properties: { piezas: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.piezas.items
    expect(Object.keys(itemV1.properties)).not.toContain('idea_de_mesa')
    expect(Object.keys(itemV2.properties).filter((k) => k !== 'idea_de_mesa')).toEqual(Object.keys(itemV1.properties))
    expect(itemV2.required).toEqual([...itemV1.required, 'idea_de_mesa'])
    expect(ESQUEMAS['calendario_tanda.v1']).toBe(ESQUEMA_CALENDARIO_TANDA)
    expect(ESQUEMAS['calendario_tanda.v2']).toBe(ESQUEMA_CALENDARIO_TANDA_V2)
    expect(validarEsquemaDeSalida(ESQUEMA_CALENDARIO_TANDA).ok).toBe(true)
    expect(validarEsquemaDeSalida(ESQUEMA_CALENDARIO_TANDA_V2).ok).toBe(true)
    expect(CONTRATO_SIN_MESA).toBe('calendario_tanda.v1')
    expect(CONTRATO_CON_MESA).toBe('calendario_tanda.v2')
  })

  it('siguienteDeLaMesa: sin fila abre; abierta dentro del plazo espera; vencida ordena sin ideas; lista con texto ordena con ideas; lista vacía y sin_mesa ordenan sin ideas', () => {
    expect(siguienteDeLaMesa(null, AHORA)).toEqual({ accion: 'abrir_mesa' })
    expect(siguienteDeLaMesa(mesaBase(), AHORA)).toEqual({ accion: 'esperar_mesa', plazo_en: minutos(45) })
    expect(siguienteDeLaMesa(mesaBase({ plazo_en: AHORA }), AHORA)).toMatchObject({ accion: 'ordenar', ideas: null })
    expect(siguienteDeLaMesa(mesaBase({ estado: 'lista', texto: ' ideas ' }), AHORA)).toEqual({ accion: 'ordenar', ideas: 'ideas', motivo: null })
    expect(siguienteDeLaMesa(mesaBase({ estado: 'lista', texto: '  ' }), AHORA)).toMatchObject({ accion: 'ordenar', ideas: null })
    expect(siguienteDeLaMesa(mesaBase({ estado: 'sin_mesa', motivo: 'fallo: x' }), AHORA)).toEqual({ accion: 'ordenar', ideas: null, motivo: 'fallo: x' })
    // el tablero que se pega a la tarea no crece sin cota
    const t = siguienteDeLaMesa(mesaBase({ estado: 'lista', texto: 'x'.repeat(50_000) }), AHORA)
    expect(t.accion === 'ordenar' && (t.ideas ?? '').length).toBe(14_000)
  })

  it('el plazo de la mesa son 45 minutos exactos desde ahora', () => {
    expect(plazoDeLaMesa(AHORA)).toBe(minutos(45))
  })

  it('R9 · las ideas cuya fila salió por dato sin fuente quedan anotadas con el chequeo; las piezas sin idea o que no salieron no', () => {
    const piezas = [
      { semana: 1, dia_semana: 1, slot: 'a', idea_de_mesa: 'A3' },
      { semana: 1, dia_semana: 2, slot: 'b', idea_de_mesa: '  ' },
      { semana: 1, dia_semana: 3, slot: 'c', idea_de_mesa: 'A5' },
      { semana: 1, dia_semana: 4, slot: 'd' },
      { semana: 2, dia_semana: 1, slot: 'e', idea_de_mesa: 'A9' },
    ]
    const salen = ['s1-d1-a', 's1-d2-b', 's1-d4-d']
    expect(ideasQueSacaronFilas(piezas, salen, (f) => (f === 's1-d1-a' ? 'V22' : null))).toEqual([{ idea: 'A3', chequeo: 'V22', fila_id: 's1-d1-a' }])
    expect(ideasQueSacaronFilas(piezas, ['s1-d3-c'], () => null)).toEqual([{ idea: 'A5', chequeo: 'dato_sin_fuente', fila_id: 's1-d3-c' }])
    expect(ideasQueSacaronFilas(piezas, [], () => 'V22')).toEqual([])
    expect(proporcionConIdea(piezas)).toEqual({ piezas: 5, con_idea: 3 })
    expect(proporcionConIdea([])).toEqual({ piezas: 0, con_idea: 0 })
  })
})
