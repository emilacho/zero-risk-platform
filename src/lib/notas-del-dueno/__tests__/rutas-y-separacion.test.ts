import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { ACCION_APROBAR } from '../mensaje-pieza'

const HITL = '11111111-1111-4111-8111-111111111111'
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SECRETO = 'secreto-de-prueba'
const EMILIO = 'U0EMILIO1'

let db: DbFalsa
const llamadasSlack: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
const patches: Array<{ id: string; cuerpo: Record<string, unknown> }> = []

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { pendientes.push(p) } }))
const pendientes: Array<Promise<unknown>> = []

const firmar = (cuerpo: string, marca = String(Math.floor(Date.now() / 1000)), secreto = SECRETO) => ({ 'x-slack-request-timestamp': marca, 'x-slack-signature': 'v0=' + crypto.createHmac('sha256', secreto).update(`v0:${marca}:${cuerpo}`).digest('hex') })
const peticion = (ruta: string, cuerpo: string, cab: Record<string, string>, tipo: string) => new Request(`https://app.test${ruta}`, { method: 'POST', headers: { 'content-type': tipo, ...cab }, body: cuerpo })
const clic = (action_id = ACCION_APROBAR, user = EMILIO) => 'payload=' + encodeURIComponent(JSON.stringify({ type: 'block_actions', user: { id: user }, trigger_id: 'T1', container: { channel_id: 'C1', message_ts: '1.1' }, actions: [{ action_id, value: HITL }] }))

beforeEach(() => {
  db = new DbFalsa()
  db.semilla('hitl_queue', [{ id: HITL, client_id: CLIENTE, type: 'content_piece_review', status: 'pending', title: 'Post', output_id: null, metadata: { slack: { canal: 'C1', ts: '1.1' } } }])
  llamadasSlack.length = 0; patches.length = 0; pendientes.length = 0
  process.env.SLACK_SIGNING_SECRET = SECRETO
  process.env.NOTAS_DEL_DUENO = '1'
  process.env.NOTAS_AUTORIZADOS = EMILIO
  process.env.INTERNAL_API_KEY = 'llave'
  process.env.SLACK_BOT_TOKEN = 'xoxb-1'
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (url.includes('/api/hitl/')) { patches.push({ id: url.split('/').pop()!, cuerpo }); const f = (db.tablas['hitl_queue'] ?? []).find((x) => x.id === HITL); if (f) f.status = cuerpo.status; return new Response('{}', { status: 200 }) }
    llamadasSlack.push({ url, cuerpo })
    return new Response(JSON.stringify({ ok: true, ts: '9.9' }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of ['SLACK_SIGNING_SECRET', 'NOTAS_DEL_DUENO', 'NOTAS_AUTORIZADOS', 'INTERNAL_API_KEY', 'SLACK_BOT_TOKEN']) delete process.env[k] })

describe('POST /api/slack/interactividad', () => {
  it('sin firma o con firma mala: 401 y no toca nada', async () => {
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic()
    expect((await POST(peticion('/api/slack/interactividad', c, {}, 'application/x-www-form-urlencoded'))).status).toBe(401)
    expect((await POST(peticion('/api/slack/interactividad', c, firmar(c, undefined, 'otro'), 'application/x-www-form-urlencoded'))).status).toBe(401)
    await Promise.all(pendientes)
    expect(patches).toHaveLength(0)
    expect(db.tablas['notas_del_dueno'] ?? []).toHaveLength(0)
  })
  it('sin SLACK_SIGNING_SECRET nada se acepta, ni con una firma «correcta» hecha con vacío', async () => {
    delete process.env.SLACK_SIGNING_SECRET
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic()
    expect((await POST(peticion('/api/slack/interactividad', c, firmar(c, undefined, ''), 'application/x-www-form-urlencoded'))).status).toBe(401)
  })
  it('apagada por omisión: firmada pero sin el interruptor responde 503 y no toca nada', async () => {
    delete process.env.NOTAS_DEL_DUENO
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic()
    expect((await POST(peticion('/api/slack/interactividad', c, firmar(c), 'application/x-www-form-urlencoded'))).status).toBe(503)
    await Promise.all(pendientes)
    expect(patches).toHaveLength(0)
  })
  it('un clic firmado de Emilio responde 200 enseguida y, en segundo plano, decide y guarda la nota', async () => {
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic()
    const r = await POST(peticion('/api/slack/interactividad', c, firmar(c), 'application/x-www-form-urlencoded'))
    expect(r.status).toBe(200)
    await Promise.all(pendientes)
    expect(patches).toEqual([{ id: HITL, cuerpo: expect.objectContaining({ status: 'approved', reviewer: `slack:${EMILIO}` }) }])
    expect(db.tablas['notas_del_dueno']).toHaveLength(1)
    expect(llamadasSlack.some((l) => l.url.endsWith('chat.postMessage') && l.cuerpo.thread_ts === '1.1')).toBe(true) // le contesta en el hilo
  })
  it('un clic de otra persona, aunque venga firmado, no decide nada', async () => {
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic(ACCION_APROBAR, 'U0OTRO')
    expect((await POST(peticion('/api/slack/interactividad', c, firmar(c), 'application/x-www-form-urlencoded'))).status).toBe(200)
    await Promise.all(pendientes)
    expect(patches).toHaveLength(0)
    expect(db.tablas['notas_del_dueno'] ?? []).toHaveLength(0)
  })
  it('una firma vieja (repetición) se rechaza aunque sea auténtica', async () => {
    const { POST } = await import('@/app/api/slack/interactividad/route')
    const c = clic()
    const vieja = String(Math.floor(Date.now() / 1000) - 3600)
    expect((await POST(peticion('/api/slack/interactividad', c, firmar(c, vieja), 'application/x-www-form-urlencoded'))).status).toBe(401)
  })
})

describe('POST /api/slack/eventos', () => {
  const cuerpoEvento = (e: Record<string, unknown>) => JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C1', ts: '2.2', thread_ts: '1.1', user: EMILIO, text: 'Más corto', ...e } })
  it('sin firma: 401, también para el reto', async () => {
    const { POST } = await import('@/app/api/slack/eventos/route')
    const reto = JSON.stringify({ type: 'url_verification', challenge: 'abc' })
    expect((await POST(peticion('/api/slack/eventos', reto, {}, 'application/json'))).status).toBe(401)
  })
  it('el reto firmado se contesta aunque el interruptor esté apagado (así Slack puede validar la dirección)', async () => {
    delete process.env.NOTAS_DEL_DUENO
    const { POST } = await import('@/app/api/slack/eventos/route')
    const reto = JSON.stringify({ type: 'url_verification', challenge: 'abc' })
    const r = await POST(peticion('/api/slack/eventos', reto, firmar(reto), 'application/json'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ challenge: 'abc' })
  })
  it('apagada: un mensaje firmado responde 503 y no guarda nada', async () => {
    delete process.env.NOTAS_DEL_DUENO
    const { POST } = await import('@/app/api/slack/eventos/route')
    const c = cuerpoEvento({})
    expect((await POST(peticion('/api/slack/eventos', c, firmar(c), 'application/json'))).status).toBe(503)
    await Promise.all(pendientes)
    expect(db.tablas['notas_del_dueno'] ?? []).toHaveLength(0)
  })
  it('un comentario firmado de Emilio en el hilo de una pieza se guarda como nota', async () => {
    const { POST } = await import('@/app/api/slack/eventos/route')
    const c = cuerpoEvento({})
    expect((await POST(peticion('/api/slack/eventos', c, firmar(c), 'application/json'))).status).toBe(200)
    await Promise.all(pendientes)
    expect(db.tablas['notas_del_dueno']).toEqual([expect.objectContaining({ tipo: 'comentario', comentario: 'Más corto', client_id: CLIENTE })])
    expect(patches).toHaveLength(0) // comentar no decide
  })
  it('un cuerpo que no es JSON: 400 (ya con la firma verificada)', async () => {
    const { POST } = await import('@/app/api/slack/eventos/route')
    const c = 'no es json'
    expect((await POST(peticion('/api/slack/eventos', c, firmar(c), 'application/json'))).status).toBe(400)
  })
})

describe('separación: la jefatura y la segunda mirada GPT NO leen las notas', () => {
  const raiz = path.resolve(__dirname, '../../..')
  const archivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === '__tests__' ? [] : archivos(path.join(dir, d.name))) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []))
  const jefatura = [...archivos(path.join(raiz, 'lib/jefatura')), ...fs.readdirSync(path.join(raiz, 'lib')).filter((n) => /^revisor-gpt/.test(n)).map((n) => path.join(raiz, 'lib', n)), path.join(raiz, 'lib/oficina/ciego.ts'), path.join(raiz, 'lib/oficina/paso-jefatura.ts')]
  it('hay archivos que revisar', () => { expect(jefatura.length).toBeGreaterThan(10) })
  it('ningún archivo de la jefatura, del revisor GPT, del armado del pedido ciego ni del paso de la jefatura menciona las notas del dueño', () => {
    const culpables = jefatura.filter((f) => /notas-del-dueno|notas_del_dueno|autorevisiones_del_productor/.test(fs.readFileSync(f, 'utf8')))
    expect(culpables).toEqual([])
  })
})
