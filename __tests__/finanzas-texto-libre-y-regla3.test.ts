/**
 * (CC#1 · 16-oct · encargo de Lenovo A1) (1) Texto libre del dueño: con UNA sola pregunta abierta se aplica a ella; con varias, sigue exigiendo «n: …». Una nota libre anterior se recupera.
 * (2) Regla 3 de la firma: los datos MEDIDOS del cerebro y la ficha (moneda, país) cuentan como comprobados; lo derivado y las decisiones del plan, no. US$ 0, todo simulado.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../src/lib/finanzas/calculadora'
import { esMedidoDelCerebro, separarComprobado } from '../src/lib/finanzas/confirmado-por-dueno'
import { esTextoDeRespuesta, preguntarAlDueno, recogerRespuestas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import { cerrar } from '../src/lib/finanzas/conversa/orquestador'
import type { CerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import type { AlmacenDeConversa, EncargoDeConversa, PuertosDeConversa } from '../src/lib/finanzas/conversa/puertos'
import type { Entrada } from '../src/lib/finanzas/tipos'
import { estadoInicial } from '../src/lib/oficina/tipos'

const DUENO = 'U_DUENO', CANAL = 'C0CANAL0001'
const P1 = { clave: 'frecuencia_visita', texto: '¿Cada cuánto vuelve tu cliente habitual?', recomendacion: 'Responde una estimación', supuesto_si_no_responde: 'se supone una visita al mes' }
const P2 = { clave: 'costo_envio', texto: '¿Cuánto cuesta el envío?', recomendacion: 'Responde la cifra', supuesto_si_no_responde: 'se supone cero' }
type Msg = { ts: string; user?: string; bot_id?: string; text: string }

function slackFalso(historial: Msg[] = []) {
  const f = (async (url: string) => {
    const u = new URL(url)
    const metodo = u.pathname.replace('/api/', '')
    const json = (j: unknown) => ({ status: 200, json: async () => j })
    const oldest = Number(u.searchParams.get('oldest') ?? 0)
    if (metodo === 'chat.postMessage') return json({ ok: true, ts: '1700000000.000100', channel: CANAL })
    if (metodo === 'conversations.history') return json({ ok: true, messages: historial.filter((m) => Number(m.ts) > oldest), has_more: false })
    if (metodo === 'conversations.replies') return json({ ok: true, messages: [{ ts: '1700000000.000100', bot_id: 'B', text: 'p' }, ...historial].filter((m) => Number(m.ts) > oldest), has_more: false })
    return json({ ok: false, error: 'unknown_method' })
  }) as unknown as typeof fetch
  return { f, historial }
}
function mundo(preguntas: unknown[]) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 0.4, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: {} }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: preguntas } }
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar() { throw new Error('el buzón no debe tocar el motor') },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return [] },
    async guardarBuzon(c) {
      if (c.slack_canal !== undefined) e.slack_canal = c.slack_canal
      if (c.slack_ts !== undefined) e.slack_ts = c.slack_ts
      if (c.leido_hasta !== undefined) e.leido_hasta = c.leido_hasta
      if (c.semilla !== undefined) e.semilla = structuredClone(c.semilla)
      if (c.artefacto) arts[c.artefacto.tipo] = structuredClone(c.artefacto.contenido)
    },
  }
  return { e, arts, almacen }
}
const cerebro = () => {
  const respuestas: Array<{ tema: string; respuesta: string; mensaje_ref: string }> = []
  const c: CerebroDelDueno = { async registrarPregunta(p) { return { ok: true, estado: 'registrada', pregunta_id: `pid-${p.tema}` } }, async registrarRespuesta(p) { respuestas.push(p); return { ok: true } } }
  return { c, respuestas }
}
const puertos = (m: ReturnType<typeof mundo>, s: ReturnType<typeof slackFalso>, c: CerebroDelDueno): PuertosDelBuzon =>
  ({ almacen: m.almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: DUENO, canal: CANAL, fetch: s.f }), canal: CANAL, cerebro: c, modo: 'envia', ahora: () => new Date(1_700_000_000_000) })
const preguntado = async (preguntas: unknown[], historial: Msg[]) => {
  const m = mundo(preguntas), s = slackFalso(historial), cc = cerebro()
  await preguntarAlDueno(puertos(m, s, cc.c), 'enc-1')
  return { m, s, cc }
}
const dueno = (ts: string, text: string): Msg => ({ ts, user: DUENO, text })

describe('esTextoDeRespuesta · qué puede ser LA respuesta', () => {
  it('sí: dos palabras o una cifra; no: preguntas, acuses y una palabra suelta', () => {
    for (const t of ['el vuelve al menos 1 ves a la semana', 'cada semana', 'una vez al mes', '2 veces', '30']) expect(esTextoDeRespuesta(t), t).toBe(true)
    for (const t of ['', '   ', 'gracias', 'muchas gracias', 'ok', 'de acuerdo', 'listo, dale', '¿y esto para qué es?', 'no entiendo?', 'semana']) expect(esTextoDeRespuesta(t), t).toBe(false)
  })
})

describe('TEXTO LIBRE · una sola pregunta abierta', () => {
  it('se aplica a esa pregunta (valor = su texto literal) y se guarda en el cerebro', async () => {
    const { m, s, cc } = await preguntado([P1], [dueno('1700000100.000100', 'el vuelve al menos 1 ves a la semana')])
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['frecuencia_visita'], texto_libre_aplicado_a: ['frecuencia_visita'], listo_para_siguiente_ronda: true })
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'frecuencia_visita', valor: 'el vuelve al menos 1 ves a la semana', literal: 'el vuelve al menos 1 ves a la semana' }])
    expect(cc.respuestas).toHaveLength(1)
    expect(cc.respuestas[0]).toMatchObject({ tema: 'frecuencia visita', respuesta: 'el vuelve al menos 1 ves a la semana' })
    const reg = m.arts.buzon_respuestas as { respuestas: Array<{ libre?: boolean }>; notas: unknown[] }
    expect(reg.respuestas[0].libre).toBe(true)
    expect(reg.notas).toEqual([])
  })
  it('CASO CONTRARIO: con VARIAS preguntas abiertas sigue siendo nota y se pide el número', async () => {
    const { m, s, cc } = await preguntado([P1, P2], [dueno('1700000100.000100', 'más o menos una vez por semana')])
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: [], aclaracion_necesaria: ['frecuencia_visita', 'costo_envio'], notas: 1 })
    expect(m.e.semilla.respuestas_del_dueno).toBeUndefined()
    expect(cc.respuestas).toHaveLength(0)
  })
  it('CASO CONTRARIO: un acuse, una pregunta o una palabra suelta NO son la respuesta', async () => {
    for (const t of ['gracias', 'muchas gracias', '¿puedes repetir la pregunta?', 'semana']) {
      const { m, s, cc } = await preguntado([P1], [dueno('1700000100.000100', t)])
      const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
      expect(r.cuerpo, t).toMatchObject({ recogido: true, aplicadas: [] })
      expect(m.e.semilla.respuestas_del_dueno, t).toBeUndefined()
    }
  })
  it('CASO CONTRARIO: una cifra ambigua sigue siendo nota aunque haya una sola abierta', async () => {
    const { m, s, cc } = await preguntado([P1], [dueno('1700000100.000100', '1 1.500')])
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ aplicadas: [], notas: 1 })
    expect((m.arts.buzon_respuestas as { notas: Array<{ motivo?: string }> }).notas[0].motivo).toBeTruthy()
  })
  it('con dos preguntas: «1: 5» responde la primera y el texto libre siguiente responde la única que queda abierta', async () => {
    const { m, s, cc } = await preguntado([P1, P2], [dueno('1700000100.000100', '1: 5'), dueno('1700000200.000100', 'unos tres dólares por envío')])
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ aplicadas: ['frecuencia_visita', 'costo_envio'], texto_libre_aplicado_a: ['costo_envio'], listo_para_siguiente_ronda: true })
    expect((m.e.semilla.respuestas_del_dueno ?? []).map((x) => `${x.clave}=${x.literal}`)).toEqual(['frecuencia_visita=1: 5', 'costo_envio=unos tres dólares por envío'])
  })
  it('el texto libre que llega ANTES de «1: 5» no se lleva la pregunta equivocada: con dos abiertas es nota', async () => {
    const { m, s, cc } = await preguntado([P1, P2], [dueno('1700000100.000100', 'unos tres dólares por envío'), dueno('1700000200.000100', '1: 5')])
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ aplicadas: ['frecuencia_visita'] })
    expect((m.arts.buzon_respuestas as { notas: Array<{ literal: string }> }).notas.map((x) => x.literal)).toEqual(['unos tres dólares por envío'])
  })
  it('una nota libre de una recogida ANTERIOR se aplica en la siguiente (sin mensajes nuevos) y no se aplica dos veces', async () => {
    const { m, s, cc } = await preguntado([P1], [])
    // el estado que dejó la versión anterior: la respuesta quedó solo como nota
    const previo = m.arts.buzon_respuestas as Record<string, unknown>
    m.arts.buzon_respuestas = { ...previo, n: 2, notas: [{ ts: '1700000100.000100', literal: 'el vuelve al menos 1 ves a la semana' }] }
    m.e.leido_hasta = '1700000500.000100'
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['frecuencia_visita'], texto_libre_aplicado_a: ['frecuencia_visita'] })
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'frecuencia_visita', valor: 'el vuelve al menos 1 ves a la semana', literal: 'el vuelve al menos 1 ves a la semana' }])
    expect(cc.respuestas).toHaveLength(1)
    expect(cc.respuestas[0].mensaje_ref).toBe(`${CANAL}:1700000100.000100`)
    expect((m.arts.buzon_respuestas as { notas: unknown[] }).notas).toEqual([])
    const otra = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(otra.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    expect(cc.respuestas).toHaveLength(1)
  })
  it('CASO CONTRARIO: una nota libre anterior NO se aplica si hoy hay varias abiertas, y sigue acumulada', async () => {
    const { m, s, cc } = await preguntado([P1, P2], [])
    m.arts.buzon_respuestas = { ...(m.arts.buzon_respuestas as Record<string, unknown>), n: 2, notas: [{ ts: '1700000100.000100', literal: 'una vez por semana' }] }
    const r = await recogerRespuestas(puertos(m, s, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    expect(m.e.semilla.respuestas_del_dueno).toBeUndefined()
    expect(cc.respuestas).toHaveLength(0)
  })
})

describe('REGLA 3 · lo medido del cerebro y la ficha', () => {
  const dato = (clave: string, valor: unknown, extra: Record<string, unknown> = {}) => ({ clave, valor, procedencia: 'cerebro', estado: 'trajo', identidad: 'coincide', ...extra })
  const DATOS = [
    dato('metrica:pv:ticket_promedio:ultimos_30_dias', 10.87),
    dato('metrica:pv:tickets:ultimos_30_dias', 460),
    dato('metrica:pv:dias_y_horas:ultimos_30_dias', 'Días con más tickets en los últimos 30 días: sábado (163 tickets), domingo (156 tickets), viernes (73 tickets). Horas con más tickets (hora local): 13:00 (79 tickets), 10:00 (74 tickets), 12:00 (60 tickets).'),
    dato('metrica:pv:items:ultimos_30_dias', 'Los 10 ítems que más ingreso dejaron en los últimos 30 días: Plato estrella con guarnición: 410 u., 1435,00 · Plato chico: 192 u., 576,00'),
  ]
  const FICHA = { moneda: 'USD', pais: 'Ecuador' }
  const medido = (l: string, datos = DATOS, base: number | null = 107.33) => esMedidoDelCerebro(l, datos as never, FICHA, base)

  it('cuenta lo medido: ticket promedio, línea base, días y horas pico, producto estrella, moneda y país', () => {
    for (const l of [
      'ticket promedio $10.87 (últimos 30 días, punto de venta, confianza alta)',
      'baseline ~107 tickets/semana (460 ÷ 30 × 7)',
      'días pico: sábado, domingo, viernes',
      'horas pico: 10:00, 12:00, 13:00',
      'producto estrella: Plato estrella con guarnición (~28.7% del ingreso mensual)',
      'moneda USD, Ecuador',
    ]) expect(medido(l), l).toBe(true)
  })
  it('CASO CONTRARIO: lo DERIVADO y las DECISIONES del plan siguen sin comprobar', () => {
    for (const l of [
      'margen bruto ~40% sobre el producto estrella: ($3.50 − $2.10) / $3.50',
      'error de sizing corregido: solo 13 tickets/semana incrementales atribuibles a pauta; presupuesto real necesario ~$191/semana',
      'tasa de cierre base 8% conservadora adoptada (resuelto por jefe)',
      'el local abre a las 8',
    ]) expect(medido(l), l).toBe(false)
  })
  it('CASO CONTRARIO: una cifra que el dato no contiene descalifica la línea (es un cálculo del agente)', () => {
    expect(medido('ticket promedio $12.50 (últimos 30 días, punto de venta)')).toBe(false)
    expect(medido('baseline ~150 tickets/semana (460 ÷ 30 × 7)')).toBe(false)
    expect(medido('baseline ~107 tickets/semana (460 ÷ 30 × 7)', DATOS, null)).toBe(false) // sin la línea base del código, el 107 no es medición
  })
  it('CASO CONTRARIO: un dato de ensayo, un hueco, de otro negocio o sin lectura no comprueba nada', () => {
    for (const extra of [{ procedencia: 'de_ensayo' }, { procedencia: 'hueco' }, { procedencia: 'supuesto' }, { identidad: 'no_coincide' }, { estado: 'error' }]) {
      const datos = [dato('metrica:pv:ticket_promedio:ultimos_30_dias', 10.87, extra)]
      expect(medido('ticket promedio $10.87 (últimos 30 días, punto de venta)', datos), JSON.stringify(extra)).toBe(false)
    }
  })
  it('la ficha: solo «moneda/país» sin otras cifras ni palabras', () => {
    expect(medido('moneda USD')).toBe(true)
    expect(medido('país Ecuador')).toBe(true)
    expect(medido('pauta de 200 USD por semana')).toBe(false)
    expect(esMedidoDelCerebro('moneda USD, Ecuador', [], {}, null)).toBe(false) // sin ficha no hay con qué comprobar
  })
  it('separarComprobado: dueño, medido y sin comprobar, en ese orden de prioridad', () => {
    const r = separarComprobado(
      ['presupuesto de pauta $200/semana (confirmado por dueño)', 'días pico: sábado, domingo, viernes', 'tasa de cierre base 8% adoptada'],
      [{ clave: 'presupuesto_de_pauta', literal: '200 por semana' }], DATOS as never, FICHA, 107.33)
    expect(r).toEqual({ confirmado_por_el_dueno: ['presupuesto de pauta $200/semana (confirmado por dueño)'], medido_del_cerebro: ['días pico: sábado, domingo, viernes'], sin_comprobar: ['tasa de cierre base 8% adoptada'] })
  })
})

describe('EL CIERRE con la regla 3', () => {
  const ENTRADA: Entrada = { meta_por_semana: 120, pasos: [{ tasa: 0.08 }], ticket: 10, margen: 0.4, referencia: { min: 0.8, max: 1, base: 0.9, tipo: 'supuesto', fuente: 'práctica' }, dias_activos_por_semana: 7, canales: [], produccion: { monto: 0, origen: 'supuesto' }, base_por_semana: 107.33 }
  const calc = calcular(ENTRADA)
  if (!calc.ok) throw new Error('la entrada de práctica debe calcular')
  const mundoCierre = (verificado: string[], hallazgos: unknown[] = [{ severidad: 'critico', que: 'A', estado: 'resuelto' }]) => {
    const P = { tableros: { invocacionDelJefe: async () => true, guardarTablero: async () => ({ id: 't' }), actualizarTablero: async () => undefined }, ahora: () => new Date() } as unknown as PuertosDeConversa
    const e = { id: 'enc', client_id: 'c', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 1, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: true, semilla: { moneda: 'USD', pais: 'Ecuador', respuestas_del_dueno: [{ clave: 'presupuesto_de_pauta', valor: '200 por semana', literal: '200 por semana' }] } } as never
    const arts = {
      bloque: { hay_bloque: true, bloque: calc, entrada: ENTRADA, huella: 'h' },
      acuerdo: { salida: 'sale_ajustada', hallazgos, requiere_ronda_2: false },
      planteo_fijado: { dado_por_verificado: verificado },
      expediente: { datos: [{ clave: 'metrica:pv:ticket_promedio:ultimos_30_dias', valor: 10.87, procedencia: 'cerebro', estado: 'trajo', identidad: 'coincide' }] },
    } as Record<string, Record<string, any>>
    return { P, e, arts }
  }
  it('si TODO lo dado por verificado es del dueño, medido o de la ficha: sale ajustada, sin tope, firmada', async () => {
    const m = mundoCierre(['presupuesto de pauta $200/semana (confirmado por dueño)', 'ticket promedio $10.87 (últimos 30 días)', 'moneda USD, Ecuador'])
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ estado: 'firmado', salida: 'sale_ajustada', tope_aplicado: false, alerta_verificado: null })
    expect(r.artefacto.confirmado_por_el_dueno).toHaveLength(1)
    expect(r.artefacto.medido_del_cerebro).toHaveLength(2)
    expect(r.artefacto.dado_por_verificado_sin_comprobar).toEqual([])
  })
  it('CASO CONTRARIO: lo derivado y las decisiones del plan siguen dando «sale con alerta» y tope, y solo ellos se avisan', async () => {
    const m = mundoCierre(['ticket promedio $10.87 (últimos 30 días)', 'margen bruto ~40% ($3.50 − $2.10) / $3.50', 'tasa de cierre base 8% adoptada'])
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ salida: 'sale_con_alerta', tope_aplicado: true })
    expect(r.artefacto.dado_por_verificado_sin_comprobar).toEqual(['margen bruto ~40% ($3.50 − $2.10) / $3.50', 'tasa de cierre base 8% adoptada'])
    expect(String(r.artefacto.alerta_verificado)).not.toContain('ticket promedio')
    expect(r.artefacto.medido_del_cerebro).toEqual(['ticket promedio $10.87 (últimos 30 días)'])
  })
  it('sin expediente.datos (cliente sin punto de venta) nada medido cuenta: igual que antes', async () => {
    const m = mundoCierre(['ticket promedio $10.87 (últimos 30 días)'])
    m.arts.expediente = {}
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ salida: 'sale_con_alerta', tope_aplicado: true })
    expect(r.artefacto.medido_del_cerebro).toEqual([])
  })
})
