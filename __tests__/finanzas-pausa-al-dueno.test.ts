/**
 * 04-nov · LA PAUSA DE LA OFICINA FINANCIERA. Lo que pasó en la corrida `2c0d2236`: el jefe dejó 3 críticos y 5 preguntas, salieron 3 (no las de los críticos), el plan siguió sin firma y la respuesta ya no le servía a nadie.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { prepararPreguntas, preguntarAlDueno, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { armarMensaje } from '../src/lib/finanzas/preguntas'
import { TOPE_REAL_DEL_PEDIDO } from '../src/lib/limites-de-tamano'
import { pedidoDelAgente, avanzar, abrirConversacion, cerrarPorPlazo, debePausar, preguntasQueFaltan, topeEfectivoDelEncargo, TOPE_MAXIMO_POR_ENCARGO_USD, type Respuesta } from '../src/lib/finanzas/conversa/orquestador'
import { atenderPausa, MARGEN_PARA_ARRANCAR_MIN, MAX_INTENTOS_DE_DESPERTAR, MAX_MATERIAL, pausarOficina, responderEnLaOficina, type EsperaDeFinanzas, type PuertosDePausa } from '../src/lib/finanzas/conversa/pausa'
import { elDuenoRecibePreguntas } from '../src/lib/finanzas/preguntas'
import { despertarPorElFlujo, esperasDeFinanzas } from '../src/lib/finanzas/conversa/esperas-supabase'
import { despertarDelEntorno, puertosDePausa } from '../src/lib/finanzas/conversa/puertos-de-pausa'
import type { AlmacenDeConversa, EncargoDeConversa, PuertosDeConversa, Semilla } from '../src/lib/finanzas/conversa/puertos'
import { prevuelo } from '../src/lib/planeacion/prevuelo'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { rutaDueno, rutaLeerDueno } from '../src/lib/portero-alimenta/dueno'
import { cerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../src/lib/portero-alimenta/__tests__/diez-clientes.fixtures'
import { tablasDe } from '../src/lib/portero-alimenta/__tests__/diez-clientes.tablas'
import { ON } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'

const preg = (clave: string, o: Record<string, unknown> = {}) => ({ clave, texto: `¿Pregunta sobre ${clave.replace(/_/g, ' ')}?`, recomendacion: 'Lo que te conviene hacer.', supuesto_si_no_responde: 'Lo que supongo sin tu respuesta.', impacto: 'alto', ...o })
const CINCO = [preg('comision'), preg('turistas'), preg('temporada'), preg('whatsapp', { frena_la_firma: true }), preg('pixel', { frena_la_firma: true })]
const acuerdo = (preguntas: unknown[] = CINCO, criticos = 3) => ({ acuerdo: { criticos, requiere_ronda_2: criticos > 0, preguntas_a_emilio: preguntas, hallazgos: [] } })

function mundo(o: { semilla?: Semilla; estado?: EncargoDeConversa['estado']; arts?: Record<string, Record<string, unknown>>; espera?: Partial<EsperaDeFinanzas> | null; slackTs?: string | null; mensajes?: Array<{ ts: string; texto: string }>; registrar?: Record<string, unknown>; modo?: PuertosDePausa['modo']; despierta?: boolean; corrida?: { estado: string | null; otra_activa: boolean } | 'caida'; pausaEncendida?: boolean; cerebroCaido?: boolean; hora?: string } = {}) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cli', estado: o.estado ?? 'esperando_al_dueno', estado_del_motor: estadoInicial(), gasto_usd: 1.2, slack_canal: o.slackTs ? 'C123456789' : null, slack_ts: o.slackTs ?? null, leido_hasta: o.slackTs ?? null, tablero_id: null, dry_run: false, semilla: { corrida: 'cor-1', ...(o.semilla ?? {}) } }
  const arts: Record<string, Record<string, unknown>> = { ...acuerdo(), ...(o.arts ?? {}) }
  const guardados: Array<Record<string, unknown>> = [], avisos: string[] = [], enviados: string[] = [], despertares: Array<Record<string, unknown>> = [], enHilo: string[] = [], corridasPausadas: string[] = []
  let llamadasModelo = 0
  const alCerebro: Array<Record<string, unknown>> = []
  const mensajes = [...(o.mensajes ?? [])]
  let materialGuardado: unknown = null
  let espera: EsperaDeFinanzas | null = o.espera === null || o.espera === undefined ? null : { id: 'esp-1', client_id: 'cli', encargo_id: 'enc-1', corrida: 'plan-x', estado: 'esperando', sobre: { corrida: 'plan-x', client_id: 'cli' }, despertado: null, intentos_de_despertar: 0, despertado_en: null, ...o.espera }
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
    modo: o.modo ?? 'envia',
    canal: 'C123456789',
    ahora: () => new Date(o.hora ?? '2026-11-04T16:00:00Z'),
    avisar: async (t) => { avisos.push(t) },
    cerebro: { async registrarPregunta() { return (o.registrar ?? { ok: true, estado: 'registrada', pregunta_id: 'p1' }) as never }, async leerRespuestas() { return { ok: true as const, respuestas: [] } }, async cerrarPendiente() { return { ok: true as const } }, async registrarRespuesta(r) { alCerebro.push(r as never); return o.cerebroCaido ? { ok: false, error: 'http_500' } : { ok: true } } },
    slack: {
      async enviarAlDueno(t: string) { enviados.push(t); return { ok: true as const, canal: 'C123456789', ts: '100.1' } },
      async enHilo(_c: string, _t: string, x: string) { enHilo.push(x); return { ok: true as const } },
      async publicar() { return { ok: false } },
      async leer(x: { desde_ts: string | null }) { return { ok: true as const, mensajes: [...mensajes], leido_hasta: x.desde_ts } },
    } as never,
    esperas: {
      async guardar(f) { if (espera) return { ok: true, id: espera.id, nueva: false }; espera = { id: 'esp-1', despertado_en: null, client_id: f.client_id, encargo_id: f.encargo_id, corrida: String(f.sobre.corrida), estado: 'esperando', sobre: f.sobre, despertado: null, intentos_de_despertar: 0 }; materialGuardado = f.material; return { ok: true, id: 'esp-1', nueva: true } },
      async delEncargo() { return espera && { ...espera } },
      async vivaDelCliente(c) { return espera && espera.estado === 'esperando' && espera.client_id === c ? { ...espera } : null },
      async soltar() { if (!espera || espera.estado !== 'esperando') return false; espera.estado = 'soltada'; return true },
      async marcarDespertar(_i, d, n) { if (espera) { espera.despertado = d; espera.intentos_de_despertar = n; espera.despertado_en = P.ahora().toISOString() } },
      async estadoDeLaCorrida() { if (o.corrida === 'caida') throw new Error('caída'); return o.corrida ?? { estado: 'corriendo', otra_activa: false } },
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
  return { e, arts, P, C, guardados, avisos, enviados, despertares, enHilo, corridasPausadas, alCerebro, mensajes, modelo: () => llamadasModelo, espera: () => espera, material: () => materialGuardado }
}

describe('el pedido a un empleado de finanzas', () => {
  const PASO = { clave: 'fpa' } as never
  it('🔴 si no cabe, llega declarado y sin pasarse del tope', () => {
    const t = pedidoDelAgente(PASO, { datos: 'x'.repeat(TOPE_REAL_DEL_PEDIDO + 10) })
    expect(t).toHaveLength(TOPE_REAL_DEL_PEDIDO)
    expect(t.endsWith('decláralo.]')).toBe(true)
    expect(t).toContain('LLEGA RECORTADO')
  })
  it('si cabe, sin aviso', () => {
    const t = pedidoDelAgente(PASO, { datos: 'x' })
    expect(t).not.toContain('LLEGA RECORTADO')
  })
  it('el borde: lo que cabe justo entra entero', () => {
    const vacio = pedidoDelAgente(PASO, { datos: '' })
    const t = pedidoDelAgente(PASO, { datos: 'x'.repeat(TOPE_REAL_DEL_PEDIDO - vacio.length) })
    expect(t).toHaveLength(TOPE_REAL_DEL_PEDIDO)
    expect(t).not.toContain('LLEGA RECORTADO')
  })
})

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
  it('🔴 si otra llamada ya la soltó, esta no despierta al plan otra vez', async () => {
    const m = mundo({ espera: {}, slackTs: '100.1', mensajes: [{ ts: '200.1', texto: TODAS }], arts: { buzon_respuestas: { n: 1, claves: CINCO.map((p) => p.clave), preguntas: [] } } })
    m.P.esperas.soltar = async () => false
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ soltada: false })
    expect(m.despertares).toEqual([])
    expect(m.e.estado).toBe('esperando_al_dueno')
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
  it('🔴 despertar llama a la puerta del plan con la llave de despacho, nunca con la interna, y dice si no pudo', async () => {
    const llamadas: Array<[string, RequestInit]> = []
    const f = (async (u: string, i: RequestInit) => { llamadas.push([u, i]); return { ok: true, status: 200 } }) as never
    expect(await despertarPorElFlujo({ base: 'https://n8n.x/', llave: 'k', fetchImpl: f })({ a: 1 })).toEqual({ ok: true })
    expect(llamadas[0][0]).toBe('https://n8n.x/webhook/zero-risk/planeacion')
    expect((llamadas[0][1].headers as Record<string, string>)['x-sala-dispatch-key']).toBe('k')
    expect((llamadas[0][1].headers as Record<string, string>)['x-api-key']).toBeUndefined()
    expect((await despertarPorElFlujo({ fetchImpl: f })({})).ok).toBe(false)
  })
})

describe('la pausa sin Slack (05-nov · decisión de Emilio)', () => {
  const pedirPausa = { encargo_id: 'enc-1', sobre: { corrida: 'plan-x', client_id: 'cli' }, material: { a: 1 }, workflow_id: 'wf', workflow_execution_id: 'ex' }
  it('🔴 pausa, registra la pregunta, no toca Slack y no avisa de ningún fallo', async () => {
    const m = mundo({ modo: 'registra' })
    const r = await pausarOficina(m.P, pedirPausa)
    expect(r.cuerpo).toMatchObject({ pausado: true, enviado: false, motivo: 'registrada' })
    expect(m.enviados).toEqual([])
    expect(m.avisos).toEqual([])
    expect(m.despertares).toEqual([])
  })
  it('🔴 el vigía no repite ni avisa mientras espera', async () => {
    const m = mundo({ modo: 'registra' })
    await pausarOficina(m.P, pedirPausa)
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ esperando: true })
    expect(m.enviados).toEqual([])
    expect(m.avisos).toEqual([])
  })
  it('🔴 si el cerebro no pudo registrar la pregunta, avisa una sola vez y lo reintenta', async () => {
    const m = mundo({ modo: 'registra', registrar: { ok: false, error: 'http_500' } })
    await pausarOficina(m.P, pedirPausa)
    await atenderPausa(m.P, 'enc-1')
    expect(m.avisos).toHaveLength(1)
    expect(m.arts.buzon_respuestas).toBeUndefined()
  })
  it('🔴 contestando en la oficina, el plan vuelve sin haber pasado por Slack', async () => {
    const m = mundo({ modo: 'registra' })
    await pausarOficina(m.P, pedirPausa)
    for (const tema of preguntasQueFaltan(m.arts, m.e.semilla).map((c) => c.replace(/_/g, ' '))) await responderEnLaOficina(m.P, { client_id: 'cli', tema, respuesta: 'sí, ya lo tengo', quien: 'emilio' })
    expect(m.despertares).toHaveLength(1)
    expect(m.enviados).toEqual([])
    expect(m.enHilo).toEqual([])
  })
  it('🔴 la pregunta queda rotulada como de Tu oficina, y con Slack sigue su rótulo', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_u: string, i: RequestInit) => { cuerpos.push(JSON.parse(String(i.body))); return { status: 200, json: async () => ({ ok: true, registrada: true }) } }) as never
    const env = { INTERNAL_API_KEY: 'k', FINANZAS_CANAL_PREGUNTAS: 'C123456789' }
    try {
      const q = { client_id: 'c', tema: 't', pregunta: 'p' }
      await puertosDePausa(env, new DbFalsa() as never, 'registra', 'wf', 'ex').cerebro.registrarPregunta(q)
      await puertosDePausa(env, new DbFalsa() as never, 'envia', 'wf', 'ex').cerebro.registrarPregunta(q)
    } finally { globalThis.fetch = original }
    expect(cuerpos[0].canal).toBe('dashboard · Tu oficina')
    expect(String(cuerpos[1].canal)).toContain('buzon-de-preguntas')
    const ruta = fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8')
    expect(ruta).toContain("cfg.preguntas_slack === 'registra' ? { canal_etiqueta: ETIQUETA_DE_TU_OFICINA }")
  })
  it('🔴 la oficina se pausa también en este modo', () => {
    expect(elDuenoRecibePreguntas('registra')).toBe(true)
    expect(elDuenoRecibePreguntas('envia')).toBe(true)
    expect(elDuenoRecibePreguntas('apagado')).toBe(false)
    expect(elDuenoRecibePreguntas('borrador')).toBe(false)
    expect(fs.readFileSync('src/lib/finanzas/conversa/orquestador.ts', 'utf8')).toContain('cfg.pausa_al_dueno === true && elDuenoRecibePreguntas(cfg.preguntas_slack)')
  })
})

describe('sin Slack, con la puerta real del cerebro (hallazgos de CC7 en #918)', () => {
  const armar = (o: { preguntas?: unknown[]; semilla?: Semilla; caido?: () => boolean } = {}) => {
    const c = DIEZ_CLIENTES[0]
    let hora = new Date('2026-11-05T12:00:00Z').getTime()
    const t: Record<string, Array<Record<string, unknown>>> = { ...(tablasDe(c) as unknown as Record<string, Array<Record<string, unknown>>>), cerebro_dueno_preguntas: [] }
    const base = crearBaseFalsa(t as never, { reloj: () => new Date(hora).toISOString() })
    let n = 0
    const deps = () => ({ db: base.db, interruptores: ON, ahora: new Date(hora), activo: true, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }) as never
    const fetchF = async (u: string, i: RequestInit) => {
      if (o.caido?.()) return { status: 500, json: async () => ({ error: 'caída' }) }
      const q = new URL(u).searchParams
      const r = i.method === 'GET' ? await rutaLeerDueno({ db: base.db, ahora: new Date(hora) } as never, { client_id: q.get('client_id') ?? '', tema: q.get('tema') }) : await rutaDueno(deps(), JSON.parse(String(i.body)))
      return { status: r.status, json: async () => r.body }
    }
    const m = mundo({ modo: 'registra', semilla: o.semilla, arts: acuerdo((o.preguntas ?? [preg('whatsapp'), preg('pixel')]) as typeof CINCO) })
    m.e.client_id = c.id
    const P = { ...m.P, ahora: () => new Date(hora), cerebro: cerebroDelDueno({ base: 'https://x', llave: 'k', workflow_id: 'wf', workflow_execution_id: 'ex', canal_etiqueta: 'dashboard · Tu oficina', fetch: fetchF as never }) } as PuertosDePausa
    const filas = () => t.cerebro_dueno_preguntas
    const pendientes = () => filas().filter((p) => p.estado === 'pendiente').length
    const pedir = { encargo_id: 'enc-1', sobre: { corrida: 'plan-x', client_id: c.id }, material: { a: 1 }, workflow_id: 'wf', workflow_execution_id: 'ex' }
    return { c, t, m, P, filas, pendientes, pedir, deps, horas: (h: number) => { hora += h * 3_600_000 }, minutos: (x: number) => { hora += x * 60_000 }, hora: () => new Date(hora).toISOString() }
  }
  const contestarPorLaPuerta = (a: ReturnType<typeof armar>, tema: string) => rutaDueno(a.deps(), { evento: 'respuesta', client_id: a.c.id, tema, pregunta: `¿${tema}?`, respuesta: 'sí, por el chat', canal: 'chat de Tu oficina', mensaje_ref: 'chat:1', respondido_en: a.hora(), preguntado_por: { oficina: 'tu-oficina', agente: 'dueno' }, dry_run: false, workflow_id: 't', workflow_execution_id: 'e' })

  it('🔴 una pregunta descartada no vuelve con el vigía', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    expect(a.filas()).toHaveLength(2)
    const d = await rutaDueno(a.deps(), { evento: 'descartar', client_id: a.c.id, pregunta_id: a.filas()[0].id, motivo: 'la descartó', dry_run: false, workflow_id: 't', workflow_execution_id: 'e' })
    expect(d.status).toBe(200)
    for (let i = 0; i < 3; i++) { a.minutos(10); await atenderPausa(a.P, 'enc-1') }
    expect(a.filas()).toHaveLength(2)
    expect(a.pendientes()).toBe(1)
  })
  it('🔴 una pausa de más de 72 horas no duplica, y contestar cierra todo', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    a.horas(73); await atenderPausa(a.P, 'enc-1')
    a.horas(73); await atenderPausa(a.P, 'enc-1')
    expect(a.filas()).toHaveLength(2)
    for (const tema of ['whatsapp', 'pixel']) expect((await responderEnLaOficina(a.P, { client_id: a.c.id, tema, respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ aplicada: true, en_el_cerebro: true, tema_cerrado: true })
    expect(a.pendientes()).toBe(0)
    expect(a.m.despertares).toHaveLength(1)
  })
  it('🔴 dentro de las 72 horas la pregunta queda respondida, no obsoleta', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    for (let i = 0; i < 12; i++) { a.minutos(10); await atenderPausa(a.P, 'enc-1') }
    for (const tema of ['whatsapp', 'pixel']) await responderEnLaOficina(a.P, { client_id: a.c.id, tema, respuesta: 'sí, ya lo tengo', quien: 'emilio' })
    expect(a.filas().map((p) => p.estado)).toEqual(['respondida', 'respondida'])
    expect(a.m.despertares).toHaveLength(1)
  })
  it('🔴 una respuesta por otra puerta espera el margen antes de soltar el plan, y luego lo suelta', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    expect((await contestarPorLaPuerta(a, 'whatsapp')).status).toBe(200)
    a.minutos(1); await atenderPausa(a.P, 'enc-1')
    expect(a.m.despertares).toEqual([])
    expect(a.m.e.semilla.respuestas_del_dueno).toEqual([expect.objectContaining({ clave: 'whatsapp', literal: 'sí, por el chat' })])
    expect(a.m.e.semilla.ultima_respuesta_en).toBe(a.hora())
    a.minutos(14); await atenderPausa(a.P, 'enc-1')
    expect(a.m.despertares).toEqual([])
    a.minutos(2); await atenderPausa(a.P, 'enc-1')
    expect(a.m.despertares).toHaveLength(1)
  })
  it('🔴 sin haber contestado nada, el plan sigue esperando aunque pasen días', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    a.horas(200); await atenderPausa(a.P, 'enc-1')
    expect(a.m.despertares).toEqual([])
  })
  it('🔴 lo que el cerebro ya sabía antes de la pausa no suelta el plan con otra pregunta abierta', async () => {
    const a = armar()
    expect((await contestarPorLaPuerta(a, 'whatsapp')).status).toBe(200)
    expect((await pausarOficina(a.P, a.pedir)).cuerpo).toMatchObject({ pausado: true })
    a.minutos(20); await atenderPausa(a.P, 'enc-1')
    expect(a.m.despertares).toEqual([])
    expect(a.pendientes()).toBe(1)
  })
  it('🔴 con el cerebro caído en la primera vuelta, reintenta y registra una sola vez', async () => {
    let caido = true
    const a = armar({ caido: () => caido })
    await pausarOficina(a.P, a.pedir)
    expect(a.filas()).toEqual([])
    expect(a.m.avisos).toHaveLength(1)
    caido = false
    a.minutos(10); await atenderPausa(a.P, 'enc-1')
    expect(a.filas()).toHaveLength(2)
    a.minutos(10); await atenderPausa(a.P, 'enc-1')
    expect(a.filas()).toHaveLength(2)
  })
  it('🔴 con el cerebro caído después de registrar, ni duplica ni suelta', async () => {
    let caido = false
    const a = armar({ caido: () => caido })
    await pausarOficina(a.P, a.pedir)
    caido = true
    a.minutos(10); await atenderPausa(a.P, 'enc-1')
    expect(a.m.avisos).toHaveLength(1)
    expect(a.m.despertares).toEqual([])
    expect(a.filas()).toHaveLength(2)
  })
  it('🔴 si no se puede leer el registro, no pregunta otra vez', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    const original = a.P.almacen.artefactos
    let n = 0
    a.P.almacen.artefactos = async (id: string) => { if (++n === 2) throw new Error('caída'); return original(id) }
    expect((await preguntarAlDueno(a.P, 'enc-1')).cuerpo).toMatchObject({ motivo: 'registro_ilegible' })
    expect(a.filas()).toHaveLength(2)
  })
  it('🔴 sin pausa, la respuesta le llega al encargo solo si el plan vuelve a preguntar', async () => {
    const a = armar()
    a.m.e.estado = 'en_curso'
    await preguntarAlDueno(a.P, 'enc-1')
    await contestarPorLaPuerta(a, 'whatsapp')
    expect(a.m.e.semilla.respuestas_del_dueno).toBeUndefined()
    expect((await preguntarAlDueno(a.P, 'enc-1')).cuerpo).toMatchObject({ motivo: 'respondidas_en_el_cerebro', usadas_del_cerebro: ['whatsapp'] })
    expect(a.m.e.semilla.respuestas_del_dueno).toHaveLength(1)
  })
  it('🔴 una segunda ronda guarda las claves nuevas sin perder las anteriores', async () => {
    const a = armar({ preguntas: [preg('whatsapp')] })
    await preguntarAlDueno(a.P, 'enc-1')
    a.m.arts.acuerdo_2 = acuerdo([preg('whatsapp'), preg('pixel')]).acuerdo as never
    expect((await preguntarAlDueno(a.P, 'enc-1')).cuerpo).toMatchObject({ motivo: 'registrada', claves: ['pixel'] })
    expect(a.filas()).toHaveLength(2)
    const r = a.m.arts.buzon_respuestas as { n: number; claves: string[]; preguntas: Array<{ clave: string; recomendacion: string }> }
    expect(r.n).toBe(2)
    expect(r.claves).toEqual(['whatsapp', 'pixel'])
    expect(r.preguntas.map((q) => q.clave)).toEqual(['whatsapp', 'pixel'])
    expect(r.preguntas[1].recomendacion).toBe('Lo que te conviene hacer.')
  })
  it('🔴 una respuesta por otra puerta a una pregunta de más de 72 horas también la cierra', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    a.horas(73)
    expect((await contestarPorLaPuerta(a, 'whatsapp')).status).toBe(200)
    expect(a.pendientes()).toBe(2)
    await atenderPausa(a.P, 'enc-1')
    expect(a.pendientes()).toBe(1)
  })
  it('🔴 lo ya contestado no se vuelve a leer', async () => {
    const a = armar()
    await pausarOficina(a.P, a.pedir)
    await responderEnLaOficina(a.P, { client_id: a.c.id, tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })
    const leidos: string[] = []
    const leer = a.P.cerebro.leerRespuestas!
    a.P.cerebro.leerRespuestas = async (q) => { leidos.push(q.tema); return leer(q) }
    await preguntarAlDueno(a.P, 'enc-1')
    expect(leidos).toEqual(['pixel'])
  })
  describe('al contestar se cierra solo lo de este encargo (05-nov · hallazgo de CC7)', () => {
    const deOtraOficina = (a: ReturnType<typeof armar>) => {
      const ajenas = [['00000000-0000-4000-9000-000000000001', 'whatsapp', 'olon'], ['00000000-0000-4000-9000-000000000002', 'whatsapp de la tienda de olon', null], ['00000000-0000-4000-9000-000000000003', 'horario de la tienda', null]].map(([id, tema, sede_clave]) => ({ id, client_id: a.c.id, tema, sede_clave, pregunta: `¿${tema}?`, estado: 'pendiente', creado_en: a.hora(), preguntado_por_oficina: 'creativa' }))
      a.t.cerebro_dueno_preguntas.push(...ajenas)
      return () => a.filas().filter((p) => String(p.id).startsWith('00000000-0000-4000-9000')).map((p) => p.estado)
    }
    it('🔴 contestar en Tu oficina deja viva la pregunta de otra sede u otra oficina', async () => {
      const a = armar()
      await pausarOficina(a.P, a.pedir)
      const ajenas = deOtraOficina(a)
      expect((await responderEnLaOficina(a.P, { client_id: a.c.id, tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ en_el_cerebro: true, tema_cerrado: true })
      expect(ajenas()).toEqual(['pendiente', 'pendiente', 'pendiente'])
      expect(a.filas().filter((p) => p.tema === 'whatsapp' && !p.sede_clave).map((p) => p.estado)).toEqual(['respondida'])
    })
    it('🔴 pasadas las 72 horas también se cierra la propia, y las ajenas siguen vivas', async () => {
      const a = armar()
      await pausarOficina(a.P, a.pedir)
      a.horas(73)
      const ajenas = deOtraOficina(a)
      await responderEnLaOficina(a.P, { client_id: a.c.id, tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })
      expect(ajenas()).toEqual(['pendiente', 'pendiente', 'pendiente'])
      expect(a.filas().find((p) => p.tema === 'whatsapp' && !p.sede_clave)).toMatchObject({ estado: 'obsoleta', motivo_descarte: 'el dueño ya contestó esta pregunta' })
    })
    it('🔴 una respuesta recogida del cerebro cierra la propia y no toca las ajenas', async () => {
      const a = armar()
      await pausarOficina(a.P, a.pedir)
      a.horas(73)
      const propia = () => a.filas().find((p) => p.tema === 'whatsapp' && !p.sede_clave)
      expect((await contestarPorLaPuerta(a, 'whatsapp')).status).toBe(200)
      const ajenas = deOtraOficina(a)
      await atenderPausa(a.P, 'enc-1')
      expect(ajenas()).toEqual(['pendiente', 'pendiente', 'pendiente'])
      expect(propia()).toMatchObject({ estado: 'obsoleta' })
    })
    it('🔴 lo recogido cierra su propia pregunta, no la primera del registro', async () => {
      const a = armar()
      await pausarOficina(a.P, a.pedir)
      a.horas(73)
      expect((await contestarPorLaPuerta(a, 'pixel')).status).toBe(200)
      await atenderPausa(a.P, 'enc-1')
      expect(a.filas().map((p) => [p.tema, p.estado])).toEqual([['whatsapp', 'pendiente'], ['pixel', 'obsoleta']])
    })
    it('🔴 una ronda nueva también cierra lo que recogió', async () => {
      const a = armar({ preguntas: [preg('whatsapp')] })
      await pausarOficina(a.P, a.pedir)
      a.horas(73)
      expect((await contestarPorLaPuerta(a, 'whatsapp')).status).toBe(200)
      a.m.arts.acuerdo = acuerdo([preg('whatsapp'), preg('pixel')]).acuerdo
      await atenderPausa(a.P, 'enc-1')
      expect(a.filas().map((p) => [p.tema, p.estado])).toEqual([['whatsapp', 'obsoleta'], ['pixel', 'pendiente']])
    })
    it('🔴 si el cerebro cayó a mitad del primer registro, la repetida guarda su id y se cierra pasadas las 72 horas', async () => {
      let caido = false, llamadas = 0
      const a = armar({ caido: () => caido })
      const real = a.P.cerebro.registrarPregunta
      a.P.cerebro.registrarPregunta = async (q) => { if (++llamadas === 2) { caido = true; try { return await real(q) } finally { caido = false } } return real(q) }
      await pausarOficina(a.P, a.pedir)
      expect(a.filas().map((p) => p.tema)).toEqual(['whatsapp'])
      a.minutos(10)
      await atenderPausa(a.P, 'enc-1')
      expect(a.filas().map((p) => p.tema)).toEqual(['whatsapp', 'pixel'])
      const registro = a.m.arts.buzon_respuestas as { preguntas: Array<{ clave: string; pregunta_id: string | null }> }
      expect(registro.preguntas.map((p) => [p.clave, p.pregunta_id])).toEqual([['whatsapp', a.filas()[0].id], ['pixel', a.filas()[1].id]])
      a.horas(73)
      await responderEnLaOficina(a.P, { client_id: a.c.id, tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })
      expect(a.filas()[0].estado).toBe('obsoleta')
    })
    it('🔴 una pregunta de otra oficina no guarda id: su fila no se cierra desde aquí', async () => {
      const a = armar({ preguntas: [preg('whatsapp')] })
      a.t.cerebro_dueno_preguntas.push({ id: '00000000-0000-4000-9000-000000000009', client_id: a.c.id, tema: 'whatsapp', pregunta: '¿whatsapp?', estado: 'pendiente', creado_en: a.hora(), preguntado_por_oficina: 'creativa', canal: 'otra' })
      await pausarOficina(a.P, a.pedir)
      const registro = a.m.arts.buzon_respuestas as { preguntas: Array<{ pregunta_id: string | null }> }
      expect(registro.preguntas[0].pregunta_id).toBeNull()
    })
    it('🔴 si en una vuelta se recogen varias respuestas, se cierran todas', async () => {
      const a = armar()
      await pausarOficina(a.P, a.pedir)
      a.horas(73)
      for (const tema of ['whatsapp', 'pixel']) expect((await contestarPorLaPuerta(a, tema)).status).toBe(200)
      await atenderPausa(a.P, 'enc-1')
      expect(a.filas().map((p) => p.estado)).toEqual(['obsoleta', 'obsoleta'])
    })
    it('🔴 un cierre que lanza no rompe la respuesta y dice que no cerró', async () => {
      const m = mundo({ modo: 'registra', espera: {}, arts: acuerdo([preg('whatsapp'), preg('pixel')]) })
      m.P.cerebro.cerrarPendiente = async () => { throw new Error('red') }
      m.arts.buzon_respuestas = { n: 1, claves: ['whatsapp', 'pixel'], preguntas: [{ clave: 'whatsapp', pregunta_id: 'p1' }, { clave: 'pixel', pregunta_id: 'p2' }] }
      expect((await responderEnLaOficina(m.P, { client_id: 'cli', tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ aplicada: true, en_el_cerebro: true, tema_cerrado: false })
    })
    it('🔴 un cierre que falla dice que no cerró', async () => {
      const m = mundo({ modo: 'registra', espera: {}, arts: acuerdo([preg('whatsapp'), preg('pixel')]) })
      m.P.cerebro.cerrarPendiente = async () => ({ ok: false, error: 'no_cerrada' })
      m.arts.buzon_respuestas = { n: 1, claves: ['whatsapp', 'pixel'], preguntas: [{ clave: 'whatsapp', pregunta_id: 'p1' }, { clave: 'pixel', pregunta_id: 'p2' }] }
      expect((await responderEnLaOficina(m.P, { client_id: 'cli', tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ en_el_cerebro: true, tema_cerrado: false })
    })
    it('🔴 sin id en el registro no cierra nada, ni por tema', async () => {
      const m = mundo({ modo: 'registra', espera: {}, arts: acuerdo([preg('whatsapp'), preg('pixel')]) })
      const cierres: unknown[] = []
      m.P.cerebro.cerrarPendiente = async (q) => { cierres.push(q); return { ok: true } }
      m.arts.buzon_respuestas = { n: 1, claves: ['whatsapp', 'pixel'], preguntas: [{ clave: 'whatsapp', pregunta_id: null }, { clave: 'pixel', pregunta_id: 'p2' }] }
      expect((await responderEnLaOficina(m.P, { client_id: 'cli', tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ en_el_cerebro: true, tema_cerrado: false })
      expect(cierres).toEqual([])
    })
    it('🔴 el cierre le pide a la puerta esa pregunta y ningún tema', async () => {
      const cuerpos: Array<Record<string, unknown>> = []
      const f = (async (_u: string, i: RequestInit) => { cuerpos.push(JSON.parse(String(i.body))); return { status: 200, json: async () => ({ ok: true }) } }) as never
      await cerebroDelDueno({ base: 'https://x', llave: 'k', workflow_id: 'w', workflow_execution_id: 'e', fetch: f }).cerrarPendiente!({ client_id: 'c', pregunta_id: 'p1', motivo: 'm' })
      expect(cuerpos[0]).toMatchObject({ evento: 'descartar', client_id: 'c', pregunta_id: 'p1', motivo: 'm' })
      expect(cuerpos[0].tema).toBeUndefined()
    })
    it('🔴 la lectura lleva la llave', async () => {
      const hs: unknown[] = []
      const f = (async (_u: string, i: RequestInit) => { hs.push(i.headers); return { status: 200, json: async () => ({ ok: true, respuestas: [] }) } }) as never
      await cerebroDelDueno({ base: 'https://x', llave: 'la-llave', workflow_id: 'w', workflow_execution_id: 'e', fetch: f }).leerRespuestas!({ client_id: 'c', tema: 't' })
      expect(hs).toEqual([expect.objectContaining({ 'x-api-key': 'la-llave' })])
    })
    it('🔴 una respuesta vacía no cuenta como contestada', async () => {
      const f = (async () => ({ status: 200, json: async () => ({ ok: true, respuestas: [{ respuesta: '   ' }, { respuesta: 'sí' }, { otra: 1 }] }) })) as never
      expect(await cerebroDelDueno({ base: 'https://x', llave: 'k', workflow_id: 'w', workflow_execution_id: 'e', fetch: f }).leerRespuestas!({ client_id: 'c', tema: 't' })).toEqual({ ok: true, respuestas: [{ respuesta: 'sí' }] })
    })
  })
  it('🔴 si la respuesta no llegó al cerebro, no cierra nada', async () => {
    const m = mundo({ modo: 'registra', espera: {}, cerebroCaido: true, arts: acuerdo([preg('whatsapp'), preg('pixel')]) })
    let cierres = 0
    m.P.cerebro.cerrarPendiente = async () => { cierres++; return { ok: true } }
    m.arts.buzon_respuestas = { n: 1, claves: ['whatsapp', 'pixel'], preguntas: [{ clave: 'whatsapp', pregunta_id: 'p1' }, { clave: 'pixel', pregunta_id: 'p2' }] }
    expect((await responderEnLaOficina(m.P, { client_id: 'cli', tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio' })).cuerpo).toMatchObject({ en_el_cerebro: false, tema_cerrado: false })
    expect(cierres).toBe(0)
  })
  it('🔴 la lectura dice «no se pudo» con un error de la puerta, aunque el cuerpo parezca bueno', async () => {
    const f = (async () => ({ status: 500, json: async () => ({ ok: true, respuestas: [] }) })) as never
    expect(await cerebroDelDueno({ base: 'https://x', llave: 'k', workflow_id: 'w', workflow_execution_id: 'e', fetch: f }).leerRespuestas!({ client_id: 'c', tema: 't' })).toEqual({ ok: false, error: 'http_500' })
  })
  it('🔴 la lectura dice «no se pudo» con la puerta apagada, nunca «no contestó»', async () => {
    const f = (async () => ({ status: 200, json: async () => ({ apagado: true }) })) as never
    const c = cerebroDelDueno({ base: 'https://x', llave: 'k', workflow_id: 'w', workflow_execution_id: 'e', fetch: f })
    expect(await c.leerRespuestas!({ client_id: 'c', tema: 't' })).toEqual({ ok: false, error: 'puerta_apagada' })
    expect(await c.cerrarPendiente!({ client_id: 'c', pregunta_id: 'p1', motivo: 'm' })).toEqual({ ok: false, error: 'puerta_apagada' })
    expect(await cerebroDelDueno({ base: '', llave: '', workflow_id: '', workflow_execution_id: '', fetch: f }).leerRespuestas!({ client_id: 'c', tema: 't' })).toEqual({ ok: false, error: 'cerebro_no_configurado' })
  })
})

describe('recibido no es arrancó (05-nov · hallazgo de CC2)', () => {
  const AHORA = '2026-11-05T12:00:00.000Z'
  const hace = (min: number) => new Date(Date.parse(AHORA) - min * 60_000).toISOString()
  const quieta = { estado: 'en_pausa', otra_activa: false }
  const soltada = (min: number, intentos = 1) => ({ estado: 'soltada' as const, despertado: true, intentos_de_despertar: intentos, despertado_en: hace(min) })

  it('🔴 la corrida sigue en pausa pasado el margen: lo llama otra vez y cuenta el intento', async () => {
    const m = mundo({ espera: soltada(MARGEN_PARA_ARRANCAR_MIN), corrida: quieta, hora: AHORA })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ soltada: true, despertado: true, intentos: 2 })
    expect(m.despertares).toEqual([{ corrida: 'plan-x', client_id: 'cli', reanudar_esperas_id: 'esp-1' }])
    expect(m.espera()?.intentos_de_despertar).toBe(2)
  })
  it('🔴 antes del margen no insiste: el plan puede estar arrancando', async () => {
    const m = mundo({ espera: soltada(MARGEN_PARA_ARRANCAR_MIN - 1), corrida: quieta, hora: AHORA })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toEqual({ soltada: true, despertado: true })
    expect(m.despertares).toEqual([])
  })
  it('🔴 si la corrida ya arrancó o ya terminó, no lo llama', async () => {
    for (const estado of ['corriendo', 'hecha', 'fallida', null]) {
      const m = mundo({ espera: soltada(60), corrida: { estado, otra_activa: false }, hora: AHORA })
      expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toEqual({ soltada: true, despertado: true })
      expect(m.despertares).toEqual([])
      expect(m.avisos).toEqual([])
    }
  })
  it('🔴 con otra corrida en marcha no insiste ni avisa: esa decide', async () => {
    const m = mundo({ espera: soltada(60, MAX_INTENTOS_DE_DESPERTAR), corrida: { estado: 'en_pausa', otra_activa: true }, hora: AHORA })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ arranco: false, motivo: 'otra_corrida_activa' })
    expect(m.despertares).toEqual([])
    expect(m.avisos).toEqual([])
  })
  it('🔴 una lectura caída no se toma por «no arrancó»: ni llama ni avisa', async () => {
    const m = mundo({ espera: soltada(60, MAX_INTENTOS_DE_DESPERTAR), corrida: 'caida', hora: AHORA })
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ arranco: 'no_se_pudo_leer' })
    expect(m.despertares).toEqual([])
    expect(m.avisos).toEqual([])
  })
  it('🔴 agotado el tope deja de llamar y avisa una sola vez', async () => {
    const m = mundo({ espera: soltada(60, MAX_INTENTOS_DE_DESPERTAR), corrida: quieta, hora: AHORA })
    await atenderPausa(m.P, 'enc-1')
    await atenderPausa(m.P, 'enc-1')
    expect(m.despertares).toEqual([])
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toContain('no arrancó')
  })
  it('🔴 sin hora del último intento no concluye nada', async () => {
    const m = mundo({ espera: { ...soltada(60), despertado_en: null }, corrida: quieta, hora: AHORA })
    await atenderPausa(m.P, 'enc-1')
    expect(m.despertares).toEqual([])
  })
  it('🔴 la lectura real busca la corrida de ese cliente y ve si hay otra activa', async () => {
    const db = new DbFalsa()
    db.semilla('plan_corridas', [{ id: '1', client_id: 'c', corrida: 'p', estado: 'en_pausa' }, { id: '2', client_id: 'otro', corrida: 'p', estado: 'hecha' }, { id: '3', client_id: 'otro', corrida: 'q', estado: 'corriendo' }])
    const E = esperasDeFinanzas(db as never)
    const esp = { id: 'e', client_id: 'c', encargo_id: 'x', corrida: 'p', estado: 'soltada' as const, sobre: {}, despertado: true, intentos_de_despertar: 1, despertado_en: null }
    expect(await E.estadoDeLaCorrida(esp)).toEqual({ estado: 'en_pausa', otra_activa: false })
    db.tablas['plan_corridas'].push({ id: '4', client_id: 'c', corrida: 'r', estado: 'esperando' })
    expect(await E.estadoDeLaCorrida(esp)).toEqual({ estado: 'en_pausa', otra_activa: true })
    db.tablas['plan_corridas'].find((f: Record<string, unknown>) => f.id === '4')!.estado = 'corriendo'
    expect(await E.estadoDeLaCorrida(esp)).toEqual({ estado: 'en_pausa', otra_activa: true })
    expect(await E.estadoDeLaCorrida({ ...esp, corrida: null })).toEqual({ estado: null, otra_activa: false })
    expect(await E.estadoDeLaCorrida({ ...esp, client_id: 'nadie' })).toEqual({ estado: null, otra_activa: false })
  })
  it('🔴 el margen son 5 minutos: el vigía entra cada 10 y el pre-vuelo tarda segundos', () => {
    expect(MARGEN_PARA_ARRANCAR_MIN).toBe(5)
  })
  it('🔴 una caída al leer la corrida LANZA, en cualquiera de las dos lecturas: nunca se lee como «no hay corrida»', async () => {
    const esp = { id: 'e', client_id: 'c', encargo_id: 'x', corrida: 'p', estado: 'soltada' as const, sobre: {}, despertado: true, intentos_de_despertar: 1, despertado_en: null }
    const conFallo = (cual: number) => {
      let n = 0
      const api = { select: () => api, eq: () => api, in: () => api, limit: async () => (++n === cual ? { data: null, error: { message: 'caída' } } : { data: [{ estado: 'en_pausa' }], error: null }) }
      return esperasDeFinanzas({ from: () => api } as never)
    }
    await expect(conFallo(1).estadoDeLaCorrida(esp)).rejects.toThrow('caída')
    await expect(conFallo(2).estadoDeLaCorrida(esp)).rejects.toThrow('caída')
  })
  it('🔴 la espera trae la hora del último intento: sin ella la revisión nunca concluye nada', async () => {
    const pedidas: string[] = []
    const fila = { id: 'e', client_id: 'c', clave: 'finanzas:x', estado: 'soltada', sobre: { corrida: 'p' }, despertado: true, despertar_intentos: 1, actualizado_en: hace(60) }
    const api = { select: (c: string) => { pedidas.push(c); return api }, eq: () => api, limit: async () => ({ data: [fila], error: null }) }
    expect((await esperasDeFinanzas({ from: () => api } as never).delEncargo('x'))?.despertado_en).toBe(hace(60))
    expect(pedidas[0].split(',')).toContain('actualizado_en')
  })
  it('🔴 las dos rutas llaman al plan con la llave de despacho del entorno, nunca con la interna', async () => {
    const llamadas: Array<Record<string, string>> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_u: string, i: RequestInit) => { llamadas.push(i.headers as Record<string, string>); return { ok: true, status: 200 } }) as never
    try {
      expect(await despertarDelEntorno({ N8N_BASE_URL: 'https://n8n.x', SALA_DISPATCH_KEY: 'despacho', INTERNAL_API_KEY: 'interna' })({})).toEqual({ ok: true })
      expect(await puertosDePausa({ N8N_BASE_URL: 'https://n8n.x', SALA_DISPATCH_KEY: 'despacho', INTERNAL_API_KEY: 'interna' }, new DbFalsa() as never, 'envia', 'wf', 'ex').despertar({})).toEqual({ ok: true })
    } finally { globalThis.fetch = original }
    for (const h of llamadas) { expect(h['x-sala-dispatch-key']).toBe('despacho'); expect(JSON.stringify(h)).not.toContain('interna') }
    expect(llamadas).toHaveLength(2)
    expect(fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8')).toContain('despertar: despertarDelEntorno(process.env)')
  })
})

describe('contestar en Tu oficina (Emilio, 16:20Z)', () => {
  const pedir = (o: Record<string, unknown> = {}) => ({ client_id: 'cli', tema: 'whatsapp', respuesta: 'sí, ya lo tengo', quien: 'emilio', ...o })
  const dos = { ...acuerdo([preg('whatsapp'), preg('pixel')]) }
  it('🔴 aplica la respuesta, la guarda en el cerebro y dice cuáles faltan', async () => {
    const m = mundo({ espera: {}, arts: dos })
    const r = await responderEnLaOficina(m.P, pedir())
    expect(r.cuerpo).toMatchObject({ en_pausa: true, es_de_la_pausa: true, aplicada: true, clave: 'whatsapp', en_el_cerebro: true, faltan: ['pixel'] })
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'whatsapp', valor: 'sí, ya lo tengo', literal: 'sí, ya lo tengo' }])
    expect(m.alCerebro[0]).toMatchObject({ tema: 'whatsapp', respuesta: 'sí, ya lo tengo' })
    expect(m.despertares).toEqual([])
  })
  it('🔴 con la última, el plan sigue en el acto y una sola vez', async () => {
    const m = mundo({ espera: {}, arts: dos, semilla: { respuestas_del_dueno: [{ clave: 'pixel', valor: 'no', literal: 'no' }] } })
    expect((await responderEnLaOficina(m.P, pedir())).cuerpo).toMatchObject({ soltada: true, faltan: [] })
    expect(m.despertares).toHaveLength(1)
    expect(m.e.estado).toBe('en_curso')
    expect((await responderEnLaOficina(m.P, pedir())).cuerpo).toEqual({ en_pausa: false })
    expect(m.despertares).toHaveLength(1)
  })
  it('🔴 contestar otra vez la misma reemplaza, no duplica', async () => {
    const m = mundo({ espera: {}, arts: dos })
    await responderEnLaOficina(m.P, pedir())
    await responderEnLaOficina(m.P, pedir({ respuesta: 'mejor no' }))
    expect(m.e.semilla.respuestas_del_dueno).toEqual([{ clave: 'whatsapp', valor: 'mejor no', literal: 'mejor no' }])
  })
  it('🔴 mientras sigue contestando el plan no arranca; pasado el margen sí', async () => {
    const m = mundo({ espera: {}, arts: dos, slackTs: '100.1' })
    await responderEnLaOficina(m.P, pedir())
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo.esperando).toBe(true)
    m.P.ahora = () => new Date('2026-11-04T16:16:00Z')
    expect((await atenderPausa(m.P, 'enc-1')).cuerpo).toMatchObject({ soltada: true })
  })
  it('🔴 sin pausa o con una pregunta ajena no toca nada y lo dice', async () => {
    expect((await responderEnLaOficina(mundo({ espera: null }).P, pedir())).cuerpo).toEqual({ en_pausa: false })
    const m = mundo({ espera: {}, arts: dos })
    expect((await responderEnLaOficina(m.P, pedir({ tema: 'otra cosa' }))).cuerpo).toEqual({ en_pausa: true, es_de_la_pausa: false })
    expect(m.alCerebro).toEqual([])
  })
  it('🔴 otro cliente no entra en esta pausa', async () => {
    const m = mundo({ espera: {}, arts: dos })
    expect((await responderEnLaOficina(m.P, pedir({ client_id: 'otro' }))).cuerpo).toEqual({ en_pausa: false })
  })
  it('🔴 si el cerebro falla, el plan igual la usa y lo dice', async () => {
    const m = mundo({ espera: {}, arts: dos, cerebroCaido: true })
    expect((await responderEnLaOficina(m.P, pedir())).cuerpo).toMatchObject({ aplicada: true, en_el_cerebro: false })
    expect(m.e.semilla.respuestas_del_dueno).toHaveLength(1)
  })
  it('🔴 la espera viva del cliente es solo la suya, de finanzas y sin soltar', async () => {
    const db = new DbFalsa()
    const fila = (id: string, o: Record<string, unknown>) => ({ id, client_id: 'c', tipo: 'finanzas', clave: `finanzas:${id}`, estado: 'esperando', sobre: { corrida: 'p' }, despertado: null, despertar_intentos: 0, ...o })
    db.semilla('esperas_del_dueno', [fila('soltada', { estado: 'soltada' }), fila('reemplazada', { estado: 'reemplazada' }), fila('manual', { tipo: 'manual' }), fila('ajena', { client_id: 'otro' })])
    expect(await esperasDeFinanzas(db as never).vivaDelCliente('c')).toBeNull()
    db.tablas['esperas_del_dueno'].push(fila('viva', {}))
    expect(await esperasDeFinanzas(db as never).vivaDelCliente('c')).toMatchObject({ id: 'viva', encargo_id: 'viva', corrida: 'p' })
  })
  it('🔴 lo que contesta en Tu oficina llega al cerebro con ese canal, no como Slack', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_u: string, i: RequestInit) => { cuerpos.push(JSON.parse(String(i.body))); return { status: 200, json: async () => ({ ok: true }) } }) as never
    const env = { INTERNAL_API_KEY: 'k', FINANZAS_CANAL_PREGUNTAS: 'C123456789' }
    try {
      const entrada = { client_id: 'c', tema: 't', pregunta: 'p', respuesta: 'r', mensaje_ref: 'm', respondido_en: '2026-11-04T00:00:00Z', pregunta_id: null }
      await puertosDePausa(env, new DbFalsa() as never, 'envia', 'wf', 'ex', 'dashboard · Tu oficina').cerebro.registrarRespuesta(entrada)
      await puertosDePausa(env, new DbFalsa() as never, 'envia', 'wf', 'ex').cerebro.registrarRespuesta(entrada)
    } finally {
      globalThis.fetch = original
    }
    expect(cuerpos[0].canal).toBe('dashboard · Tu oficina')
    expect(String(cuerpos[1].canal)).toContain('buzon-de-preguntas')
    expect(fs.readFileSync('src/app/api/finanzas/responder/route.ts', 'utf8')).toContain("'dashboard · Tu oficina'")
  })
  it('🔴 pide todo lo necesario', async () => {
    for (const k of ['client_id', 'tema', 'respuesta', 'quien']) expect((await responderEnLaOficina(mundo({ espera: {} }).P, pedir({ [k]: ' ' }))).status).toBe(400)
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
  it('🔴 y también los informes de la mesa de análisis: los lee toda la oficina', async () => {
    const informes = [{ de: 'hecho en esta corrida', tipo: 'competencia', informe: 'texto', es_dato_del_cliente: false }]
    const m = mundo({ estado: 'en_curso', pausaEncendida: false, semilla: { informes_de_analisis: informes }, arts: { acuerdo: {} } })
    delete (m.arts as Record<string, unknown>).acuerdo
    await avanzar(m.C, 'enc-1')
    expect((m.guardados[0] as { artefacto: { contenido: { informes_de_analisis: unknown } } }).artefacto.contenido.informes_de_analisis).toEqual(informes)
  })
  it('sin informes el expediente queda igual que hoy', async () => {
    for (const semilla of [{}, { informes_de_analisis: [] }, { informes_de_analisis: 'x' }]) {
      const m = mundo({ estado: 'en_curso', pausaEncendida: false, semilla, arts: { acuerdo: {} } })
      delete (m.arts as Record<string, unknown>).acuerdo
      await avanzar(m.C, 'enc-1')
      expect((m.guardados[0] as { artefacto: { contenido: object } }).artefacto.contenido).not.toHaveProperty('informes_de_analisis')
    }
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
    expect(d.calendario?.arranque).toBe('2026-11-05')
    expect(d.calendario?.semanas).toHaveLength(12)
  })
  it('🔴 a los 3 días exactos el material sirve; pasados, se lee de nuevo y el relleno depende del cerebro listo', async () => {
    const espera = (creado_en: string) => ({ client_id: 'cliente-1', corrida: 'plan-x', estado: 'soltada', creado_en })
    expect((await prevuelo(pedir(), puertos('en_pausa', espera('2026-11-02T10:00:00Z')).P)).material_viejo).toBeUndefined()
    const d = await prevuelo(pedir(), puertos('en_pausa', espera('2026-11-02T09:59:00Z')).P)
    expect(d).toMatchObject({ decision: 'correr', material_viejo: true, relleno_permitido: true, corrida_id: 'cor-1' })
  })
  it('🔴 otro plan del cliente en marcha: no corre, lo dice y no revive esta', async () => {
    const w = puertos('en_pausa')
    ;(w.P as { corridas: { activaDe: unknown } }).corridas.activaDe = async () => ({ corrida: 'plan-y', estado: 'corriendo', espera_desde: 'x' })
    const d = await prevuelo(pedir(), w.P)
    expect(d).toMatchObject({ decision: 'no_corre', motivo: 'corrida_activa', corrida: 'plan-y' })
    expect(w.f.estado).toBe('en_pausa')
  })
  it('🔴 si el otro le gana justo al escribir (el índice), tampoco se cae', async () => {
    const w = puertos('en_pausa')
    ;(w.P as { corridas: { avanzarSi: unknown } }).corridas.avanzarSi = async () => { throw new Error('23505') }
    expect(await prevuelo(pedir(), w.P)).toMatchObject({ decision: 'no_corre', motivo: 'corrida_activa' })
  })
  it('🔴 una pausa larga también vuelve con su calendario', async () => {
    const d = await prevuelo(pedir(), puertos('en_pausa', { client_id: 'cliente-1', corrida: 'plan-x', estado: 'soltada', creado_en: '2026-10-01T00:00:00Z' }).P)
    expect(d.material_viejo).toBe(true)
    expect(d.calendario?.arranque).toBe('2026-11-05')
  })
  it('🔴 el arranque es el día del país: en Ecuador a las 02:00Z todavía es ayer', async () => {
    const w = puertos('en_pausa')
    const P = { ...(w.P as object), ahora: () => new Date('2026-11-05T02:00:00Z'), corridas: { ...(w.P as { corridas: object }).corridas, ahora: () => new Date('2026-11-05T02:00:00Z') } } as never
    expect((await prevuelo(pedir(), P)).calendario?.arranque).toBe('2026-11-04')
  })
  it('🔴 el día del país también en el arranque normal y en la pausa larga', async () => {
    const hora = () => new Date('2026-11-05T02:00:00Z')
    const con = (w: ReturnType<typeof puertos>, extra: object = {}) => ({ ...(w.P as object), ahora: hora, corridas: { ...(w.P as { corridas: object }).corridas, ahora: hora }, ...extra }) as never
    const normal = await prevuelo({ client_id: 'cliente-1', corrida: 'plan-x' }, con(puertos('esperando'), { cupo: async () => ({ ok: true, cap_usd: 100, generico_usd: 100, override_usd: null, gastado_24h_usd: 0 }) }))
    expect(normal.calendario?.arranque).toBe('2026-11-04')
    const larga = await prevuelo(pedir(), con(puertos('en_pausa', { client_id: 'cliente-1', corrida: 'plan-x', estado: 'soltada', creado_en: '2026-10-01T00:00:00Z' })))
    expect(larga.material_viejo).toBe(true)
    expect(larga.calendario?.arranque).toBe('2026-11-04')
  })
  it('🔴 un plan que arranca normal también recibe su calendario, y uno que espera no', async () => {
    const w = puertos('esperando')
    const P = { ...(w.P as object), cupo: async () => ({ ok: true, cap_usd: 100, generico_usd: 100, override_usd: null, gastado_24h_usd: 0 }) } as never
    const d = await prevuelo({ client_id: 'cliente-1', corrida: 'plan-x' }, P)
    expect(d.decision).toBe('correr')
    expect(d.calendario?.semanas[0]).toEqual({ semana: 1, desde: '2026-11-05', hasta: '2026-11-11' })
    const noListo = { ...(P as object), senal: async () => ({ ok: true, senal: { listo: false, completando: false, motivo: 'no', desde: null, huecos: [] } }) } as never
    const e = await prevuelo({ client_id: 'cliente-1', corrida: 'plan-x' }, { ...(noListo as object), corridas: { ...(w.P as { corridas: object }).corridas, leer: async () => ({ ...w.f, estado: 'esperando', espera_desde: '2026-11-05T09:50:00Z' }) } } as never)
    expect(e.decision).toBe('esperar')
    expect(e.calendario).toBeUndefined()
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

describe('otro plan del mismo cliente reemplaza al que esperaba', () => {
  const crear = async (estado: string) => {
    const db = new DbFalsa()
    db.semilla('finanzas_encargos', [{ id: 'viejo', client_id: 'c', estado, gasto_usd: 1, dry_run: false, semilla: { corrida: 'cor-a' }, estado_del_motor: { pasos_ejecutados: 8 } }])
    db.semilla('esperas_del_dueno', [{ id: 'esp', tipo: 'finanzas', clave: 'finanzas:viejo', estado: 'esperando' }])
    db.semilla('plan_corridas', [{ id: 'cor-a', estado: 'en_pausa' }])
    const r = await almacenDeConversa(db as never).crearEncargo({ client_id: 'c', dry_run: false, semilla: { corrida: 'cor-b' } })
    return { db, r }
  }
  it.each(['esperando_al_dueno', 'en_curso'])('🔴 desde «%s»: el viejo se cierra, su espera y su corrida no quedan colgadas', async (estado) => {
    const { db, r } = await crear(estado)
    expect(r).toMatchObject({ ok: true, nuevo: true })
    expect(db.tablas['finanzas_encargos'].find((f) => f.id === 'viejo')).toMatchObject({ estado: 'fallido' })
    expect(db.tablas['esperas_del_dueno'][0]).toMatchObject({ estado: 'reemplazada' })
    expect(db.tablas['plan_corridas'][0]).toMatchObject({ estado: 'fallida' })
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
