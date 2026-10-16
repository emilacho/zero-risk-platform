/**
 * Buzón de la oficina financiera por CANAL PRIVADO (`FINANZAS_CANAL_PREGUNTAS` · CC#2 · 16-oct · decisión de Emilio 18:42: el buzón es un canal `#buzon-de-preguntas`, NO un MD).
 * US$ 0: Slack SIMULADO (0 mensajes reales). Con canal configurado: pregunta en el canal (mencionando al dueño) y recoge del HILO y del canal; sin canal: todo como el MD.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { preguntarAlDueno, recogerRespuestas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import type { CerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import type { AlmacenDeConversa, EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'

const DUENO = 'U_DUENO', BOT = 'B_BOT', TERCERO = 'U_OTRO', CANAL = 'C0CA01KEY68', OTRO_CANAL = 'C0OTROCANAL1', MD = 'D123ABC'
const PREGUNTAS = [
  { clave: 'frecuencia_visita', texto: '¿Cada cuánto vuelve tu cliente habitual?', recomendacion: 'Responde una estimación', supuesto_si_no_responde: 'se supone una visita al mes' },
]
type Msg = { ts: string; user?: string; bot_id?: string; text: string; subtype?: string }

/** Slack de mentira con canal: `historial` = mensajes del canal; `hilo` = respuestas dentro del hilo del mensaje del bot */
function slackFalso(opts: { historial?: Msg[]; hilo?: Msg[]; canalDevuelto?: string; fallaEn?: string } = {}) {
  const llamadas: Array<{ metodo: string; cuerpo?: any; consulta: Record<string, string> }> = []
  const f = (async (url: string, init?: any) => {
    const u = new URL(url)
    const metodo = u.pathname.replace('/api/', '')
    llamadas.push({ metodo, cuerpo: init?.body ? JSON.parse(init.body) : undefined, consulta: Object.fromEntries(u.searchParams) })
    const json = (j: unknown) => ({ status: 200, json: async () => j })
    if (opts.fallaEn === metodo) return json({ ok: false, error: 'missing_scope' })
    const oldest = Number(u.searchParams.get('oldest') ?? 0)
    if (metodo === 'chat.postMessage') return json({ ok: true, ts: '1700000000.000100', channel: opts.canalDevuelto ?? CANAL })
    if (metodo === 'conversations.history') return json({ ok: true, messages: (opts.historial ?? []).filter((m) => Number(m.ts) > oldest), has_more: false })
    if (metodo === 'conversations.replies') return json({ ok: true, messages: [{ ts: '1700000000.000100', bot_id: BOT, text: 'pregunta' }, ...(opts.hilo ?? [])].filter((m) => Number(m.ts) > oldest), has_more: false })
    return json({ ok: false, error: 'unknown_method' })
  }) as unknown as typeof fetch
  return { f, llamadas }
}

function mundo() {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 0.4, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: {} }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: PREGUNTAS } }
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
  return { e, almacen }
}
const cerebro = (): { c: CerebroDelDueno; respuestas: any[] } => {
  const respuestas: any[] = []
  return { respuestas, c: { async registrarPregunta(p) { return { ok: true, estado: 'registrada', pregunta_id: `pid-${p.tema}` } }, async registrarRespuesta(p) { respuestas.push(p); return { ok: true } } } }
}
const puertos = (m: ReturnType<typeof mundo>, s: ReturnType<typeof slackFalso>, canal: string | null = CANAL, c: CerebroDelDueno = cerebro().c): PuertosDelBuzon =>
  ({ almacen: m.almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: DUENO, ...(canal ? { canal } : {}), fetch: s.f }), ...(canal ? { canal } : {}), cerebro: c, modo: 'envia', ahora: () => new Date(1_700_000_000_000) })

describe('PREGUNTAR en el canal', () => {
  it('publica en el CANAL configurado (no en el MD), menciona al dueño y guarda canal y ts', async () => {
    const m = mundo(), s = slackFalso()
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, preguntas: 1 })
    expect(s.llamadas.map((l) => l.metodo)).toEqual(['chat.postMessage'])
    expect(s.llamadas[0].cuerpo.channel).toBe(CANAL)
    expect(s.llamadas[0].cuerpo.text.startsWith(`<@${DUENO}> `)).toBe(true)
    expect(s.llamadas[0].cuerpo.text).toContain('¿Cada cuánto vuelve tu cliente habitual?')
    expect(m.e.slack_canal).toBe(CANAL)
    expect(m.e.slack_ts).toBe('1700000000.000100')
  })
  it('es idempotente en el canal: un encargo = un mensaje', async () => {
    const m = mundo(), s = slackFalso()
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'ya_enviado' })
    expect(s.llamadas.filter((l) => l.metodo === 'chat.postMessage')).toHaveLength(1)
  })
  it('si Slack contesta OTRO canal, no se da por enviado (canal_inesperado)', async () => {
    const m = mundo(), s = slackFalso({ canalDevuelto: OTRO_CANAL })
    const r = await preguntarAlDueno(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'sin_md', slack: 'canal_inesperado' })
    expect(m.e.slack_ts).toBeNull()
  })
  it('SIN canal configurado se comporta como el MD de siempre (destino = el id del dueño, canal D…)', async () => {
    const m = mundo(), s = slackFalso({ canalDevuelto: MD })
    const r = await preguntarAlDueno(puertos(m, s, null), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true })
    expect(s.llamadas[0].cuerpo.channel).toBe(DUENO)
    expect(s.llamadas[0].cuerpo.text.startsWith('<@')).toBe(false)
    expect(m.e.slack_canal).toBe(MD)
  })
})

describe('RECOGER del hilo y del canal', () => {
  const preguntado = async (hilo: Msg[], historial: Msg[] = []) => {
    const m = mundo(), s = slackFalso({ hilo, historial })
    await preguntarAlDueno(puertos(m, s), 'enc-1')
    return { m, s }
  }
  it('lee las respuestas del HILO (conversations.replies) y del canal (history), solo las del dueño, y las deja en la semilla', async () => {
    const { m, s } = await preguntado(
      [{ ts: '1700000050.000100', user: DUENO, text: '1: 2' }, { ts: '1700000060.000100', user: TERCERO, text: '1: 9' }, { ts: '1700000070.000100', bot_id: BOT, text: 'gracias' }],
      [{ ts: '1700000080.000100', user: DUENO, text: 'gracias por preguntar' }],
    )
    const cc = cerebro()
    const r = await recogerRespuestas(puertos(m, s, CANAL, cc.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['frecuencia_visita'] })
    expect(s.llamadas.map((l) => l.metodo)).toEqual(expect.arrayContaining(['conversations.history', 'conversations.replies']))
    const rep = s.llamadas.find((l) => l.metodo === 'conversations.replies')!
    expect(rep.consulta.channel).toBe(CANAL)
    expect(rep.consulta.ts).toBe('1700000000.000100')
    const dadas = (m.e.semilla.respuestas_del_dueno ?? []) as Array<{ clave: string; literal: string }>
    expect(dadas.map((x) => x.clave)).toEqual(['frecuencia_visita'])
    expect(dadas[0].literal).toBe('1: 2')
    expect(JSON.stringify(m.e.semilla)).not.toContain('1: 9') // el tercero no cuenta
    expect(cc.respuestas).toHaveLength(1) // y la respuesta se guarda en el cerebro por su puerta
  })
  it('una respuesta que está en el hilo Y en el historial (difusión) se cuenta UNA vez', async () => {
    const igual: Msg = { ts: '1700000050.000100', user: DUENO, text: '1: 4' }
    const { m, s } = await preguntado([igual], [igual])
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true, aplicadas: ['frecuencia_visita'] })
    expect(((m.e.semilla.respuestas_del_dueno ?? []) as unknown[]).length).toBe(1)
  })
  it('sin respuestas nuevas no inventa nada; sin permiso devuelve sin_acceso y el encargo sigue con supuestos', async () => {
    const { m, s } = await preguntado([])
    expect((await recogerRespuestas(puertos(m, s), 'enc-1')).cuerpo).toMatchObject({ recogido: false, motivo: 'sin_mensajes_nuevos' })
    const sinPermiso = slackFalso({ fallaEn: 'conversations.replies' })
    const r = await recogerRespuestas(puertos(m, sinPermiso), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_acceso', slack: 'missing_scope', sigue_con_supuestos: true })
  })
  it('un encargo cuyo destino guardado NO es ese canal ni un MD no se lee (sin_md_abierto)', async () => {
    const { m, s } = await preguntado([{ ts: '1700000050.000100', user: DUENO, text: '1: 4' }])
    m.e.slack_canal = OTRO_CANAL
    const r = await recogerRespuestas(puertos(m, s), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: false, motivo: 'sin_md_abierto' })
  })
  it('un encargo ya preguntado por MD sigue recogiéndose por MD aunque ahora haya canal configurado', async () => {
    const m = mundo(); m.e.slack_canal = MD; m.e.slack_ts = '1700000000.000100'; m.e.leido_hasta = '1700000000.000100'
    const s = slackFalso({ historial: [{ ts: '1700000050.000100', user: DUENO, text: '1: 4' }] })
    // registro del buzón con la clave preguntada (lo que dejó `preguntar`)
    await m.almacen.guardarBuzon!({ encargo_id: 'enc-1', artefacto: { tipo: 'buzon_respuestas', version: 1, contenido: { n: 1, claves: ['frecuencia_visita'], preguntas: [{ clave: 'frecuencia_visita', texto: 'x', pregunta_id: null }], sin_cerebro: [], respuestas: [], notas: [] }, sha256: 'x' } })
    const r = await recogerRespuestas(puertos(m, s, CANAL), 'enc-1')
    expect(r.cuerpo).toMatchObject({ recogido: true })
    expect(s.llamadas.some((l) => l.metodo === 'conversations.replies')).toBe(false) // en un MD no hay hilo que leer
  })
})

describe('la ruta', () => {
  it('toma el canal de FINANZAS_CANAL_PREGUNTAS solo si tiene forma de id (C…/G…) y lo pasa al adaptador y al buzón', () => {
    const t = fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8').split('\r\n').join('\n')
    expect(t).toContain('FINANZAS_CANAL_PREGUNTAS')
    expect(t).toContain('/^[CG][A-Z0-9]{8,}$/')
    expect(t).toMatch(/canal: canalDelBuzon/)
    expect(t).toMatch(/slackMdPuerto\(\{[^}]*canal: canalDelBuzon/)
    expect(t).not.toMatch(/C0CA01KEY68/) // el id va por entorno, no escrito en el código
  })
})
