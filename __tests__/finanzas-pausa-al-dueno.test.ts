/**
 * 04-nov · LA PAUSA DE LA OFICINA FINANCIERA. Lo que pasó en la corrida `2c0d2236`: el jefe dejó 3 críticos y 5 preguntas, salieron 3 (no las de los críticos), el plan siguió sin firma y la respuesta ya no le servía a nadie.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { prepararPreguntas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { armarMensaje } from '../src/lib/finanzas/preguntas'
import { avanzar, abrirConversacion, cerrarPorPlazo, debePausar, preguntasQueFaltan, topeEfectivoDelEncargo, TOPE_MAXIMO_POR_ENCARGO_USD, type Respuesta } from '../src/lib/finanzas/conversa/orquestador'
import { atenderPausa, MAX_INTENTOS_DE_DESPERTAR, MAX_MATERIAL, pausarOficina, type EsperaDeFinanzas, type PuertosDePausa } from '../src/lib/finanzas/conversa/pausa'
import { despertarPorElFlujo } from '../src/lib/finanzas/conversa/esperas-supabase'
import type { AlmacenDeConversa, EncargoDeConversa, PuertosDeConversa, Semilla } from '../src/lib/finanzas/conversa/puertos'
import { prevuelo } from '../src/lib/planeacion/prevuelo'

const preg = (clave: string, o: Record<string, unknown> = {}) => ({ clave, texto: `¿Pregunta sobre ${clave.replace(/_/g, ' ')}?`, recomendacion: 'Lo que te conviene hacer.', supuesto_si_no_responde: 'Lo que supongo sin tu respuesta.', impacto: 'alto', ...o })
const CINCO = [preg('comision'), preg('turistas'), preg('temporada'), preg('whatsapp', { frena_la_firma: true }), preg('pixel', { frena_la_firma: true })]
const acuerdo = (preguntas: unknown[] = CINCO, criticos = 3) => ({ acuerdo: { criticos, requiere_ronda_2: criticos > 0, preguntas_a_emilio: preguntas, hallazgos: [] } })

function mundo(o: { semilla?: Semilla; estado?: EncargoDeConversa['estado']; arts?: Record<string, Record<string, unknown>>; espera?: Partial<EsperaDeFinanzas> | null; slackTs?: string | null; mensajes?: Array<{ ts: string; texto: string }>; registrar?: Record<string, unknown>; despierta?: boolean; pausaEncendida?: boolean } = {}) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cli', estado: o.estado ?? 'esperando_al_dueno', estado_del_motor: estadoInicial(), gasto_usd: 1.2, slack_canal: o.slackTs ? 'C123456789' : null, slack_ts: o.slackTs ?? null, leido_hasta: o.slackTs ?? null, tablero_id: null, dry_run: false, semilla: { corrida: 'cor-1', ...(o.semilla ?? {}) } }
  const arts: Record<string, Record<string, unknown>> = { ...acuerdo(), ...(o.arts ?? {}) }
  const guardados: Array<Record<string, unknown>> = [], avisos: string[] = [], enviados: string[] = [], despertares: Array<Record<string, unknown>> = [], enHilo: string[] = [], corridasPausadas: string[] = []
  let llamadasModelo = 0
  const mensajes = [...(o.mensajes ?? [])]
  let materialGuardado: unknown = null
  let espera: EsperaDeFinanzas | null = o.espera === null || o.espera === undefined ? null : { id: 'esp-1', client_id: 'cli', encargo_id: 'enc-1', corrida: 'plan-x', estado: 'esperando', sobre: { corrida: 'plan-x', client_id: 'cli' }, despertado: null, intentos_de_despertar: 0, ...o.espera }
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar(c) { guardados.push(structuredClone(c) as never); if (c.estado) e.estado = c.estado; e.estado_del_motor = c.estado_del_motor },
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
  const P: PuertosDePausa = {
    almacen,
    modo: 'envia',
    canal: 'C123456789',
    ahora: () => new Date('2026-11-04T16:00:00Z'),
    avisar: async (t) => { avisos.push(t) },
    cerebro: { async registrarPregunta() { return (o.registrar ?? { ok: true, estado: 'registrada', pregunta_id: 'p1' }) as never }, async registrarRespuesta() { return { ok: true } } },
    slack: {
      async enviarAlDueno(t: string) { enviados.push(t); return { ok: true as const, canal: 'C123456789', ts: '100.1' } },
      async enHilo(_c: string, _t: string, x: string) { enHilo.push(x); return { ok: true as const } },
      async publicar() { return { ok: false } },
      async leer(x: { desde_ts: string | null }) { return { ok: true as const, mensajes: [...mensajes], leido_hasta: x.desde_ts } },
    } as never,
    esperas: {
      async guardar(f) { if (espera) return { ok: true, id: espera.id, nueva: false }; espera = { id: 'esp-1', client_id: f.client_id, encargo_id: f.encargo_id, corrida: String(f.sobre.corrida), estado: 'esperando', sobre: f.sobre, despertado: null, intentos_de_despertar: 0 }; materialGuardado = f.material; return { ok: true, id: 'esp-1', nueva: true } },
      async delEncargo() { return espera && { ...espera } },
      async soltar() { if (!espera || espera.estado !== 'esperando') return false; espera.estado = 'soltada'; return true },
      async marcarDespertar(_i, d, n) { if (espera) { espera.despertado = d; espera.intentos_de_despertar = n } },
      async pausarCorrida(id) { corridasPausadas.push(id) },
    },
    despertar: async (c) => { despertares.push(c); return o.despierta === false ? { ok: false, error: 'el plan contestó 502' } : { ok: true } },
  }
  const C: PuertosDeConversa = {
    almacen, ahora: P.ahora, canalDelHilo: '', emilio_id: 'U1', tableros: {} as never,
    modelo: { async invocar() { llamadasModelo++; return { ok: false, error: 'no debía llamarse', costo_usd: 0 } } } as never,
    slack: { async publicar() { return { ok: false } }, async leer(x: { desde_ts: string | null }) { return { ok: false, mensajes: [], leido_hasta: x.desde_ts } } },
    config: async () => ({ estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'envia', conversa: 'enciende', pausa_al_dueno: o.pausaEncendida !== false }),
  }
  return { e, arts, P, C, guardados, avisos, enviados, despertares, enHilo, corridasPausadas, mensajes, modelo: () => llamadasModelo, espera: () => espera, material: () => materialGuardado }
}

describe('cuándo pausa', () => {
  const enc = (semilla: Semilla = {}, dry_run = false) => ({ dry_run, semilla }) as unknown as EncargoDeConversa
  it('🔴 con críticos abiertos y preguntas sin contestar', () => expect(debePausar(enc(), acuerdo())).toBe(true))
  it('🔴 sin críticos no espera: ya puede firmar', () => expect(debePausar(enc(), acuerdo(CINCO, 0))).toBe(false))
  it('🔴 con críticos pero sin preguntas no espera: no hay nada que contestar', () => expect(debePausar(enc(), acuerdo([]))).toBe(false))
  it('🔴 si ninguna frena la firma, no espera', () => expect(debePausar(enc(), acuerdo([preg('a', { impacto: 'bajo' })]))).toBe(false))
  it('🔴 en seco no le pregunta a nadie', () => expect(debePausar(enc({}, true), acuerdo())).toBe(false))
  it('🔴 tras la ronda 2 no vuelve a pausar, aunque quede un crítico', () => expect(debePausar(enc(), { ...acuerdo(), acuerdo_2: { criticos: 1, preguntas_a_emilio: CINCO } })).toBe(false))
  it('🔴 si ya atendió la ronda, lo que no contestó no vuelve a detener el plan', () => expect(debePausar(enc({ pausa_atendida: true }), acuerdo())).toBe(false))
  it('🔴 ya contestadas todas, sigue', () => {
    const respuestas_del_dueno = CINCO.map((p) => ({ clave: p.clave, valor: 'x', literal: 'x' }))
    expect(debePausar(enc({ respuestas_del_dueno }), acuerdo())).toBe(false)
  })
  it('🔴 falta una: sigue esperando esa', () => {
    expect(preguntasQueFaltan(acuerdo([preg('a'), preg('b')]), { respuestas_del_dueno: [{ clave: 'a', valor: 1, literal: '1' }] })).toEqual(['b'])
  })
})

describe('avanzar', () => {
  it('🔴 detiene la oficina tras el cierre, sin llamar a nadie ni gastar', async () => {
    const m = mundo({ estado: 'en_curso' })
    const r = await avanzar(m.C, 'enc-1')
    expect(r.cuerpo).toMatchObject({ estado: 'esperando_al_dueno', esperando: true, terminado: false })
    expect(m.e.estado).toBe('esperando_al_dueno')
    expect(m.modelo()).toBe(0)
  })
  it('🔴 con la pausa apagada, todo sigue como hoy', async () => {
    const m = mundo({ estado: 'en_curso', pausaEncendida: false })
    const r = await avanzar(m.C, 'enc-1')
    expect(r.cuerpo.esperando).toBeUndefined()
    expect(m.e.estado).not.toBe('esperando_al_dueno')
  })
  it('🔴 en pausa contesta lo mismo y no gasta; cerrar por plazo tampoco la rompe', async () => {
    const m = mundo()
    expect((await avanzar(m.C, 'enc-1')).cuerpo).toMatchObject({ esperando: true })
    expect((await cerrarPorPlazo(m.C, 'enc-1')).cuerpo).toMatchObject({ esperando: true })
    expect(m.e.estado).toBe('esperando_al_dueno')
    expect(m.modelo()).toBe(0)
  })
  it('🔴 aunque ya estén contestadas: la suelta el vigía, no una llamada a avanzar', async () => {
    const m = mundo({ semilla: { respuestas_del_dueno: CINCO.map((p) => ({ clave: p.clave, valor: 'x', literal: 'x' })) } })
    expect((await avanzar(m.C, 'enc-1')).cuerpo).toMatchObject({ esperando: true })
    expect(m.e.estado).toBe('esperando_al_dueno')
  })
})

describe('las preguntas de una pausa', () => {
  it('🔴 salen TODAS las que frenan la firma, con las críticas primero', () => {
    const p = prepararPreguntas(acuerdo(), {}, { pausa: true })
    expect(p.aprobadas.map((q) => q.clave)).toEqual(['whatsapp', 'pixel', 'comision', 'turistas', 'temporada'])
    expect(p.sobrantes).toEqual([])
  })
  it('🔴 fuera de una pausa sigue el tope de 3', () => {
    expect(prepararPreguntas(acuerdo()).aprobadas).toHaveLength(3)
  })
  it('🔴 el mensaje dice que el plan espera y no promete un «si no respondes»', () => {
    const m = armarMensaje({ cliente: 'Náufrago', preguntas: CINCO as never, pausa: true })
    expect(m.ok).toBe(true)
    if (m.ok) {
      expect(m.texto).toContain('El plan queda en pausa hasta que contestes.')
      expect(m.texto).not.toContain('Si no respondes')
      expect(m.supuestos).toBeUndefined()
    }
  })
  it('🔴 fuera de una pausa, el mensaje de siempre', () => {
    const m = armarMensaje({ cliente: 'Náufrago', preguntas: CINCO.slice(0, 2) as never })
    expect(m.ok && m.texto).toContain('Si no respondes')
    expect(m.ok && m.texto).not.toContain('en pausa')
  })
})

describe('pausar', () => {
  const pedir = (o: Record<string, unknown> = {}) => ({ encargo_id: 'enc-1', sobre: { corrida: 'plan-x', client_id: 'cli' }, material: { junta: 1 }, workflow_id: 'wf', workflow_execution_id: 'ex', ...o })
  it('🔴 guarda el pedido y el material, deja la corrida en pausa y pregunta', async () => {
    const m = mundo()
    const r = await pausarOficina(m.P, pedir())
    expect(r.cuerpo).toMatchObject({ pausado: true, espera_id: 'esp-1', enviado: true })
    expect(m.corridasPausadas).toEqual(['cor-1'])
    expect(m.enviados).toHaveLength(1)
    expect(m.material()).toEqual({ junta: 1 })
    expect(m.despertares).toEqual([])
  })
  it('🔴 los topes de envío no la frenan', async () => {
    const m = mundo()
    m.P.almacen.contarBuzon = async () => ({ cliente_24h: 9, hoy: 9 })
    expect((await pausarOficina(m.P, pedir())).cuerpo.enviado).toBe(true)
  })
  it('🔴 una pregunta pendiente de otra corrida se hace igual: su respuesta llegaría a otro encargo', async () => {
    const m = mundo({ registrar: { ok: true, estado: 'ya_preguntada' } })
    expect((await pausarOficina(m.P, pedir())).cuerpo.enviado).toBe(true)
    expect(m.enviados).toHaveLength(1)
  })
  it('🔴 si no pudo salir avisa UNA vez y sigue en pausa', async () => {
    const m = mundo({ registrar: { ok: false, error: 'http_500' } })
    await pausarOficina(m.P, pedir())
    await atenderPausa(m.P, 'enc-1')
    await atenderPausa(m.P, 'enc-1')
    expect(m.avisos).toHaveLength(1)
    expect(m.e.estado).toBe('esperando_al_dueno')
    expect(m.despertares).toEqual([])
  })
  it('🔴 el cerebro ya tenía todas las respuestas: no espera a nadie', async () => {
    const m = mundo({ registrar: { ok: true, estado: 'ya_respondida', respuestas: [{ respuesta: 'ya lo dije' }] } })
    const r = await pausarOficina(m.P, pedir())
    expect(m.enviados).toEqual([])
    expect(r.cuerpo.soltada).toBe(true)
    expect(m.despertares).toHaveLength(1)
  })
  it('🔴 rechaza un encargo que no está en pausa o un pedido incompleto', async () => {
    expect((await pausarOficina(mundo({ estado: 'en_curso' }).P, pedir())).status).toBe(409)
    expect((await pausarOficina(mundo().P, pedir({ material: 'x' }))).status).toBe(400)
    expect((await pausarOficina(mundo().P, pedir({ sobre: {} }))).status).toBe(400)
    expect((await pausarOficina(mundo().P, pedir({ material: { x: 'y'.repeat(MAX_MATERIAL) } }))).status).toBe(413)
  })
})

describe('la respuesta suelta la pausa', () => {
  const TODAS = CINCO.map((_, i) => `${i + 1}: ${i + 100}`).join('\n')
  it('🔴 sin respuesta sigue esperando, sin despertar a nadie', async () => {
    const m = mundo({ espera: {}, slackTs: '100.1', arts: { buzon_respuestas: { n: 1, claves: CINCO.map((p) => p.clave), preguntas: [] } } })
    const r = await atenderPausa(m.P, 'enc-1')
    expect(r.cuerpo.esperando).toBe(true)
    expect(m.despertares).toEqual([])
  })
  it('🔴 con todas contestadas vuelve UNA vez con su mismo pedido y el encargo sigue en curso', async () => {
    const m = mundo({ espera: {}, slackTs: '100.1', mensajes: [{ ts: '200.1', texto: TODAS }], arts: { buzon_respuestas: { n: 1, claves: CINCO.map((p) => p.clave), preguntas: [] } } })
    const r = await atenderPausa(m.P, 'enc-1')
    expect(r.cuerpo).toMatchObject({ soltada: true, despertado: true })
    expect(m.e.estado).toBe('en_curso')
    expect(m.despertares).toEqual([{ corrida: 'plan-x', client_id: 'cli', reanudar_esperas_id: 'esp-1' }])
    await atenderPausa(m.P, 'enc-1')
    expect(m.despertares).toHaveLength(1)
  })
  it('🔴 contestó una: espera mientras escribe y, en la vuelta siguiente sin nada nuevo, el plan sigue (Emilio, 15:37Z)', async () => {
    const m = mundo({ espera: {}, slackTs: '100.1', mensajes: [{ ts: '200.1', texto: '1: 100' }], arts: { buzon_respuestas: { n: 1, claves: CINCO.map((p) => p.clave), preguntas: [] } } })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo.esperando).toBe(true)
    expect(m.despertares).toEqual([])
    m.mensajes.length = 0
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ soltada: true, despertado: true })
    expect(m.e.semilla.pausa_atendida).toBe(true)
    expect(m.despertares).toHaveLength(1)
  })
  it('🔴 sin ninguna respuesta sigue esperando, en todas las vueltas', async () => {
    const m = mundo({ espera: {}, slackTs: '100.1', arts: { buzon_respuestas: { n: 1, claves: CINCO.map((p) => p.clave), preguntas: [] } } })
    for (let i = 0; i < 3; i++) expect((await atenderPausa(m.P, 'enc-1')).cuerpo.esperando).toBe(true)
    expect(m.despertares).toEqual([])
  })
  it('🔴 un texto sin número con varias abiertas: pide el número, una sola vez', async () => {
    const claves = CINCO.map((p) => p.clave)
    const m = mundo({ espera: {}, slackTs: '100.1', mensajes: [{ ts: '200.1', texto: 'te respondo que todavía lo estoy viendo' }], arts: { buzon_respuestas: { n: 1, claves, preguntas: [] } } })
    await atenderPausa(m.P, 'enc-1')
    await atenderPausa(m.P, 'enc-1')
    expect(m.enHilo).toHaveLength(1)
    expect(m.enHilo[0]).toContain('«1: 200»')
  })
  it('🔴 si el plan no recibe el pedido reintenta con tope y avisa al final', async () => {
    const m = mundo({ espera: { estado: 'soltada' }, despierta: false })
    for (let i = 0; i < MAX_INTENTOS_DE_DESPERTAR + 2; i++) await atenderPausa(m.P, 'enc-1')
    expect(m.despertares).toHaveLength(MAX_INTENTOS_DE_DESPERTAR)
    expect(m.avisos).toHaveLength(1)
  })
  it('🔴 una espera reemplazada no despierta a nadie', async () => {
    const m = mundo({ espera: { estado: 'reemplazada' } })
    await atenderPausa(m.P, 'enc-1')
    expect(m.despertares).toEqual([])
  })
  it('🔴 sin espera es el buzón de siempre', async () => {
    const m = mundo({ estado: 'cerrado', espera: null })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ recogido: false, motivo: 'sin_md_abierto' })
  })
  it('🔴 una lectura fallida de la espera no se lee como «no hay espera»', async () => {
    const m = mundo({ espera: {} })
    m.P.esperas.delEncargo = async () => { throw new Error('caída') }
    await expect(atenderPausa(m.P, 'enc-1')).rejects.toThrow('caída')
  })
  it('🔴 despertar llama a la puerta del plan con la llave interna, y dice si no pudo', async () => {
    const llamadas: Array<[string, RequestInit]> = []
    const f = (async (u: string, i: RequestInit) => { llamadas.push([u, i]); return { ok: true, status: 200 } }) as never
    expect(await despertarPorElFlujo({ base: 'https://n8n.x/', llave: 'k', fetchImpl: f })({ a: 1 })).toEqual({ ok: true })
    expect(llamadas[0][0]).toBe('https://n8n.x/webhook/zero-risk/planeacion')
    expect((llamadas[0][1].headers as Record<string, string>)['x-api-key']).toBe('k')
    expect((await despertarPorElFlujo({ fetchImpl: f })({})).ok).toBe(false)
  })
})

describe('el jefe vuelve a cerrar y lee al dueño', () => {
  const orq = fs.readFileSync('src/lib/finanzas/conversa/orquestador.ts', 'utf8')
  it('🔴 la huella no basta: con respuesta del dueño hay segundo cierre', () => {
    expect(orq).toContain('huella !== previo?.huella || contesto')
  })
  it('🔴 lo que el dueño escribió suelto llega a los agentes', async () => {
    const pedidos: string[] = []
    const m = mundo({ estado: 'en_curso', pausaEncendida: false, arts: { expediente: {}, buzon_respuestas: { n: 2, notas: [{ ts: '1.1', literal: 'ojo con la temporada' }] } } })
    m.C.modelo = { async invocar(p: { tarea: string }) { pedidos.push(p.tarea); return { ok: false, error: 'corte', costo_usd: 0 } } } as never
    await avanzar(m.C, 'enc-1') // la apertura
    await avanzar(m.C, 'enc-1') // el planteo
    expect(pedidos[0]).toContain('ojo con la temporada')
    expect(pedidos[0]).toContain('no es un dato confirmado')
  })
})

describe('tope y manual', () => {
  it('🔴 la corrida del plan nace con US$ 5; lo demás, con el piso de siempre', async () => {
    const nacidas: Semilla[] = []
    const m = mundo({ estado: 'en_curso' })
    m.C.almacen.crearEncargo = async (n) => { nacidas.push(n.semilla); return { ok: true, encargo: m.e, nuevo: true } }
    await abrirConversacion(m.C, { client_id: 'cli', dry_run: false, trabajo_id: 'cor-1', semilla: {} })
    await abrirConversacion(m.C, { client_id: 'cli', dry_run: false, semilla: {} })
    expect(topeEfectivoDelEncargo(nacidas[0])).toBe(5)
    expect(topeEfectivoDelEncargo(nacidas[1])).toBe(1.5)
  })
  it('🔴 el encargo llega hasta US$ 5 sin firma aparte, y no más', () => {
    expect(TOPE_MAXIMO_POR_ENCARGO_USD).toBe(5)
    expect(topeEfectivoDelEncargo({ tope_encargo_usd: 5 })).toBe(5)
    expect(topeEfectivoDelEncargo({ tope_encargo_usd: 9 })).toBe(5)
  })
  it('🔴 la semilla admite el manual entero, y el límite es el del pedido', async () => {
    const m = mundo({ estado: 'en_curso' })
    m.C.almacen.crearEncargo = async (n) => ({ ok: true, encargo: { ...m.e, semilla: n.semilla }, nuevo: true })
    expect((await abrirConversacion(m.C, { client_id: 'cli', dry_run: false, semilla: { manual_completo: 'x'.repeat(60_000) } })).status).toBe(200)
    expect((await abrirConversacion(m.C, { client_id: 'cli', dry_run: false, semilla: { manual_completo: 'x'.repeat(700_000) } })).status).toBe(413)
  })
  it('🔴 toda la oficina lo recibe en la apertura', async () => {
    const m = mundo({ estado: 'en_curso', pausaEncendida: false, semilla: { manual_completo: { voz: 'cercana' } }, arts: { acuerdo: {} } })
    delete (m.arts as Record<string, unknown>).acuerdo
    const r: Respuesta = await avanzar(m.C, 'enc-1')
    expect(r.cuerpo.paso).toBe('abrir')
    const g = m.guardados[0] as { artefacto: { contenido: { manual_completo: unknown } } }
    expect(g.artefacto.contenido.manual_completo).toEqual({ voz: 'cercana' })
  })
})

describe('el pre-vuelo al volver', () => {
  const fila = (estado: string) => ({ id: 'cor-1', client_id: 'cliente-1', corrida: 'plan-x', estado, espera_desde: '2026-11-04T13:00:00Z', vence_en: '2026-11-04T14:00:00Z', intentos: 0, motivo: null, dry_run: false, actualizado_en: 'x' })
  const puertos = (estado: string, espera: unknown = { client_id: 'cliente-1', corrida: 'plan-x', estado: 'soltada', creado_en: '2026-11-04T13:00:00Z' }) => {
    const f = fila(estado) as ReturnType<typeof fila>
    let cupo = 0
    return {
      leidoCupo: () => cupo,
      f,
      P: {
        ahora: () => new Date('2026-11-05T10:00:00Z'),
        catalogo: async () => ({ ok: true, snapshot: { monedaDePais: () => 'USD', tope: () => 1, filas: { fuentes: [] } } }),
        ficha: async () => ({ ok: true, existe: true, manual_vigente: true, manual_version: 5, moneda_declarada: 'USD', pais: 'EC' }),
        cupo: async () => { cupo++; return { ok: true, cap_usd: 0, generico_usd: 0, override_usd: null, gastado_24h_usd: 99 } },
        senal: async () => ({ ok: true, senal: { listo: true, completando: false, motivo: '', desde: null, huecos: [] } }),
        esperaDeReanudacion: async () => espera,
        corridas: {
          ahora: () => new Date('2026-11-05T10:00:00Z'), leer: async () => f, activaDe: async () => null, insertarUnaVez: async () => ({ creada: false, fila: f }), vivasVencidas: async () => [],
          avanzarSi: async (_c: string, _r: string, _i: number, c: Record<string, unknown>) => { Object.assign(f, c); return f },
        },
      } as never,
    }
  }
  const pedir = (id: unknown = 'esp-1') => ({ client_id: 'cliente-1', corrida: 'plan-x', reanudar_esperas_id: id })
  it('🔴 vuelve con el MISMO corrida_id, sin relleno y sin pedir cupo otra vez', async () => {
    const w = puertos('en_pausa')
    const d = await prevuelo(pedir(), w.P)
    expect(d).toMatchObject({ decision: 'correr', corrida_id: 'cor-1', relleno_permitido: false })
    expect(w.f.estado).toBe('corriendo')
    expect(w.leidoCupo()).toBe(0)
    expect(d.material_viejo).toBeUndefined()
  })
  it('🔴 a los 7 días exactos el material sirve; pasados, se lee de nuevo y el relleno depende del cerebro listo', async () => {
    const espera = (creado_en: string) => ({ client_id: 'cliente-1', corrida: 'plan-x', estado: 'soltada', creado_en })
    expect((await prevuelo(pedir(), puertos('en_pausa', espera('2026-10-29T10:00:00Z')).P)).material_viejo).toBeUndefined()
    const d = await prevuelo(pedir(), puertos('en_pausa', espera('2026-10-29T09:59:00Z')).P)
    expect(d).toMatchObject({ decision: 'correr', material_viejo: true, relleno_permitido: true, corrida_id: 'cor-1' })
  })
  it('🔴 un segundo disparo no corre otro plan', async () => {
    expect((await prevuelo(pedir(), puertos('corriendo').P)).decision).toBe('ya_en_marcha')
  })
  it('🔴 una corrida ya terminada no revive', async () => {
    expect((await prevuelo(pedir(), puertos('fallida').P)).decision).toBe('terminada')
  })
  it('🔴 una espera ajena, sin soltar o inválida no pasa', async () => {
    for (const espera of [null, { client_id: 'otro', corrida: 'plan-x', estado: 'soltada' }, { client_id: 'cliente-1', corrida: 'otra', estado: 'soltada' }, { client_id: 'cliente-1', corrida: 'plan-x', estado: 'esperando' }]) {
      expect((await prevuelo(pedir(), puertos('en_pausa', espera).P)).motivo).toBe('espera_invalida')
    }
    expect((await prevuelo(pedir(123), puertos('en_pausa').P)).motivo).toBe('espera_invalida')
  })
  it('🔴 un re-disparo sin la espera no suelta la pausa', async () => {
    const w = puertos('en_pausa')
    const P = w.P as { cupo: () => Promise<unknown>; catalogo: () => Promise<unknown> }
    P.cupo = async () => ({ ok: true, cap_usd: 100, generico_usd: 100, override_usd: null, gastado_24h_usd: 0 })
    const d = await prevuelo({ client_id: 'cliente-1', corrida: 'plan-x' }, { ...w.P as object, catalogo: async () => ({ ok: true, snapshot: { monedaDePais: () => 'USD', tope: () => 0, filas: { fuentes: [] } } }) } as never)
    expect(d.decision).toBe('ya_en_marcha')
    expect(w.f.estado).toBe('en_pausa')
  })
})

describe('la migración', () => {
  const sql = fs.readFileSync('supabase/migrations/202611041600_finanzas_pausa_al_dueno.sql', 'utf8')
  it('🔴 nace apagada y `en_pausa` no entra al índice de una activa por cliente', () => {
    expect(sql).toContain('pausa_al_dueno boolean not null default false')
    expect(sql).toContain("'en_pausa'")
    expect(sql).toContain('sobre_de_reanudacion jsonb')
    expect(sql).not.toContain('plan_corridas_una_activa_por_cliente')
  })
  it('🔴 sube el cupo de la oficina a 5 sin borrar el historial', () => {
    expect(sql).toMatch(/plan_catalogo_topes[\s\S]*vigente = false/)
  })
})

// para que el tipo del buzón siga siendo la base de los puertos de la pausa
export type _Base = PuertosDelBuzon
