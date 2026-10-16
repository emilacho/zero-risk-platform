/**
 * Buzón de Slack de la oficina financiera (CC#1 · 16-oct): MD al dueño con las preguntas necesarias y recogida de sus respuestas. US$ 0: Slack SIMULADO (0 mensajes reales).
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { preguntarAlDueno, recogerRespuestas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { slackMdPuerto } from '../src/lib/finanzas/conversa/buzon-slack'
import { respuestasDeLaSemilla } from '../src/lib/finanzas/conversa/orquestador'
import type { AlmacenDeConversa, EncargoDeConversa, Semilla } from '../src/lib/finanzas/conversa/puertos'

const DUENO = 'U_DUENO', BOT = 'B_BOT', TERCERO = 'U_OTRO', MD = 'D123ABC'
const PREGUNTAS = [
  { clave: 'pauta_por_semana', texto: '¿Cuánto inviertes en pauta cada semana?', recomendacion: 'Responde la cifra real', supuesto_si_no_responde: 'se supone cero pauta' },
  { clave: 'costo_plato', texto: '¿Cuánto te cuesta preparar el plato más vendido?', recomendacion: 'Usa el costo de la receta', supuesto_si_no_responde: 'se usa el costo del mercado' },
  { clave: 'abre_guayaquil', texto: '¿Ya abriste el local de Guayaquil?', recomendacion: 'Responde sí o no', supuesto_si_no_responde: 'se supone que no' },
]

type Hist = Array<{ ts: string; user?: string; bot_id?: string; text: string; subtype?: string }>
/** Slack de mentira: registra cada llamada; `historial` es el MD */
function slackFalso(opts: { historial?: Hist; falla?: string; sinRed?: boolean } = {}) {
  const llamadas: Array<{ metodo: string; cuerpo?: any; consulta?: Record<string, string> }> = []
  const historial = opts.historial ?? []
  const f = (async (url: string, init?: any) => {
    const u = new URL(url)
    const metodo = u.pathname.replace('/api/', '')
    llamadas.push({ metodo, cuerpo: init?.body ? JSON.parse(init.body) : undefined, consulta: Object.fromEntries(u.searchParams) })
    if (opts.sinRed) throw new Error('red caída')
    const json = (j: unknown) => ({ status: 200, json: async () => j })
    if (opts.falla) return json({ ok: false, error: opts.falla })
    if (metodo === 'chat.postMessage') return json({ ok: true, ts: '1700000000.000100', channel: MD })
    if (metodo === 'conversations.history') {
      const oldest = Number(u.searchParams.get('oldest') ?? 0)
      return json({ ok: true, messages: historial.filter((m) => Number(m.ts) > oldest), has_more: false })
    }
    return json({ ok: false, error: 'unknown_method' })
  }) as unknown as typeof fetch
  return { f, llamadas, historial }
}

function mundo(semilla: Semilla = {}, extra: Partial<EncargoDeConversa> = {}) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 0.4, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla, ...extra }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: PREGUNTAS } }
  const guardados: any[] = []
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar() { throw new Error('el buzón no debe tocar el motor') },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return [] },
    async guardarBuzon(c) {
      guardados.push(structuredClone(c))
      if (c.slack_canal !== undefined) e.slack_canal = c.slack_canal
      if (c.slack_ts !== undefined) e.slack_ts = c.slack_ts
      if (c.leido_hasta !== undefined) e.leido_hasta = c.leido_hasta
      if (c.semilla !== undefined) e.semilla = structuredClone(c.semilla)
      if (c.artefacto) arts[c.artefacto.tipo] = structuredClone(c.artefacto.contenido)
    },
  }
  return { e, arts, almacen, guardados }
}
const puertos = (m: ReturnType<typeof mundo>, s: ReturnType<typeof slackFalso>, modo: PuertosDelBuzon['modo'] = 'envia'): PuertosDelBuzon =>
  ({ almacen: m.almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: DUENO, fetch: s.f }), modo, ahora: () => new Date(1_700_000_000_000) })

describe('PREGUNTAR · un solo MD al dueño', () => {
  it('envía UN MD con las 3 preguntas, la recomendación y «si no respondes», y guarda canal y ts', async () => {
    const m = mundo(), s = slackFalso()
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, preguntas: 3 })
    expect(s.llamadas.map((l) => l.metodo)).toEqual(['chat.postMessage'])
    const texto: string = s.llamadas[0].cuerpo.text
    expect(s.llamadas[0].cuerpo.channel).toBe(DUENO) // su bandeja (MD), no un canal
    for (const q of PREGUNTAS) { expect(texto).toContain(q.texto); expect(texto).toContain(q.recomendacion); expect(texto).toContain(q.supuesto_si_no_responde) }
    expect(texto).toContain('Si no respondes')
    expect(m.e.slack_canal).toBe(MD)
    expect(m.e.slack_ts).toBe('1700000000.000100')
    expect(m.e.leido_hasta).toBe('1700000000.000100')
  })
  it('es idempotente: un encargo = un MD', async () => {
    const m = mundo(), s = slackFalso()
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'ya_enviado' })
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(1)
  })
  it('apagado = 0 envíos y 0 llamadas (y en borrador tampoco)', async () => {
    for (const modo of ['apagado', 'borrador'] as const) {
      const m = mundo(), s = slackFalso()
      const r = await preguntarAlDueno(puertos(m, s, modo), 'enc-1')
      expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'buzon_apagado' })
      expect(s.llamadas).toHaveLength(0)
      expect(m.guardados).toHaveLength(0)
    }
  })
  it('un encargo en seco no escribe a nadie', async () => {
    const m = mundo({}, { dry_run: true }), s = slackFalso()
    expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: false, motivo: 'encargo_en_seco' })
    expect(s.llamadas).toHaveLength(0)
  })
  it('sin preguntas en el acuerdo no manda nada', async () => {
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [] }
    expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: false, motivo: 'sin_preguntas' })
    expect(s.llamadas).toHaveLength(0)
  })
  it('una pregunta con jerga o voseo no sale (el dueño no lee jerga)', async () => {
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [{ ...PREGUNTAS[0], texto: '¿Cuál es el workflow del dispatch? Decime vos' }] }
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'pregunta_mal_formada' })
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(0)
  })
  it('respeta los topes de ritmo (1 por cliente cada 24 h · 3 por día)', async () => {
    const m = mundo(), s = slackFalso()
    const P = { ...puertos(m, s), enviados: async () => ({ cliente_24h: 1, hoy: 1 }) }
    expect((await preguntarAlDueno(P, 'enc-1')).cuerpo).toMatchObject({ enviado: false })
    expect(s.llamadas).toHaveLength(0)
  })
  it('Slack caído o sin permiso: no lanza, no guarda y el encargo sigue con supuestos', async () => {
    for (const opts of [{ falla: 'missing_scope' }, { falla: 'not_authed' }, { sinRed: true }]) {
      const m = mundo(), s = slackFalso(opts)
      const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
      expect(r.status).toBe(200)
      expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'sin_md' })
      expect(m.guardados).toHaveLength(0)
      expect(m.e.slack_canal).toBeNull()
    }
  })
  it('sin llave del bot o sin id del dueño: «no configurado», 0 llamadas', async () => {
    const m = mundo(), s = slackFalso()
    const P = { ...puertos(m, s), slack: slackMdPuerto({ token: '', dueno_id: DUENO, fetch: s.f }) }
    expect((await preguntarAlDueno(P, 'enc-1')).cuerpo).toMatchObject({ enviado: false, motivo: 'sin_md', slack: 'no_configurado' })
    expect(s.llamadas).toHaveLength(0)
  })
})

describe('RECOGER · lo que el dueño contesta', () => {
  const TS0 = '1700000000.000100'
  async function conMdAbierto(historial: Hist = []) {
    const m = mundo(), s = slackFalso({ historial })
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    return { m, s }
  }
  it('lee solo lo POSTERIOR al cursor y deja las respuestas en la semilla (cifras, sí/no)', async () => {
    const { m, s } = await conMdAbierto([
      { ts: '1699999999.000001', user: DUENO, text: '1: 999' }, // anterior a la pregunta: no cuenta
      { ts: '1700000100.000100', user: DUENO, text: ['1: 200', '2: 2,10', '3: no'].join('\n') },
    ])
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['pauta_por_semana', 'costo_plato', 'abre_guayaquil'], listo_para_siguiente_ronda: true })
    expect(m.e.semilla.respuestas_del_dueno).toEqual([
      { clave: 'pauta_por_semana', valor: 200, literal: '1: 200' },
      { clave: 'costo_plato', valor: 2.1, literal: '2: 2,10' },
      { clave: 'abre_guayaquil', valor: 'no', literal: '3: no' },
    ])
    expect(m.e.leido_hasta).toBe('1700000100.000100')
    expect(s.llamadas.at(-1)?.consulta?.oldest).toBe(TS0)
    // cada paso las recibe como dato del dueño
    expect(respuestasDeLaSemilla(m.e.semilla)).toHaveLength(3)
  })
  it('ignora al bot y a terceros', async () => {
    const { m, s } = await conMdAbierto([
      { ts: '1700000100.000100', bot_id: BOT, user: DUENO, text: '1 500' },
      { ts: '1700000101.000100', user: TERCERO, text: '1 700' },
      { ts: '1700000102.000100', user: DUENO, subtype: 'message_changed', text: '1 800' },
    ])
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    expect(m.e.semilla.respuestas_del_dueno).toBeUndefined()
    expect(m.e.leido_hasta).toBe('1700000102.000100') // el cursor avanza para no releer
  })
  it('respuesta repartida en varios mensajes', async () => {
    const { m, s } = await conMdAbierto([
      { ts: '1700000100.000100', user: DUENO, text: '1: 200' },
      { ts: '1700000160.000100', user: DUENO, text: '2: 2,10' },
    ])
    await recogerRespuestas(puertos(m, s), 'enc-1')
    expect((m.e.semilla.respuestas_del_dueno ?? []).map((x) => x.clave)).toEqual(['pauta_por_semana', 'costo_plato'])
  })
  it('respuesta parcial: lo respondido entra, lo demás queda pendiente (con su supuesto)', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: '2: 2,10' }])
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ aplicadas: ['costo_plato'], pendientes: ['pauta_por_semana', 'abre_guayaquil'], listo_para_siguiente_ronda: false })
    expect(m.e.semilla.respuestas_del_dueno).toHaveLength(1)
  })
  it('una respuesta ambigua queda como NOTA con su literal y nunca como cifra', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: '1 1.500' }])
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ aplicadas: [], notas: 1 })
    expect(m.e.semilla.respuestas_del_dueno).toBeUndefined()
    const reg = m.arts.buzon_respuestas as any
    expect(reg.notas[0].literal).toBe('1 1.500')
  })
  it('un texto libre es nota del dueño, no dato', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: 'déjame revisarlo con mi socio' }])
    await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(m.e.semilla.respuestas_del_dueno).toBeUndefined()
    expect((m.arts.buzon_respuestas as any).notas[0].literal).toContain('mi socio')
  })
  it('la misma respuesta no se aplica dos veces; una corrección reemplaza a la anterior', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: '1: 200' }])
    await recogerRespuestas(puertos(m, s), 'enc-1')
    // el cursor ya pasó: otra recogida sin mensajes nuevos no cambia nada
    const otra = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(otra.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    // si el cursor se perdiera y volviera a llegar el mismo literal, tampoco se duplica
    m.e.leido_hasta = TS0
    const repetida = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(repetida.cuerpo).toMatchObject({ aplicadas: [] })
    expect(m.e.semilla.respuestas_del_dueno).toHaveLength(1)
    // corrección posterior
    s.historial.push({ ts: '1700000300.000100', user: DUENO, text: '1: 250' })
    await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'pauta_por_semana', valor: 250, literal: '1: 250' }])
  })
  it('deja el registro versionado con el evento para el cerebro (sin escribir en él)', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: '1: 200' }])
    await recogerRespuestas(puertos(m, s), 'enc-1')
    const reg = m.arts.buzon_respuestas as any
    expect(reg.evento).toMatchObject({ tipo: 'respuestas_del_dueno_recibidas', client_id: 'cliente-prueba', claves_respondidas: ['pauta_por_semana'] })
    expect(reg.n).toBe(2)
    expect(m.guardados.at(-1).artefacto.version).toBe(2)
  })
  it('respeta la semilla previa (no pisa respuestas ya entregadas como dato ni el tope propio)', async () => {
    const m = mundo({ tope_encargo_usd: 3, respuestas_del_dueno: [{ clave: 'otra_cosa', valor: 1, literal: 'ya dado' }] }), s = slackFalso({ historial: [{ ts: '1700000100.000100', user: DUENO, text: '1: 200' }] })
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(m.e.semilla.tope_encargo_usd).toBe(3)
    expect(m.e.semilla.respuestas_del_dueno?.map((x) => x.clave)).toEqual(['otra_cosa', 'pauta_por_semana'])
  })
  it('Slack caído al leer: no lanza, no cambia nada y sigue con supuestos', async () => {
    const m = mundo(), ok = slackFalso()
    await preguntarAlDueno(puertos(m, ok), 'enc-1')
    for (const opts of [{ falla: 'missing_scope' }, { sinRed: true }]) {
      const r = await recogerRespuestas(puertos(m, slackFalso(opts)), 'enc-1')
      expect(r.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_acceso', sigue_con_supuestos: true })
    }
    expect(m.e.leido_hasta).toBe(TS0)
  })
  it('apagado = 0 lecturas; y sin MD abierto no lee', async () => {
    const m = mundo(), s = slackFalso()
    expect((await recogerRespuestas(puertos(m, s, 'apagado'), 'enc-1')).cuerpo).toMatchObject({ recogido: false, motivo: 'buzon_apagado' })
    expect((await recogerRespuestas(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ recogido: false, motivo: 'sin_md_abierto' })
    expect(s.llamadas).toHaveLength(0)
  })
  it('recoger no dispara la siguiente ronda ni toca el motor', async () => {
    const { m, s } = await conMdAbierto([{ ts: '1700000100.000100', user: DUENO, text: '1: 200' }])
    await expect(recogerRespuestas(puertos(m, s), 'enc-1')).resolves.toBeDefined() // `guardar` del motor lanzaría si se usara
    expect(m.e.estado).toBe('en_curso')
  })
})
