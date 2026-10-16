/**
 * Buzón de Slack de la oficina financiera (CC#1 · 16-oct): MD al dueño con las preguntas necesarias y recogida de sus respuestas. US$ 0: Slack SIMULADO (0 mensajes reales).
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { preguntarAlDueno, recogerRespuestas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import type { CerebroDelDueno, VeredictoDePregunta } from '../src/lib/buzon-dueno/cerebro-dueno'
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

function mundo(semilla: Semilla = {}, extra: Partial<EncargoDeConversa> = {}, conteo?: { cliente_24h: number; hoy: number } | null) {
  const candado = { tomado: false }
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 0.4, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla, ...extra }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: PREGUNTAS } }
  const guardados: any[] = []
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar() { throw new Error('el buzón no debe tocar el motor') },
    async tomarPaso() { if (candado.tomado) return { ok: true as const, tomado: false }; candado.tomado = true; return { ok: true as const, tomado: true } },
    async soltarPaso() { candado.tomado = false },
    ...(conteo === undefined ? {} : { async contarBuzon() { return conteo } }),
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
/** el cerebro de mentira: cada pregunta se registra (o se resuelve según `veredictos[tema]`); cada respuesta guardada queda en `respuestas` */
function cerebroFalso(opts: { veredictos?: Record<string, VeredictoDePregunta>; cae?: boolean; caeAlGuardar?: boolean } = {}) {
  const preguntas: any[] = [], respuestas: any[] = []
  const c: CerebroDelDueno = {
    async registrarPregunta(p) { preguntas.push(p); if (opts.cae) return { ok: false, error: 'http_500' }; return opts.veredictos?.[p.tema] ?? { ok: true, estado: 'registrada', pregunta_id: `pid-${p.tema.replace(/ /g, '-')}` } },
    async registrarRespuesta(p) { respuestas.push(p); return opts.caeAlGuardar ? { ok: false, error: 'http_500' } : { ok: true } },
  }
  return { c, preguntas, respuestas }
}
const puertos = (m: ReturnType<typeof mundo>, s: ReturnType<typeof slackFalso>, modo: PuertosDelBuzon['modo'] = 'envia', cerebro: CerebroDelDueno = cerebroFalso().c): PuertosDelBuzon =>
  ({ almacen: m.almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: DUENO, fetch: s.f }), cerebro, modo, ahora: () => new Date(1_700_000_000_000) })

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
  it('con ronda 2 manda el acuerdo_2 (no el de la ronda 1) y sin acuerdo_2 sigue el de la ronda 1', async () => {
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo_2 = { preguntas_a_emilio: [{ ...PREGUNTAS[0], clave: 'frecuencia_visita', texto: '¿Cada cuánto vuelve un cliente al local?' }] }
    expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: true, preguntas: 1 })
    const texto = s.llamadas.filter((l) => l.metodo === 'chat.postMessage').map((l) => JSON.stringify(l)).join('')
    expect(texto).toContain('vuelve un cliente')
    expect(texto).not.toContain(PREGUNTAS[1].texto)
    const m2 = mundo(), s2 = slackFalso()
    expect((await preguntarAlDueno(puertos(m2, s2), 'enc-1')).cuerpo).toMatchObject({ enviado: true, preguntas: PREGUNTAS.length })
  })
  it('pregunta larga: la pregunta y la recomendación van al canal y el «si no respondes» como primera respuesta del hilo; la corta sigue en un solo mensaje', async () => {
    const larga = { clave: 'frecuencia_visita', texto: '¿Con qué frecuencia vuelve un cliente habitual al local? ' + 'x'.repeat(200), recomendacion: 'Responde con tu estimación. ' + 'y'.repeat(200), supuesto_si_no_responde: 'Se supone una visita quincenal. ' + 'z'.repeat(200) }
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [larga] }
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, supuestos_en_hilo: true })
    const envios = s.llamadas.filter((l) => l.metodo === 'chat.postMessage')
    expect(envios).toHaveLength(2)
    expect(envios[0].cuerpo.text).not.toContain('Si no respondes')
    expect(envios[0].cuerpo.text.length).toBeLessThan(900)
    expect(envios[1].cuerpo.thread_ts).toBe('1700000000.000100')
    expect(envios[1].cuerpo.text).toContain('Se supone una visita quincenal')
    expect(envios[1].cuerpo.text.length).toBeLessThanOrEqual(600)
    expect(m.guardados).toHaveLength(1)
    const m2 = mundo(), s2 = slackFalso()
    await preguntarAlDueno(puertos(m2, s2), 'enc-1')
    const corto = s2.llamadas.filter((l) => l.metodo === 'chat.postMessage')
    expect(corto).toHaveLength(1)
    expect(corto[0].cuerpo.text).toContain('Si no respondes')
    expect(corto[0].cuerpo.thread_ts).toBeUndefined()
  })
  it('si el hilo falla, el mensaje ya salió y se avisa sin reenviar; sin método de hilo no sale nada', async () => {
    const larga = { clave: 'frecuencia_visita', texto: 'a'.repeat(250), recomendacion: 'b'.repeat(250), supuesto_si_no_responde: 'c'.repeat(250) }
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [larga] }
    const P = puertos(m, s)
    const base = P.slack.enHilo
    expect(base).toBeTypeOf('function')
    const r = await preguntarAlDueno({ ...P, slack: { ...P.slack, enHilo: async () => ({ ok: false as const, motivo: 'ratelimited' }) } }, 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, supuestos_en_hilo: false })
    const m3 = mundo(), s3 = slackFalso()
    m3.arts.acuerdo = { preguntas_a_emilio: [larga] }
    const P3 = puertos(m3, s3)
    const sinHilo = await preguntarAlDueno({ ...P3, slack: { ...P3.slack, enHilo: undefined } }, 'enc-1')
    expect(sinHilo.cuerpo).toMatchObject({ enviado: false, motivo: 'sin_hilo' })
    expect(s3.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(0)
    expect(m3.guardados).toHaveLength(0)
  })
  it('lo que no cabe ni aparte se rechaza: pregunta+recomendación o «si no respondes» sobre 600', async () => {
    for (const q of [
      { clave: 'k', texto: 'a'.repeat(400), recomendacion: 'b'.repeat(300), supuesto_si_no_responde: 'c' },
      { clave: 'k', texto: 'a', recomendacion: 'b', supuesto_si_no_responde: 'c'.repeat(700) },
    ]) {
      const m = mundo(), s = slackFalso()
      m.arts.acuerdo = { preguntas_a_emilio: [q] }
      expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: false, motivo: 'pregunta_mal_formada' })
      expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(0)
    }
  })
  it('una pregunta con jerga o voseo no sale (el dueño no lee jerga)', async () => {
    const m = mundo(), s = slackFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [{ ...PREGUNTAS[0], texto: '¿Cuál es el workflow del dispatch? Decime vos' }] }
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'pregunta_mal_formada' })
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(0)
  })
  it('respeta los topes de ritmo (1 por cliente cada 24 h · 3 por día)', async () => {
    for (const conteo of [{ cliente_24h: 1, hoy: 1 }, { cliente_24h: 0, hoy: 3 }, null]) {
      const m = mundo({}, {}, conteo), s = slackFalso()
      expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: false })
      expect(s.llamadas).toHaveLength(0)
    }
    const m = mundo({}, {}, { cliente_24h: 0, hoy: 2 }), s = slackFalso()
    expect((await preguntarAlDueno(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ enviado: true })
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

describe('R4 · preguntar es atómico', () => {
  it('dos llamadas simultáneas mandan UN solo MD', async () => {
    const m = mundo(), s = slackFalso()
    const [a, b] = await Promise.all([preguntarAlDueno(puertos(m, s), 'enc-1'), preguntarAlDueno(puertos(m, s), 'enc-1')])
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(1)
    expect([a.cuerpo.enviado, b.cuerpo.enviado].sort()).toEqual([false, true])
    expect([a.cuerpo.motivo, b.cuerpo.motivo]).toContain('otro_paso_en_curso')
  })
  it('suelta el candado también cuando algo falla', async () => {
    const m = mundo(), s = slackFalso({ falla: 'missing_scope' })
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    const s2 = slackFalso()
    expect((await preguntarAlDueno(puertos(m, s2), 'enc-1')).cuerpo).toMatchObject({ enviado: true })
  })
})

describe('CEREBRO · la puerta del dueño', () => {
  it('registra CADA pregunta en el cerebro antes de escribirle al dueño', async () => {
    const m = mundo(), s = slackFalso(), ce = cerebroFalso()
    await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(ce.preguntas.map((p) => p.tema)).toEqual(['pauta por semana', 'costo plato', 'abre guayaquil'])
    expect(ce.preguntas.every((p) => p.client_id === 'cliente-prueba')).toBe(true)
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(1)
  })
  it('pregunta ya respondida en el cerebro → NO se pregunta y se usa como dato del dueño', async () => {
    const m = mundo(), s = slackFalso()
    const ce = cerebroFalso({ veredictos: { 'costo plato': { ok: true, estado: 'ya_respondida', respuestas: [{ respuesta: '2,10 por plato', canal: 'chat', respondido_en: '2026-10-16' }] } } })
    const r = await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, usadas_del_cerebro: ['costo_plato'], claves: ['pauta_por_semana', 'abre_guayaquil'] })
    const texto: string = s.llamadas[0].cuerpo.text
    expect(texto).not.toContain(PREGUNTAS[1].texto)
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'costo_plato', valor: '2,10 por plato', literal: '2,10 por plato' }])
  })
  it('todas ya respondidas → 0 MD', async () => {
    const m = mundo(), s = slackFalso()
    const v = (r: string): VeredictoDePregunta => ({ ok: true, estado: 'ya_respondida', respuestas: [{ respuesta: r }] })
    const ce = cerebroFalso({ veredictos: { 'pauta por semana': v('200 por semana'), 'costo plato': v('2,10'), 'abre guayaquil': v('sin abrir') } })
    const r = await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'respondidas_en_el_cerebro' })
    expect(s.llamadas).toHaveLength(0)
    expect(m.e.semilla.respuestas_del_dueno).toHaveLength(3)
    expect(m.e.slack_ts).toBeNull()
  })
  it('otra oficina ya espera esa respuesta → no se pregunta lo mismo a la vez', async () => {
    const m = mundo(), s = slackFalso()
    const ce = cerebroFalso({ veredictos: { 'pauta por semana': { ok: true, estado: 'ya_preguntada' } } })
    const r = await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, esperando: ['pauta_por_semana'] })
    expect(s.llamadas[0].cuerpo.text).not.toContain(PREGUNTAS[0].texto)
  })
  it('cerebro caído → no se le escribe al dueño y el encargo sigue con supuestos, avisado', async () => {
    const m = mundo(), s = slackFalso()
    const r = await preguntarAlDueno(puertos(m, s, 'envia', cerebroFalso({ cae: true }).c), 'enc-1')
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'cerebro_caido', sigue_con_supuestos: true })
    expect(String(r.cuerpo.aviso)).toContain('supuestos')
    expect(s.llamadas).toHaveLength(0)
    expect(m.guardados).toHaveLength(0)
  })
  it('una pregunta mal formada no deja preguntas pendientes en el cerebro', async () => {
    const m = mundo(), s = slackFalso(), ce = cerebroFalso()
    m.arts.acuerdo = { preguntas_a_emilio: [{ ...PREGUNTAS[0], texto: '¿Cuál es el workflow del dispatch?' }] }
    await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(ce.preguntas).toHaveLength(0)
  })
  it('apagado = 0 llamadas al cerebro', async () => {
    const m = mundo(), s = slackFalso(), ce = cerebroFalso()
    await preguntarAlDueno(puertos(m, s, 'apagado', ce.c), 'enc-1')
    await recogerRespuestas(puertos(m, s, 'apagado', ce.c), 'enc-1')
    expect(ce.preguntas).toHaveLength(0)
    expect(ce.respuestas).toHaveLength(0)
  })
  it('al recoger, cada respuesta nueva se GUARDA en el cerebro con su cita, canal y hora', async () => {
    const ce = cerebroFalso(), m = mundo(), s = slackFalso({ historial: [{ ts: '1700000100.000100', user: DUENO, text: ['1: 200', '2: 2,10'].join('\n') }] })
    await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    const r = await recogerRespuestas(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['pauta_por_semana', 'costo_plato'] })
    expect(ce.respuestas).toHaveLength(2)
    expect(ce.respuestas[0]).toMatchObject({ client_id: 'cliente-prueba', tema: 'pauta por semana', respuesta: '1: 200', mensaje_ref: `${MD}:1700000100.000100`, respondido_en: new Date(1700000100000).toISOString(), pregunta_id: 'pid-pauta-por-semana' })
    expect(ce.respuestas[0].pregunta).toBe(PREGUNTAS[0].texto)
    expect((m.arts.buzon_respuestas as any).evento.en_el_cerebro).toBe(2)
  })
  it('una respuesta ambigua o ya aplicada NO se guarda de nuevo en el cerebro', async () => {
    const ce = cerebroFalso(), m = mundo(), s = slackFalso({ historial: [{ ts: '1700000100.000100', user: DUENO, text: '1 1.500' }] })
    await preguntarAlDueno(puertos(m, s, 'envia', ce.c), 'enc-1')
    await recogerRespuestas(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(ce.respuestas).toHaveLength(0)
    s.historial.push({ ts: '1700000200.000100', user: DUENO, text: '1: 200' })
    await recogerRespuestas(puertos(m, s, 'envia', ce.c), 'enc-1')
    m.e.leido_hasta = '1700000000.000100'
    await recogerRespuestas(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(ce.respuestas.filter((r) => r.tema === 'pauta por semana')).toHaveLength(1)
  })
  it('cerebro caído al guardar: la respuesta queda en la semilla, se avisa y se reintenta en la próxima recogida', async () => {
    const m = mundo(), s = slackFalso({ historial: [{ ts: '1700000100.000100', user: DUENO, text: '1: 200' }] })
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    const r = await recogerRespuestas(puertos(m, s, 'envia', cerebroFalso({ caeAlGuardar: true }).c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['pauta_por_semana'], sin_cerebro: ['pauta_por_semana'] })
    expect(String(r.cuerpo.aviso)).toContain('cerebro')
    expect(m.e.semilla.respuestas_del_dueno).toHaveLength(1)
    const ce = cerebroFalso()
    const otra = await recogerRespuestas(puertos(m, s, 'envia', ce.c), 'enc-1')
    expect(otra.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    expect(ce.respuestas).toHaveLength(1)
    expect((m.arts.buzon_respuestas as any).sin_cerebro).toEqual([])
  })
})
