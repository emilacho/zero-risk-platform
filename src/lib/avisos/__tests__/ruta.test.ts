/** La puerta POST /api/avisos: llave interna, 400 claros, 500 si no guarda (y entonces 0 llamadas a Slack), 200 aunque Slack caiga. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ rpcError: null as null | { message: string }, rpcs: [] as string[], args: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpcs.push(fn); estado.args.push(args); return estado.rpcError ? { data: null, error: estado.rpcError } : { data: [{ aviso_id: 'u1', accion: 'abrio', slack_ts: null, slack_estado: 'pendiente' }], error: null } },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}))
import { POST } from '@/app/api/avisos/route'

const LLAVE = 'llave-de-prueba-1234'
const pedir = (cuerpo: unknown, llave: string | null = LLAVE) => new Request('http://x/api/avisos', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
const base = { accion: 'avisar', clave: 'prueba:ruta', tipo: 'alarma', origen: 'prueba', origen_tipo: 'plataforma', titulo: 't', detalle: 'd', client_id: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5' }
let llamadasSlack = 0

beforeEach(() => {
  estado.rpcError = null; estado.rpcs = []; estado.args = []; llamadasSlack = 0
  vi.stubEnv('INTERNAL_API_KEY', LLAVE); vi.stubEnv('SLACK_BOT_TOKEN', 'tok'); vi.stubEnv('AVISOS_A_SLACK', '')
  vi.stubGlobal('fetch', async () => { llamadasSlack++; return new Response(JSON.stringify({ ok: false, error: 'service_unavailable' }), { status: 503 }) })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('POST /api/avisos', () => {
  it('sin llave o con llave mala: 401 y no toca la base', async () => {
    expect((await POST(pedir(base, null))).status).toBe(401)
    expect((await POST(pedir(base, 'otra-llave-de-prueba'))).status).toBe(401)
    expect(estado.rpcs).toEqual([])
  })
  it('cuerpo roto, acción desconocida o entrada inválida: 400 con su código', async () => {
    expect(await (await POST(pedir('{no'))).json()).toMatchObject({ error: 'E-JSON' })
    expect(await (await POST(pedir({ ...base, accion: 'borrar' }))).json()).toMatchObject({ error: 'E-ACCION' })
    const r = await POST(pedir({ ...base, origen_tipo: 'n8n' }))
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ error: 'E-ENTRADA' })
    expect(estado.rpcs).toEqual([])
  })
  it('si la base no guarda: 500 E-GUARDAR, sin el detalle de la base, y 0 llamadas a Slack', async () => {
    estado.rpcError = { message: 'permission denied for table avisos' }
    const r = await POST(pedir(base))
    expect(r.status).toBe(500)
    const j = await r.json()
    expect(j).toMatchObject({ ok: false, error: 'E-GUARDAR' })
    expect(JSON.stringify(j)).not.toMatch(/permission|avisos_/)
    expect(llamadasSlack).toBe(0)
  })
  it('guardado y Slack caído: 200 con slack «fallo»', async () => {
    const r = await POST(pedir(base))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, accion: 'abrio', slack: 'fallo' })
    expect(llamadasSlack).toBe(1)
  })
  it('interruptor apagado: 200 y 0 llamadas a Slack', async () => {
    vi.stubEnv('AVISOS_A_SLACK', 'apagado')
    expect(await (await POST(pedir(base))).json()).toMatchObject({ ok: true, slack: 'apagado' })
    expect(llamadasSlack).toBe(0)
  })
  it('11-nov · cerrar con contestada:true guarda la nota con la marca; sin ella, la nota tal cual', async () => {
    expect((await POST(pedir({ accion: 'cerrar', clave: 'prueba:ruta', nota: 'el dueño subió el tope', contestada: true }))).status).toBe(200)
    expect(estado.args.at(-1)).toEqual({ p_clave: 'prueba:ruta', p_nota: 'Contestada: el dueño subió el tope' })
    await POST(pedir({ accion: 'cerrar', clave: 'prueba:ruta', nota: 'todo cabe', contestada: 'sí' }))
    expect(estado.args.at(-1)).toEqual({ p_clave: 'prueba:ruta', p_nota: 'todo cabe' })
  })
})
