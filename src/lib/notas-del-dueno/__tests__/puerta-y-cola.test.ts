import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cuerpoParaLaPuerta, enviarALaPuerta, FLUJO_DE_LAS_NOTAS, idCorto, isoDeTs, leerDeLaPuerta, temaDeLaNota } from '../puerta-del-dueno'
import { enviarNotaAlCerebro, puertosDeNotas, reintentarPendientes } from '../adaptadores'
import { procesar } from '../recibir'
import { vistasDelCerebro, unirVistas } from '../autorevision'
import { abrirEncargo } from '../../oficina/orquestador'
import { TARGET_STEP_PRODUCIR } from '../../oficina/sobre'
import { POST_IMG_CON_JEFATURA } from '../../oficina/plantillas/con-jefatura'
import { conSegundoCerebro } from '../../oficina/plantillas/con-segundo-cerebro'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PIEZA_OK, crearMemoria, correr, direccionGenerada, observacion } from '../../oficina/__tests__/memoria'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import type { NotaNueva } from '../tipos'

let dbRutas: DbFalsa
const pendientes: Array<Promise<unknown>> = []
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => dbRutas }))
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { pendientes.push(p) } }))

const C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const HITL = '11111111-1111-4111-8111-111111111111'
const EMILIO = 'U0EMILIO1'
const TS = '1792575600.123456'

const nota = (o: Partial<NotaNueva & { id: string }> = {}): NotaNueva & { id: string } => ({ id: 'n1', client_id: C1, alcance: 'cliente', tipo: 'comentario', comentario: 'Más corto', hitl_id: HITL, output_id: null, pieza_titulo: 'Post del lunes', pieza_version: '3', pieza_familia: 'post_img', origen: 'slack', autor: EMILIO, clave_unica: 'comentario:C1:' + TS, ...o })
const CTX = { ts: TS, canal_slack: 'C0C7XUKNCLS', respondido_en: '2026-10-21T12:00:00.000Z' }

describe('la forma EXACTA de la nota que sube a la puerta del dueño', () => {
  it('el cuerpo trae cada campo del encargo, con el tema corto «oficina creativa · pieza <id corto>», acumula:true y el ts solo en mensaje_ref/respondido_en', () => {
    expect(cuerpoParaLaPuerta({ client_id: C1, hitl_id: HITL, pieza_titulo: 'Post del lunes', pieza_familia: 'post_img', comentario: 'Más corto', ts: TS, canal_slack: 'C0C7XUKNCLS', respondido_en: '2026-10-21T12:00:00.000Z' })).toEqual({
      evento: 'respuesta', client_id: C1, tema: 'oficina creativa · pieza 11111111', acumula: true, pregunta: 'Revisión de la pieza «Post del lunes» (post_img)', respuesta: 'Más corto',
      canal: '#oficina-creativa', mensaje_ref: `C0C7XUKNCLS:${TS}`, respondido_en: '2026-10-21T12:00:00.000Z', preguntado_por: { oficina: 'oficina-creativa', agente: 'content-creator' },
      dry_run: false, workflow_id: FLUJO_DE_LAS_NOTAS, workflow_execution_id: `slack:C0C7XUKNCLS:${TS}`,
    })
  })
  it('sin título ni familia la pregunta sigue siendo válida; los textos largos se recortan a lo que admite la puerta', () => {
    const c = cuerpoParaLaPuerta({ client_id: C1, hitl_id: HITL, pieza_titulo: null, pieza_familia: null, comentario: 'x'.repeat(5000), ts: TS, canal_slack: 'C1', respondido_en: 'z' })
    expect(c.pregunta).toBe('Revisión de la pieza «sin título»')
    expect((c.respuesta as string).length).toBeLessThanOrEqual(2000)
    expect((c.respuesta as string).endsWith('…')).toBe(true)
    expect((cuerpoParaLaPuerta({ client_id: C1, hitl_id: HITL, pieza_titulo: 'T'.repeat(900), pieza_familia: null, comentario: 'a', ts: TS, canal_slack: 'C1', respondido_en: 'z' }).pregunta as string).length).toBeLessThanOrEqual(500)
  })
  it('el tema es corto (≤ 80, una sola palabra de id), distinto por pieza, y NO lleva el ts ni el uuid completo', () => {
    const otra = '22222222-2222-4222-8222-222222222222'
    expect(temaDeLaNota(HITL)).toBe('oficina creativa · pieza 11111111')
    expect(temaDeLaNota(HITL)).not.toBe(temaDeLaNota(otra))
    expect(temaDeLaNota(HITL)).not.toContain('-')
    expect(temaDeLaNota('ab-cd-ef-gh-ij-kl-mn-op-qr-st-uv-wx-yz'.repeat(5)).length).toBeLessThanOrEqual(80)
    expect(idCorto(HITL)).toBe('11111111')
    expect(idCorto('a1b2c3d4-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe('a1b2c3d4')
    expect(idCorto('ab-cd-ef-gh-ij')).toBe('abcdefgh')            // sin guiones ni símbolos: una sola palabra
    expect(idCorto('ab-cd-ef-gh-ij')).not.toContain('-')
  })
  it('isoDeTs convierte el ts de Slack a la hora del mensaje y rechaza lo que no es un ts', () => {
    expect(isoDeTs('1792575600.123456')).toBe('2026-10-21T09:40:00.123Z')
    for (const malo of ['', 'abc', '1.1', '1792575600', '1792575600.', '17925756000.1234567']) expect(isoDeTs(malo)).toBeNull()
  })
})

describe('hablarle a la puerta (POST y GET)', () => {
  const env = { baseUrl: 'https://app.test', internalKey: 'llave' }
  const respuesta = (status: number, cuerpo: unknown) => (async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch
  const cuerpo = cuerpoParaLaPuerta({ client_id: C1, hitl_id: HITL, pieza_titulo: 'P', pieza_familia: null, comentario: 'x', ts: TS, canal_slack: 'C1', respondido_en: '2026-10-21T12:00:00.000Z' })
  it('POST a /api/brain/alimentar/dueno con la llave interna y el cuerpo exacto', async () => {
    const vistas: Array<{ url: string; init?: RequestInit }> = []
    const f = (async (url: string, init?: RequestInit) => { vistas.push({ url, init }); return new Response(JSON.stringify({ ok: true, guardada: true }), { status: 200 }) }) as unknown as typeof fetch
    expect(await enviarALaPuerta(env, f, cuerpo)).toEqual({ ok: true, repetida: false })
    expect(vistas[0].url).toBe('https://app.test/api/brain/alimentar/dueno')
    expect(vistas[0].init?.method).toBe('POST')
    expect((vistas[0].init?.headers as Record<string, string>)['x-api-key']).toBe('llave')
    expect(JSON.parse(String(vistas[0].init?.body))).toEqual(cuerpo)
  })
  it('«ya estaba guardada» es éxito (repetida)', async () => { expect(await enviarALaPuerta(env, respuesta(200, { ok: true, repetida: true }), cuerpo)).toEqual({ ok: true, repetida: true }) })
  it('transitorios (se reintentan): red caída, 5xx, 429, puerta apagada, respuesta sin ok', async () => {
    for (const f of [(async () => { throw new Error('red') }) as unknown as typeof fetch, respuesta(502, { error: 'registro_fallido' }), respuesta(500, {}), respuesta(429, {}), respuesta(200, { apagado: true }), respuesta(200, { algo: 1 }), respuesta(200, { ok: false })]) {
      expect(await enviarALaPuerta(env, f, cuerpo)).toMatchObject({ ok: false, permanente: false })
    }
  })
  it('la puerta apagada se dice como tal (no como «sin ok»)', async () => {
    expect(await enviarALaPuerta(env, respuesta(200, { apagado: true }), cuerpo)).toMatchObject({ ok: false, permanente: false, error: expect.stringContaining('apagada') })
    expect(await enviarALaPuerta(env, respuesta(200, { algo: 1 }), cuerpo)).toMatchObject({ ok: false, permanente: false, error: expect.stringContaining('no confirmó') })
  })
  it('permanentes (no se reintentan, quedan anotados): 400, 404, 401, 403', async () => {
    for (const status of [400, 404, 401, 403]) expect(await enviarALaPuerta(env, respuesta(status, { error: 'entrada_invalida' }), cuerpo)).toMatchObject({ ok: false, permanente: true, error: expect.stringContaining(String(status)) })
  })
  const item = (id: string, respuesta_: string) => ({ ficha_id: id, tema: 't', pregunta: 'p', respuesta: respuesta_, canal: '#c', respondido_en: '2026-10-21T10:00:00.000Z', hace_dias: 0, confirmado_por_el_dueno: true })
  it('GET ?client_id= devuelve lo último que dijo el dueño; descarta lo vacío o sin id', async () => {
    const vistas: string[] = []
    const f = (async (url: string) => { vistas.push(url); return new Response(JSON.stringify({ ok: true, respuestas: [item('a', 'uno'), item('b', '   '), { respuesta: 'sin id' }, item('c', 'tres'), 5, null] }), { status: 200 }) }) as unknown as typeof fetch
    const r = await leerDeLaPuerta(env, f, C1)
    expect(r).toEqual({ ok: true, respuestas: [expect.objectContaining({ ficha_id: 'a', respuesta: 'uno' }), expect.objectContaining({ ficha_id: 'c', respuesta: 'tres' })] })
    expect(vistas[0]).toBe(`https://app.test/api/brain/alimentar/dueno?client_id=${C1}`)
  })
  it('GET: apagada, con error, sin respuestas o con red caída ⇒ ok:false con el motivo (nunca «no ha dicho nada»)', async () => {
    for (const [f, motivo] of [[respuesta(200, { apagado: true }), 'apagada'], [respuesta(502, {}), '502'], [respuesta(200, { ok: true }), 'no devolvió'], [respuesta(200, { ok: false, respuestas: [] }), 'no devolvió'], [(async () => { throw new Error('red caída') }) as unknown as typeof fetch, 'red caída']] as const) {
      const r = await leerDeLaPuerta(env, f, C1)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toContain(motivo)
    }
    expect(await leerDeLaPuerta(env, respuesta(200, { ok: true, respuestas: [] }), C1)).toEqual({ ok: true, respuestas: [] }) // un cliente sin nada dicho SÍ es ok y vacío
  })
})

describe('el envío con su cola', () => {
  let db: DbFalsa
  const env = { baseUrl: 'https://app.test', internalKey: 'llave', alCerebro: true }
  const puerta = (estados: Array<number | 'apagado' | 'red'>) => {
    const posts: Array<Record<string, unknown>> = []
    let n = 0
    const f = (async (_url: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body ?? '{}')))
      const e = estados[Math.min(n++, estados.length - 1)]
      if (e === 'red') throw new Error('red caída')
      if (e === 'apagado') return new Response(JSON.stringify({ apagado: true }), { status: 200 })
      return new Response(JSON.stringify(e === 200 ? { ok: true, guardada: true } : {}), { status: e })
    }) as unknown as typeof fetch
    return { f, posts }
  }
  const sembrar = (n = nota()) => db.semilla('notas_del_dueno', [{ ...n, creada_en: '2026-10-21T12:00:00.000Z' }])
  const fila = (id = 'n1') => db.tablas['notas_del_dueno_envios']?.find((x) => x.nota_id === id)
  beforeEach(() => { db = new DbFalsa() })

  it('si la puerta contesta, queda «enviada» (con su hora y el intento) y el cuerpo es el exacto', async () => {
    sembrar()
    const { f, posts } = puerta([200])
    expect(await enviarNotaAlCerebro(db, env, f, nota(), CTX)).toBe('enviada')
    expect(fila()).toMatchObject({ estado: 'enviada', intentos: 1, ultimo_error: null, ts: TS, canal_slack: 'C0C7XUKNCLS', respondido_en: CTX.respondido_en, enviada_en: expect.any(String) })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ client_id: C1, tema: temaDeLaNota(HITL), respuesta: 'Más corto', mensaje_ref: `C0C7XUKNCLS:${TS}` })
  })
  it('si el cerebro NO responde queda «pendiente» con el motivo, y la siguiente vuelta la sube — sin perderla', async () => {
    sembrar()
    let t = new Date('2026-10-21T12:00:00.000Z')
    const reloj = { ...env, ahora: () => t }
    const caida = puerta(['red'])
    expect(await enviarNotaAlCerebro(db, reloj, caida.f, nota(), CTX)).toBe('pendiente')
    expect(fila()).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_error: 'red caída', proximo_intento: '2026-10-21T12:05:00.000Z' })
    const sigue = puerta([200])
    expect(await reintentarPendientes(db, reloj, sigue.f)).toEqual({ intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0 }) // todavía no le toca (espera 5 min)
    t = new Date('2026-10-21T12:06:00.000Z')
    expect(await reintentarPendientes(db, reloj, sigue.f)).toEqual({ intentadas: 1, enviadas: 1, siguen: 0, rechazadas: 0 })
    expect(fila()).toMatchObject({ estado: 'enviada', intentos: 2, ultimo_error: null })
    expect(sigue.posts[0]).toMatchObject({ tema: temaDeLaNota(HITL), respuesta: 'Más corto', respondido_en: CTX.respondido_en })
  })
  it('puerta apagada, 5xx y 429: siguen pendientes vuelta tras vuelta, hasta que el cerebro responde', async () => {
    sembrar()
    let t = new Date('2026-10-21T12:00:00.000Z')
    const reloj = { ...env, ahora: () => t }
    const en = (min: number) => { t = new Date(new Date('2026-10-21T12:00:00.000Z').getTime() + min * 60_000) }
    expect(await enviarNotaAlCerebro(db, reloj, puerta(['apagado']).f, nota(), CTX)).toBe('pendiente')
    expect(fila()).toMatchObject({ intentos: 1, proximo_intento: '2026-10-21T12:05:00.000Z' })       // 1.ª espera: 5 min
    const caida = puerta([500, 429, 200])
    en(6); expect(await reintentarPendientes(db, reloj, caida.f)).toMatchObject({ intentadas: 1, siguen: 1 })
    expect(fila()).toMatchObject({ intentos: 2, proximo_intento: '2026-10-21T12:26:00.000Z' })       // 2.ª espera: 20 min
    en(10); expect(await reintentarPendientes(db, reloj, caida.f)).toMatchObject({ intentadas: 0 })  // aún no
    en(27); expect(await reintentarPendientes(db, reloj, caida.f)).toMatchObject({ intentadas: 1, siguen: 1 })
    expect(fila()).toMatchObject({ estado: 'pendiente', intentos: 3, proximo_intento: '2026-10-21T13:27:00.000Z' })   // 3.ª espera: 60 min
    en(130); expect(await reintentarPendientes(db, reloj, caida.f)).toMatchObject({ intentadas: 1, enviadas: 1, siguen: 0 })
    expect(fila()?.estado).toBe('enviada')
    expect(fila()?.proximo_intento).toBeNull()
  })
  it('un rechazo permanente de la puerta (400) queda «rechazada», anotado, y NO se reintenta', async () => {
    sembrar()
    expect(await enviarNotaAlCerebro(db, env, puerta([400]).f, nota(), CTX)).toBe('rechazada')
    expect(fila()).toMatchObject({ estado: 'rechazada', ultimo_error: expect.stringContaining('400') })
    const otra = puerta([200])
    expect(await reintentarPendientes(db, env, otra.f)).toEqual({ intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0 })
    expect(otra.posts).toHaveLength(0)
  })
  it('idempotente: repetir el envío de una nota ya enviada (o rechazada) no vuelve a llamar a la puerta ni cambia nada', async () => {
    sembrar()
    expect(await enviarNotaAlCerebro(db, env, puerta([200]).f, nota(), CTX)).toBe('enviada')
    const otra = puerta([200])
    expect(await enviarNotaAlCerebro(db, env, otra.f, nota(), CTX)).toBe('enviada')
    expect(otra.posts).toHaveLength(0)
    expect(db.tablas['notas_del_dueno_envios']).toHaveLength(1)
    expect(fila()?.intentos).toBe(1)
  })
  it('si no se puede escribir la fila de la cola: «pendiente» y NO se llama a la puerta (el clic se puede repetir)', async () => {
    sembrar()
    db.fallar['notas_del_dueno_envios'] = 'sin permiso'
    const { f, posts } = puerta([200])
    expect(await enviarNotaAlCerebro(db, env, f, nota(), CTX)).toBe('pendiente')
    expect(posts).toHaveLength(0)
  })
  it('un error al escribir la fila de la cola que NO es «ya existe» devuelve «pendiente» sin mirar nada más ni llamar a la puerta', async () => {
    sembrar()
    db.semilla('notas_del_dueno_envios', [{ nota_id: 'n1', estado: 'enviada', intentos: 1, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T12:00:00.000Z' }])
    const roto = { from: (t: string) => { const base = db.from(t); return t === 'notas_del_dueno_envios' ? new Proxy(base, { get: (o, p) => (p === 'insert' ? () => Promise.resolve({ data: null, error: { message: 'sin permiso', code: '42501' } }) : typeof (o as never)[p] === 'function' ? ((o as never)[p] as (...a: unknown[]) => unknown).bind(o) : (o as never)[p]) }) : base } }
    const { f, posts } = puerta([200])
    expect(await enviarNotaAlCerebro(roto, env, f, nota(), CTX)).toBe('pendiente')
    expect(posts).toHaveLength(0)
  })
  it('CANON DE LOOPS · tope: al cuarto fallo transitorio la nota pasa a «rechazada» (cola de descarte) con el motivo y AVISA a #alertas; no reintenta más', async () => {
    sembrar()
    let t = new Date('2026-10-21T12:00:00.000Z')
    const reloj = { ...env, slackToken: 'xoxb-1', ahora: () => t }
    const llamadas: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
    const f = (async (url: string, init?: RequestInit) => { llamadas.push({ url, cuerpo: JSON.parse(String(init?.body ?? '{}')) }); return String(url).includes('slack.com') ? new Response('{"ok":true}', { status: 200 }) : new Response('{}', { status: 503 }) }) as unknown as typeof fetch
    const intento = () => llamadas.filter((l) => l.url.includes('/api/brain/alimentar/dueno')).length
    expect(await enviarNotaAlCerebro(db, reloj, f, nota(), CTX)).toBe('pendiente')
    for (const min of [6, 27, 130]) { t = new Date(new Date('2026-10-21T12:00:00.000Z').getTime() + min * 60_000); await reintentarPendientes(db, reloj, f) }
    expect(intento()).toBe(4)                                                             // 1 + 3 reintentos, ni uno más
    expect(fila()).toMatchObject({ estado: 'rechazada', intentos: 4, ultimo_error: expect.stringContaining('descartada tras 4 intentos') })
    expect(fila()?.proximo_intento).toBeNull()
    const aviso = llamadas.filter((l) => l.url.includes('slack.com'))
    expect(aviso).toHaveLength(1)
    expect(aviso[0].cuerpo).toMatchObject({ channel: 'C0B7XUUEBHA', text: expect.stringContaining('tras 4 intentos') })
    t = new Date('2026-10-23T12:00:00.000Z')
    expect(await reintentarPendientes(db, reloj, f)).toEqual({ intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0 })   // ya no se toca
    expect(intento()).toBe(4)
  })
  it('el aviso del descarte nunca frena nada: sin token no hay aviso, y si Slack falla igual se descarta', async () => {
    sembrar()
    const t = new Date('2026-10-21T12:00:00.000Z')
    db.tablas['notas_del_dueno_envios'] = [{ nota_id: 'n1', estado: 'pendiente', intentos: 3, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T11:00:00.000Z', actualizada_en: '2026-10-21T11:00:00.000Z' }]
    const sinToken = puerta([503])
    expect(await reintentarPendientes(db, { ...env, ahora: () => t }, sinToken.f)).toMatchObject({ rechazadas: 1 })
    expect(sinToken.posts).toHaveLength(1)                                                 // solo la puerta: ningún aviso a Slack
    db.tablas['notas_del_dueno_envios'] = [{ nota_id: 'n1', estado: 'pendiente', intentos: 3, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T11:00:00.000Z', actualizada_en: '2026-10-21T11:00:00.000Z' }]
    const f = (async (url: string) => { if (String(url).includes('slack.com')) throw new Error('slack caído'); return new Response('{}', { status: 503 }) }) as unknown as typeof fetch
    expect(await reintentarPendientes(db, { ...env, slackToken: 'xoxb-1', ahora: () => t }, f)).toMatchObject({ rechazadas: 1 })
    expect(fila()?.estado).toBe('rechazada')
  })
  it('un grupo atascado esperando su turno NO bloquea a las notas nuevas', async () => {
    const t = new Date('2026-10-21T12:00:00.000Z')
    for (let i = 1; i <= 25; i++) {
      const n = nota({ id: `viejo${i}`, clave_unica: `kv${i}`, comentario: `viejo ${i}` })
      db.semilla('notas_del_dueno', [{ ...n, creada_en: '2026-10-21T10:00:00.000Z' }])
      db.semilla('notas_del_dueno_envios', [{ nota_id: n.id, estado: 'pendiente', intentos: 2, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T10:00:00.000Z', actualizada_en: '2026-10-21T11:55:00.000Z', proximo_intento: '2026-10-21T12:30:00.000Z' }])
    }
    sembrar(nota({ id: 'nueva', clave_unica: 'knueva', comentario: 'nueva' }))
    db.semilla('notas_del_dueno_envios', [{ nota_id: 'nueva', estado: 'pendiente', intentos: 0, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T11:59:00.000Z', actualizada_en: '2026-10-21T11:59:00.000Z' }])
    const { f, posts } = puerta([200])
    expect(await reintentarPendientes(db, { ...env, ahora: () => t }, f, 20)).toEqual({ intentadas: 1, enviadas: 1, siguen: 0, rechazadas: 0 })
    expect(posts.map((p) => p.respuesta)).toEqual(['nueva'])
  })
  it('con el empuje APAGADO (NOTAS_AL_CEREBRO sin encender) la nota se ENCOLA como pendiente y NO se llama a la puerta; al encenderlo, la siguiente vuelta la sube', async () => {
    sembrar()
    const apagada = { ...env, alCerebro: false }
    const { f, posts } = puerta([200])
    expect(await enviarNotaAlCerebro(db, apagada, f, nota(), CTX)).toBe('pendiente')
    expect(posts).toHaveLength(0)
    expect(fila()).toMatchObject({ estado: 'pendiente', intentos: 0, ts: TS, canal_slack: 'C0C7XUKNCLS' })
    expect(await reintentarPendientes(db, apagada, f)).toEqual({ intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0, apagado: true })
    expect(posts).toHaveLength(0)
    expect(await reintentarPendientes(db, env, f)).toEqual({ intentadas: 1, enviadas: 1, siguen: 0, rechazadas: 0 })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ acumula: true, tema: 'oficina creativa · pieza 11111111', mensaje_ref: `C0C7XUKNCLS:${TS}` })
    expect(fila()?.estado).toBe('enviada')
  })
  it('la vuelta reintenta las más viejas primero y con tope; una nota que ya no existe no la frena', async () => {
    for (let i = 1; i <= 3; i++) {
      const n = nota({ id: `n${i}`, clave_unica: `k${i}`, comentario: `comentario ${i}` })
      db.semilla('notas_del_dueno', [{ ...n, creada_en: `2026-10-21T12:0${i}:00.000Z` }])
      db.semilla('notas_del_dueno_envios', [{ nota_id: n.id, estado: 'pendiente', intentos: 1, ts: `1792575${600 + i}.000001`, canal_slack: 'C1', respondido_en: '2026-10-21T12:00:00.000Z', creada_en: `2026-10-21T12:0${i}:00.000Z`, actualizada_en: `2026-10-21T12:0${i}:00.000Z` }])
    }
    db.semilla('notas_del_dueno_envios', [{ nota_id: 'huerfana', estado: 'pendiente', intentos: 0, ts: '1792575600.000009', canal_slack: 'C1', respondido_en: '2026-10-21T12:00:00.000Z', creada_en: '2026-10-21T11:00:00.000Z', actualizada_en: '2026-10-21T11:00:00.000Z' }])
    const { f, posts } = puerta([200])
    expect(await reintentarPendientes(db, env, f, 3)).toEqual({ intentadas: 2, enviadas: 2, siguen: 1, rechazadas: 0 }) // la huérfana (la más vieja) no tiene nota: sigue, y no frena a las otras
    expect(posts.map((p) => p.respuesta)).toEqual(['comentario 1', 'comentario 2'])
  })
  it('una nota de la cola sin texto o sin pieza se rechaza por dentro y NO llama a la puerta', async () => {
    sembrar(nota({ id: 'vacia', clave_unica: 'v', comentario: null }))
    sembrar(nota({ id: 'sinpieza', clave_unica: 's', hitl_id: null }))
    for (const id of ['vacia', 'sinpieza']) db.semilla('notas_del_dueno_envios', [{ nota_id: id, estado: 'pendiente', intentos: 0, ts: TS, canal_slack: 'C1', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T12:00:00.000Z' }])
    const { f, posts } = puerta([200])
    expect(await reintentarPendientes(db, env, f)).toEqual({ intentadas: 2, enviadas: 0, siguen: 0, rechazadas: 2 })
    expect(posts).toHaveLength(0)
  })
  it('un error de la base al leer la cola se devuelve como error (no como «no había nada»)', async () => {
    db.fallar['notas_del_dueno_envios'] = 'caída'
    expect(await reintentarPendientes(db, env, puerta([200]).f)).toMatchObject({ intentadas: 0, error: expect.stringContaining('caída') })
  })
})

describe('qué sube al cerebro y qué no (la decisión del dueño)', () => {
  let db: DbFalsa
  const env = { baseUrl: 'https://app.test', internalKey: 'llave', alCerebro: true }
  const CFG = { autorizados: [EMILIO], ahora: () => new Date('2026-10-21T12:34:56.000Z') }
  const montar = (estados: Array<number | 'red'> = [200], estadoPieza = 'pending') => {
    db = new DbFalsa()
    db.semilla('hitl_queue', [{ id: HITL, client_id: C1, type: 'content_piece_review', status: estadoPieza, title: 'Post del lunes', output_id: null, metadata: { familia: 'post_img', version: '3', slack: { canal: 'C0C7XUKNCLS', ts: '1792575000.000100' } } }])
    const posts: Array<Record<string, unknown>> = []
    let n = 0
    const f = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/brain/alimentar/dueno')) {
        posts.push(JSON.parse(String(init?.body ?? '{}')))
        const e = estados[Math.min(n++, estados.length - 1)]
        if (e === 'red') throw new Error('red caída')
        return new Response(JSON.stringify(e === 200 ? { ok: true } : {}), { status: e })
      }
      if (String(url).includes('/api/hitl/')) { const fila = db.tablas['hitl_queue'][0]; fila.status = JSON.parse(String(init?.body ?? '{}')).status; return new Response('{}', { status: 200 }) }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch
    return { P: puertosDeNotas(db, { ...env, slackToken: 'xoxb-1' }, f), posts }
  }
  const comentar = (texto: string, ts = '1792575600.123456') => ({ tipo: 'comentar' as const, canal: 'C0C7XUKNCLS', hilo_ts: '1792575000.000100', ts, autor: EMILIO, texto })

  it('un comentario con texto sube al cerebro con el cuerpo exacto y la hora del mensaje', async () => {
    const { P, posts } = montar()
    const r = await procesar(P, CFG, comentar('Prefiero frases cortas'))
    expect(r.cuerpo).toMatchObject({ ok: true, cerebro: 'enviada' })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ evento: 'respuesta', client_id: C1, tema: 'oficina creativa · pieza 11111111', acumula: true, mensaje_ref: 'C0C7XUKNCLS:1792575600.123456', respuesta: 'Prefiero frases cortas', pregunta: 'Revisión de la pieza «Post del lunes» (post_img)', canal: '#oficina-creativa', respondido_en: '2026-10-21T09:40:00.123Z', dry_run: false })
  })
  it('un «Rechazar» con motivo sube (tema con el ts de la pieza); sin motivo NO', async () => {
    const a = montar()
    const r = await procesar(a.P, CFG, { tipo: 'rechazar', hitl_id: HITL, autor: EMILIO, canal: 'C0C7XUKNCLS', ts: '1792575000.000100', comentario: 'Demasiado formal' })
    expect(r.cuerpo).toMatchObject({ ok: true, decision: 'rejected', cerebro: 'enviada' })
    expect(a.posts[0]).toMatchObject({ tema: 'oficina creativa · pieza 11111111', acumula: true, mensaje_ref: 'C0C7XUKNCLS:1792575000.000100', respuesta: 'Demasiado formal', respondido_en: '2026-10-21T12:34:56.000Z' })
    const b = montar()
    const sin = await procesar(b.P, CFG, { tipo: 'rechazar', hitl_id: HITL, autor: EMILIO, canal: 'C0C7XUKNCLS', ts: '1792575000.000100', comentario: null })
    expect(sin.cuerpo).toMatchObject({ ok: true, decision: 'rejected', cerebro: 'no_aplica' })
    expect(b.posts).toHaveLength(0)
  })
  it('un rechazo sin ts ni canal conocidos (y una pieza sin mensaje de Slack) no sube nada, pero se registra', async () => {
    const { P, posts } = montar()
    db.tablas['hitl_queue'][0].metadata = { familia: 'post_img' }
    const r = await procesar(P, CFG, { tipo: 'rechazar', hitl_id: HITL, autor: EMILIO, canal: null, ts: null, comentario: 'Demasiado formal' })
    expect(r.cuerpo).toMatchObject({ ok: true, decision: 'rejected', cerebro: 'no_aplica' })
    expect(posts).toHaveLength(0)
    expect(db.tablas['notas_del_dueno']).toHaveLength(1)
  })
  it('Aprobar (sin texto) NO sube: no es un hecho del cliente, queda solo en el registro', async () => {
    const { P, posts } = montar()
    const r = await procesar(P, CFG, { tipo: 'aprobar', hitl_id: HITL, autor: EMILIO, canal: 'C0C7XUKNCLS', ts: '1792575000.000100' })
    expect(r.cuerpo).toMatchObject({ ok: true, decision: 'approved', cerebro: 'no_aplica' })
    expect(posts).toHaveLength(0)
    expect(db.tablas['notas_del_dueno']).toHaveLength(1) // pero el registro sí
  })
  it('las notas «general:» NO suben (el cerebro es por cliente): se quedan en el registro', async () => {
    const { P, posts } = montar()
    const c = await procesar(P, CFG, comentar('general: nada de signos de exclamación'))
    expect(c.cuerpo).toMatchObject({ ok: true, alcance: 'general', cerebro: 'no_aplica' })
    const r = await procesar(P, CFG, { tipo: 'rechazar', hitl_id: HITL, autor: EMILIO, canal: 'C0C7XUKNCLS', ts: '1792575000.000100', comentario: 'general: tutea siempre' })
    expect(r.cuerpo).toMatchObject({ cerebro: 'no_aplica' })
    expect(posts).toHaveLength(0)
    expect(db.tablas['notas_del_dueno'].map((n) => n.alcance)).toEqual(['general', 'general'])
  })
  it('si el cerebro no responde: la respuesta sigue siendo ok, la nota queda en el registro y pendiente en la cola, y la siguiente vuelta la sube', async () => {
    const { P, posts } = montar(['red', 200])
    const r = await procesar(P, CFG, comentar('Prefiero frases cortas'))
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ok: true, cerebro: 'pendiente' })
    expect(db.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'pendiente' })
    const vuelta = await reintentarPendientes(db, { ...env, alCerebro: true, slackToken: 'x', ahora: () => new Date(Date.now() + 10 * 60_000) }, (async (_u: string, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body ?? '{}'))); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }) as unknown as typeof fetch)
    expect(vuelta).toMatchObject({ enviadas: 1 })
    expect(posts[1]).toMatchObject({ respuesta: 'Prefiero frases cortas', tema: 'oficina creativa · pieza 11111111', acumula: true })
  })
  it('el mismo comentario repetido (reintento de Slack) no sube dos veces', async () => {
    const { P, posts } = montar()
    await procesar(P, CFG, comentar('Prefiero frases cortas'))
    await procesar(P, CFG, comentar('Prefiero frases cortas'))
    expect(posts).toHaveLength(1)
    expect(db.tablas['notas_del_dueno']).toHaveLength(1)
  })
  it('dos comentarios de la misma pieza suben con el MISMO tema corto, acumula:true y mensajes distintos (la puerta los suma, no los reemplaza)', async () => {
    const { P, posts } = montar()
    await procesar(P, CFG, comentar('uno', '1792575600.000001'))
    await procesar(P, CFG, comentar('dos', '1792575700.000001'))
    expect(posts.map((p) => p.tema)).toEqual(['oficina creativa · pieza 11111111', 'oficina creativa · pieza 11111111'])
    expect(posts.map((p) => p.acumula)).toEqual([true, true])
    expect(posts.map((p) => p.mensaje_ref)).toEqual(['C0C7XUKNCLS:1792575600.000001', 'C0C7XUKNCLS:1792575700.000001'])
  })
  it('con el empuje apagado el comentario se registra y queda en cola, sin llamar a la puerta (hasta que CC-CEREBRO publique acumula)', async () => {
    const { P: _P, posts } = montar()
    const apagada = puertosDeNotas(db, { ...env, alCerebro: false, slackToken: 'xoxb-1' }, (async () => { throw new Error('no debe llamarse') }) as unknown as typeof fetch)
    const r = await procesar(apagada, CFG, comentar('Prefiero frases cortas'))
    expect(r.cuerpo).toMatchObject({ ok: true, cerebro: 'pendiente' })
    expect(posts).toHaveLength(0)
    expect(db.tablas['notas_del_dueno']).toHaveLength(1)
    expect(db.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'pendiente', intentos: 0 })
  })
  it('un puerto sin el envío (la bandera apagada) no sube nada y no rompe', async () => {
    const { P } = montar()
    const sinEnvio = { ...P, enviarAlCerebro: undefined }
    expect((await procesar(sinEnvio, CFG, comentar('hola'))).cuerpo).toMatchObject({ ok: true, cerebro: 'no_aplica' })
  })
  it('si el envío lanza, el comentario igual queda registrado y la respuesta es ok', async () => {
    const { P } = montar()
    const roto = { ...P, enviarAlCerebro: async () => { throw new Error('boom') } }
    expect((await procesar(roto, CFG, comentar('hola'))).cuerpo).toMatchObject({ ok: true, cerebro: 'pendiente' })
  })
})

describe('los diez clientes de prueba (agnóstico): ni se mezclan ni se heredan', () => {
  const envDiez = { baseUrl: 'https://app.test', internalKey: 'llave', alCerebro: true }
  const RUBROS = ['panadería', 'clínica dental', 'estudio contable', 'gimnasio', 'librería', 'taller mecánico', 'floristería', 'agencia de viajes', 'escuela de idiomas', 'ferretería']
  const clientes = RUBROS.map((rubro, i) => ({ rubro, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, '0')}`, hitl: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i + 1).padStart(12, '0')}` }))
  const env = { baseUrl: 'https://app.test', internalKey: 'llave' }
  const CFG = { autorizados: [EMILIO] }

  it('cada cliente sube SUS notas con SU client_id y SU pieza; ninguna nota nombra a otro cliente', async () => {
    const db = new DbFalsa()
    db.semilla('hitl_queue', clientes.map((c) => ({ id: c.hitl, client_id: c.id, type: 'content_piece_review', status: 'pending', title: `Pieza de ${c.rubro}`, output_id: null, metadata: { familia: 'post_img', slack: { canal: 'C0C7XUKNCLS', ts: `1792575000.00${c.hitl.slice(-2)}00` } } })))
    const posts: Array<Record<string, unknown>> = []
    const f = (async (_u: string, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body ?? '{}'))); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }) as unknown as typeof fetch
    const P = puertosDeNotas(db, { ...envDiez, slackToken: 'x' }, f)
    for (const c of clientes) await procesar(P, CFG, { tipo: 'comentar', canal: 'C0C7XUKNCLS', hilo_ts: `1792575000.00${c.hitl.slice(-2)}00`, ts: `1792575600.00${c.hitl.slice(-2)}00`, autor: EMILIO, texto: `Para la ${c.rubro}: frases cortas` })
    expect(posts).toHaveLength(10)
    for (const c of clientes) {
      const mias = posts.filter((p) => p.client_id === c.id)
      expect(mias).toHaveLength(1)
      expect(mias[0].tema).toContain(c.hitl.replace(/-/g, '').slice(0, 8))
      for (const otro of clientes.filter((x) => x.id !== c.id)) { expect(JSON.stringify(mias[0])).not.toContain(otro.rubro); expect(JSON.stringify(mias[0])).not.toContain(otro.hitl) }
    }
  })
  it('lo que lee la auto-revisión de cada cliente es SOLO lo suyo del cerebro; las generales no traen el título de ninguna pieza', async () => {
    const { crearPuertos } = await import('../../oficina/adaptadores')
    const db = new DbFalsa()
    db.semilla('notas_del_dueno', [{ id: 'g1', client_id: clientes[0].id, alcance: 'general', tipo: 'comentario', comentario: 'Tutea siempre', hitl_id: clientes[0].hitl, output_id: null, pieza_titulo: `Pieza de ${clientes[0].rubro}`, pieza_version: null, pieza_familia: null, origen: 'slack', autor: EMILIO, clave_unica: 'g1', creada_en: '2026-10-21T10:00:00.000Z' }])
    const f = (async (url: string) => {
      const id = new URL(url).searchParams.get('client_id')!
      const c = clientes.find((x) => x.id === id)!
      return new Response(JSON.stringify({ ok: true, respuestas: [{ ficha_id: `f-${id}`, tema: 't', pregunta: 'Revisión de la pieza', respuesta: `Solo para la ${c.rubro}`, canal: '#oficina-creativa', respondido_en: '2026-10-21T09:00:00.000Z' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const P = crearPuertos(db, { ...env, notasDelDueno: true }, f)
    for (const c of clientes) {
      const l = await P.notas!.leer(c.id)
      expect(l.error).toBeUndefined()
      const texto = JSON.stringify(l.notas)
      expect(texto).toContain(`Solo para la ${c.rubro}`)
      expect(texto).toContain('Tutea siempre')
      expect(texto).not.toContain(`Pieza de ${clientes[0].rubro}`) // el título de la pieza de origen de una general nunca viaja
      for (const otro of clientes.filter((x) => x.id !== c.id)) expect(texto).not.toContain(`Solo para la ${otro.rubro}`)
    }
  })
  it('AGNÓSTICO: ningún archivo del módulo nombra a un cliente, un producto o una ciudad concretos', () => {
    const dir = path.resolve(__dirname, '..')
    const prohibido = /n[aá]ufrago|ceviche|ol[oó]n\b|guayaquil|peniche|p[eé]rez/i
    const culpables = fs.readdirSync(dir).filter((n) => n.endsWith('.ts')).filter((n) => prohibido.test(fs.readFileSync(path.join(dir, n), 'utf8')))
    expect(culpables).toEqual([])
  })
})

describe('lo que viaja a la jefatura y a GPT NO lleva notas ni lecturas del cerebro', () => {
  it('el sobre de la revisión (lo que recibe la jefatura y de ahí GPT) no contiene ninguna nota, aunque el cliente tenga notas y el cerebro devuelva respuestas', async () => {
    const plantilla = conSegundoCerebro(POST_IMG_CON_JEFATURA)
    const M = crearMemoria({ plantilla })
    const SECRETA = 'NOTA-SECRETA-DEL-DUENO-XYZ'
    const llamadasAlCerebro: string[] = []
    M.P.notas = { leer: async () => ({ notas: [{ id: 'f-secreta', texto: `El dueño dijo (#oficina-creativa, 2026-10-21): «${SECRETA}»` }] }), registrar: async () => {} }
    const sobres: unknown[] = []
    M.P.jefatura = async (sobre) => { sobres.push(sobre); return { estado: 'esperando', revision_id: 'rev-1' } as never }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: plantilla.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const r = await correr(M, id, {
      paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }), texto: () => ({ texto: PIEZA_OK }),
      autorevision_texto: () => ({ texto: '{"choca": false, "hallazgos": []}' }), autorevision_diseno: () => ({ texto: '{"choca": false, "hallazgos": []}' }),
    }, 60)
    expect(r.pasos).toContain('autorevision_texto')                       // la auto-revisión SÍ vio la nota…
    expect(r.tareas['autorevision_texto'][0]).toContain(SECRETA)
    expect(sobres).toHaveLength(1)                                         // …y la jefatura recibió su sobre…
    const sobre = JSON.stringify(sobres[0])
    expect(sobre).not.toContain(SECRETA)                                   // …sin la nota
    expect(sobre).not.toMatch(/notas_del_dueno|alimentar\/dueno|f-secreta|El dueño dijo/)
    expect(M.llamadas.revisorPedidos.join('\n')).not.toContain(SECRETA)   // ni el revisor GPT
    for (const [paso, ts] of Object.entries(r.tareas)) if (!paso.startsWith('autorevision')) for (const t of ts) expect(t).not.toContain(SECRETA)
    expect(llamadasAlCerebro).toEqual([])
  })
  it('ningún archivo de la jefatura, del revisor GPT, del pedido ciego ni del paso de la jefatura habla con la puerta del dueño del cerebro', () => {
    const raiz = path.resolve(__dirname, '../../..')
    const archivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === '__tests__' ? [] : archivos(path.join(dir, d.name))) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []))
    const revisados = [...archivos(path.join(raiz, 'lib/jefatura')), ...fs.readdirSync(path.join(raiz, 'lib')).filter((n) => /^revisor-gpt/.test(n)).map((n) => path.join(raiz, 'lib', n)), path.join(raiz, 'lib/oficina/ciego.ts'), path.join(raiz, 'lib/oficina/paso-jefatura.ts')]
    expect(revisados.length).toBeGreaterThan(10)
    expect(revisados.filter((f) => /alimentar\/dueno|puerta-del-dueno|notas-del-dueno|notas_del_dueno/.test(fs.readFileSync(f, 'utf8')))).toEqual([])
  })
})

describe('las rutas de Slack también reintentan lo pendiente (la siguiente vuelta)', () => {
  const posts: Array<Record<string, unknown>> = []
  const llaves: string[] = []
  beforeEach(() => {
    dbRutas = new DbFalsa(); posts.length = 0; pendientes.length = 0
    process.env.SLACK_SIGNING_SECRET = 'sec'; process.env.NOTAS_DEL_DUENO = '1'; process.env.NOTAS_AL_CEREBRO = '1'; process.env.NOTAS_AUTORIZADOS = EMILIO; process.env.INTERNAL_API_KEY = 'llave'; process.env.SLACK_BOT_TOKEN = 'xoxb-1'
    dbRutas.semilla('notas_del_dueno', [{ ...nota(), creada_en: '2026-10-21T12:00:00.000Z' }])
    dbRutas.semilla('notas_del_dueno_envios', [{ nota_id: 'n1', estado: 'pendiente', intentos: 1, ts: TS, canal_slack: 'C0C7XUKNCLS', respondido_en: CTX.respondido_en, creada_en: '2026-10-21T12:00:00.000Z' }])
    llaves.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { if (String(url).includes('/api/brain/alimentar/dueno')) { posts.push(JSON.parse(String(init?.body ?? '{}'))); llaves.push(((init?.headers ?? {}) as Record<string, string>)['x-api-key'] ?? '') } return new Response(JSON.stringify({ ok: true }), { status: 200 }) }))
  })
  afterEach(() => { vi.unstubAllGlobals(); for (const k of ['SLACK_SIGNING_SECRET', 'NOTAS_DEL_DUENO', 'NOTAS_AL_CEREBRO', 'NOTAS_AUTORIZADOS', 'INTERNAL_API_KEY', 'SLACK_BOT_TOKEN']) delete process.env[k] })
  it('con NOTAS_AL_CEREBRO apagado las rutas NO suben nada: lo pendiente espera', async () => {
    delete process.env.NOTAS_AL_CEREBRO
    const crypto = await import('node:crypto')
    const { POST } = await import('@/app/api/slack/eventos/route')
    const cuerpo = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C9OTRO', ts: '2.2', thread_ts: '1.1', user: EMILIO, text: 'hola' } })
    const marca = String(Math.floor(Date.now() / 1000))
    const firma = 'v0=' + crypto.createHmac('sha256', 'sec').update(`v0:${marca}:${cuerpo}`).digest('hex')
    expect((await POST(new Request('https://app.test/api/slack/eventos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': marca, 'x-slack-signature': firma }, body: cuerpo }))).status).toBe(200)
    await Promise.all(pendientes)
    expect(posts).toHaveLength(0)
    expect(dbRutas.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'pendiente' })
  })
  it('cada evento firmado de Slack sube primero lo que quedó pendiente', async () => {
    const crypto = await import('node:crypto')
    const { POST } = await import('@/app/api/slack/eventos/route')
    const cuerpo = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C9OTRO', ts: '2.2', thread_ts: '1.1', user: EMILIO, text: 'hola' } })
    const marca = String(Math.floor(Date.now() / 1000))
    const firma = 'v0=' + crypto.createHmac('sha256', 'sec').update(`v0:${marca}:${cuerpo}`).digest('hex')
    const res = await POST(new Request('https://app.test/api/slack/eventos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': marca, 'x-slack-signature': firma }, body: cuerpo }))
    expect(res.status).toBe(200)
    await Promise.all(pendientes)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ respuesta: 'Más corto', client_id: C1 })
    expect(llaves).toEqual(['llave'])                                              // con la llave interna, no vacía
    expect(dbRutas.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'enviada' })
  })
  it('D2 · con la bandera encendida un COMENTARIO nuevo sube al cerebro en el momento (no espera a la siguiente vuelta)', async () => {
    const crypto = await import('node:crypto')
    const { POST } = await import('@/app/api/slack/eventos/route')
    dbRutas.tablas['notas_del_dueno_envios'] = []; dbRutas.tablas['notas_del_dueno'] = []
    dbRutas.semilla('hitl_queue', [{ id: HITL, client_id: C1, type: 'content_piece_review', status: 'pending', title: 'Post del lunes', output_id: null, metadata: { familia: 'post_img', slack: { canal: 'C0C7XUKNCLS', ts: '1792575000.000100' } } }])
    const cuerpo = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C0C7XUKNCLS', ts: '1792575600.123456', thread_ts: '1792575000.000100', user: EMILIO, text: 'Prefiero frases cortas' } })
    const marca = String(Math.floor(Date.now() / 1000))
    const firma = 'v0=' + crypto.createHmac('sha256', 'sec').update(`v0:${marca}:${cuerpo}`).digest('hex')
    expect((await POST(new Request('https://app.test/api/slack/eventos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': marca, 'x-slack-signature': firma }, body: cuerpo }))).status).toBe(200)
    await Promise.all(pendientes)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ respuesta: 'Prefiero frases cortas', tema: 'oficina creativa · pieza 11111111', acumula: true })
    expect(dbRutas.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'enviada', intentos: 1 })
  })
  it('D2 · los puertos reales (los de los clics y comentarios) llevan la bandera: encendida, la respuesta del propio comentario dice «enviada»; apagada, «pendiente»', async () => {
    const { puertosReales } = await import('@/lib/notas-del-dueno/ruta')
    dbRutas.tablas['notas_del_dueno_envios'] = []; dbRutas.tablas['notas_del_dueno'] = []
    dbRutas.semilla('hitl_queue', [{ id: HITL, client_id: C1, type: 'content_piece_review', status: 'pending', title: 'Post del lunes', output_id: null, metadata: { familia: 'post_img', slack: { canal: 'C0C7XUKNCLS', ts: '1792575000.000100' } } }])
    const comentario = (ts: string) => ({ tipo: 'comentar' as const, canal: 'C0C7XUKNCLS', hilo_ts: '1792575000.000100', ts, autor: EMILIO, texto: 'Prefiero frases cortas' })
    const encendido = await procesar(puertosReales(new Request('https://app.test/x')), { autorizados: [EMILIO] }, comentario('1792575600.000001'))
    expect(encendido.cuerpo).toMatchObject({ ok: true, cerebro: 'enviada' })
    delete process.env.NOTAS_AL_CEREBRO
    const apagado = await procesar(puertosReales(new Request('https://app.test/x')), { autorizados: [EMILIO] }, comentario('1792575700.000001'))
    expect(apagado.cuerpo).toMatchObject({ ok: true, cerebro: 'pendiente' })
  })
  it('D2 · con la bandera APAGADA el mismo comentario se registra y queda en cola, sin llamar a la puerta', async () => {
    delete process.env.NOTAS_AL_CEREBRO
    const crypto = await import('node:crypto')
    const { POST } = await import('@/app/api/slack/eventos/route')
    dbRutas.tablas['notas_del_dueno_envios'] = []; dbRutas.tablas['notas_del_dueno'] = []
    dbRutas.semilla('hitl_queue', [{ id: HITL, client_id: C1, type: 'content_piece_review', status: 'pending', title: 'Post del lunes', output_id: null, metadata: { familia: 'post_img', slack: { canal: 'C0C7XUKNCLS', ts: '1792575000.000100' } } }])
    const cuerpo = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C0C7XUKNCLS', ts: '1792575600.123456', thread_ts: '1792575000.000100', user: EMILIO, text: 'Prefiero frases cortas' } })
    const marca = String(Math.floor(Date.now() / 1000))
    const firma = 'v0=' + crypto.createHmac('sha256', 'sec').update(`v0:${marca}:${cuerpo}`).digest('hex')
    await POST(new Request('https://app.test/api/slack/eventos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': marca, 'x-slack-signature': firma }, body: cuerpo }))
    await Promise.all(pendientes)
    expect(posts).toHaveLength(0)
    expect(dbRutas.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'pendiente', intentos: 0 })
  })
  it('cada clic firmado en los botones también sube primero lo que quedó pendiente', async () => {
    const crypto = await import('node:crypto')
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const cuerpo = 'payload=' + encodeURIComponent(JSON.stringify({ type: 'block_actions', user: { id: 'U0AJENO' }, trigger_id: 'T1', container: { channel_id: 'C1', message_ts: '1.1' }, actions: [{ action_id: 'nota_aprobar', value: HITL }] }))
    const marca = String(Math.floor(Date.now() / 1000))
    const firma = 'v0=' + crypto.createHmac('sha256', 'sec').update(`v0:${marca}:${cuerpo}`).digest('hex')
    const res = await POST(new Request('https://app.test/api/slack/interactividad', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': marca, 'x-slack-signature': firma }, body: cuerpo }))
    expect(res.status).toBe(200)
    await Promise.all(pendientes)
    expect(posts).toHaveLength(1)                                                  // aunque quien hizo clic no estaba autorizado, la cola avanza
    expect(dbRutas.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'enviada' })
  })
  it('la vuelta del reloj de la oficina (el vigía) también los sube, solo con la bandera encendida', async () => {
    vi.doMock('@/lib/oficina/ruta', async (orig) => ({ ...(await orig<typeof import('@/lib/oficina/ruta')>()), checkLlaveDeLaSala: () => ({ ok: true }), puertosReales: () => ({ P: { almacen: { leerConfig: async () => ({ estado: 'encendida', familias_activas: [], clientes_ensayo: [] }) }, ahora: () => new Date() }, dbRutas }) }))
    vi.doMock('@/lib/oficina/vigia', () => ({ vencerBandeja: async () => ({ vencidas: 0 }), revisarPasosMuertos: async () => ({ reanudar: 0, fallidos: 0, cierres: 0 }) }))
    vi.resetModules()
    const { POST } = await import('@/app/api/oficina/vigia/route')
    const pedir = () => POST(new Request('https://app.test/api/oficina/vigia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    const r = await (await pedir()).json()
    expect(r.notas_del_dueno).toMatchObject({ intentadas: 1, enviadas: 1 })
    delete process.env.NOTAS_DEL_DUENO
    dbRutas.tablas['notas_del_dueno_envios'][0].estado = 'pendiente'
    const apagado = await (await pedir()).json()
    expect(apagado.notas_del_dueno).toBeUndefined()
    process.env.NOTAS_DEL_DUENO = '1'; delete process.env.NOTAS_AL_CEREBRO
    expect((await (await pedir()).json()).notas_del_dueno).toMatchObject({ intentadas: 0, apagado: true })   // con el empuje apagado la vuelta no sube nada
    vi.doUnmock('@/lib/oficina/ruta'); vi.doUnmock('@/lib/oficina/vigia')
  })
})

describe('la lectura del cerebro se mezcla con las generales sin pasarse de tope', () => {
  it('el cerebro primero, sin repetir, y todo junto dentro del tope de caracteres', () => {
    const delCerebro = vistasDelCerebro([{ ficha_id: 'f1', pregunta: 'p', respuesta: 'uno', canal: '#c', respondido_en: '2026-10-21T10:00:00Z' }, { ficha_id: 'f2', pregunta: '', respuesta: '   ', canal: '', respondido_en: '' }, { ficha_id: 'f3', pregunta: '', respuesta: 'tres', canal: '', respondido_en: '' }])
    expect(delCerebro.map((v) => v.id)).toEqual(['f1', 'f3'])
    expect(delCerebro[0].texto).toBe('El dueño dijo (#c, 2026-10-21) sobre «p»: «uno»')
    expect(delCerebro[1].texto).toBe('El dueño dijo (sin canal, sin fecha): «tres»')
    expect(unirVistas(delCerebro, [{ id: 'f1', texto: 'repetida' }, { id: 'g1', texto: 'general' }]).map((v) => v.id)).toEqual(['f1', 'f3', 'g1'])
    expect(unirVistas([{ id: 'a', texto: 'x'.repeat(40) }], [{ id: 'b', texto: 'y'.repeat(40) }], 60).map((v) => v.id)).toEqual(['a'])
    const larga = vistasDelCerebro([{ ficha_id: 'L', pregunta: '', respuesta: 'z'.repeat(2000), canal: 'c', respondido_en: '' }])
    expect(larga[0].texto.length).toBeLessThan(500)
    expect(larga[0].texto.endsWith('…»')).toBe(true)
    expect(vistasDelCerebro(Array.from({ length: 40 }, (_, i) => ({ ficha_id: `f${i}`, pregunta: '', respuesta: `r${i}`, canal: 'c', respondido_en: '' }))).length).toBe(15)
  })
})
