/**
 * APRENDER DE EMILIO · etapa 1 · las rutas REALES dejan el evento: aprobar y rechazar (`PATCH /api/hitl/[id]`, con el motivo) y pedir cambios (`POST /api/oficina/cambios`, con láminas). US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../__tests__/dbfalsa'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const HITL = '22222222-2222-4222-8222-222222222222'
const ENC = '33333333-3333-4333-8333-333333333333'
const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const previa = { llave: process.env.INTERNAL_API_KEY, notas: process.env.NOTAS_DEL_DUENO }

const peticion = (url: string, cuerpo: unknown, metodo = 'POST') => new Request(url, { method: metodo, headers: { 'content-type': 'application/json', 'x-api-key': 'k-int' }, body: JSON.stringify(cuerpo) })
const mundo = (tipo = 'content_piece_review', estado = 'cerrado') => new DbFalsa()
  .semilla('hitl_queue', [{ id: HITL, type: tipo, status: 'pending', client_id: CLIENTE, metadata: { red: 'facebook' }, output_id: null, title: 'Carrusel' }])
  .semilla('clients', [{ id: CLIENTE, name: 'Zero Risk', industry: 'seguridad' }])
  .semilla('oficina_encargos', [{ id: ENC, hitl_queue_id: HITL, estado, brief_id: 'BRF-0002', familia: 'carrusel_mesa', dry_run: false, parte_id: 'p', tipo_de_grupo: 'g', client_id: CLIENTE }])
const eventos = () => ((mocks.db as DbFalsa).tablas['eventos_de_emilio'] ?? []) as Array<Record<string, any>>

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int'; delete process.env.NOTAS_DEL_DUENO })
afterEach(() => {
  if (previa.llave === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previa.llave
  if (previa.notas === undefined) delete process.env.NOTAS_DEL_DUENO; else process.env.NOTAS_DEL_DUENO = previa.notas
})

describe('PATCH /api/hitl/[id] · aprobar y rechazar', () => {
  const patch = async (cuerpo: unknown) => { const { PATCH } = await import('@/app/api/hitl/[id]/route'); return PATCH(peticion(`https://t.test/api/hitl/${HITL}`, cuerpo, 'PATCH'), { params: { id: HITL } }) }
  it('aprobar desde el dashboard deja un evento «aprobar»', async () => {
    mocks.db = mundo()
    expect((await patch({ status: 'approved', reviewer: 'emilio' })).status).toBe(200)
    expect(eventos()).toHaveLength(1)
    expect(eventos()[0]).toMatchObject({ canal: 'dashboard', accion: 'aprobar', decision: 'aprobada', autor: 'emilio', client_id: CLIENTE, hitl_id: HITL, brief_id: 'BRF-0002', comentario: null })
  })
  it('rechazar con motivo guarda el motivo LITERAL', async () => {
    mocks.db = mundo()
    const motivo = 'No es mi tono: demasiado formal para la gente de planta.'
    expect((await patch({ status: 'rejected', reviewer: 'emilio', frase_del_aprobador: motivo })).status).toBe(200)
    expect(eventos()[0]).toMatchObject({ canal: 'dashboard', accion: 'rechazar', decision: 'rechazada', comentario: motivo })
    expect(eventos()[0].crudo).toMatchObject({ status: 'rejected', frase_del_aprobador: motivo })
  })
  it('una decisión que viene de Slack (reviewer «slack:U1») se anota como canal slack', async () => {
    mocks.db = mundo()
    await patch({ status: 'approved', reviewer: 'slack:U1' })
    expect(eventos()[0]).toMatchObject({ canal: 'slack', accion: 'aprobar', autor: 'slack:U1' })
  })
  it('con NOTAS_DEL_DUENO=1 también queda la nota (origen tablero); sin la bandera, no', async () => {
    mocks.db = mundo(); await patch({ status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'muy frío' })
    expect(((mocks.db as DbFalsa).tablas['notas_del_dueno'] ?? [])).toHaveLength(0)
    process.env.NOTAS_DEL_DUENO = '1'
    mocks.db = mundo(); await patch({ status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'muy frío' })
    expect((mocks.db as DbFalsa).tablas['notas_del_dueno'][0]).toMatchObject({ tipo: 'rechazada', origen: 'tablero', comentario: 'muy frío', hitl_id: HITL })
  })
  it('otros tipos de la bandeja (no son piezas) NO dejan evento; y una orden que no es decisión (in_review) tampoco', async () => {
    mocks.db = mundo('seo_playbook_review'); await patch({ status: 'approved', reviewer: 'emilio' })
    expect(eventos()).toHaveLength(0)
    mocks.db = mundo(); await patch({ status: 'in_review', reviewer: 'emilio' })
    expect(eventos()).toHaveLength(0)
  })
  it('la decisión se guarda aunque el rastro no se pueda escribir', async () => {
    const db = mundo(); const orig = db.from.bind(db)
    db.from = ((t: string) => { if (t === 'eventos_de_emilio') throw new Error('tabla caída'); return orig(t) }) as never
    mocks.db = db
    const r = await patch({ status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(200)
    expect(db.tablas['hitl_queue'][0].status).toBe('approved')
  })
})

describe('POST /api/oficina/cambios · pedir cambios con láminas marcadas', () => {
  const cambios = async (cuerpo: unknown) => { const { POST } = await import('@/app/api/oficina/cambios/route'); return POST(peticion('https://t.test/api/oficina/cambios', cuerpo)) }
  it('queda el evento con el comentario literal, las láminas y las especialidades, y el resultado (aquí 409: el encargo no está cerrado)', async () => {
    mocks.db = mundo('content_piece_review', 'abierto')
    const comentario = 'La lámina 2 y la 4: el titular no suena a nosotros; la imagen de la 4 es muy genérica.'
    const r = await cambios({ hitl_id: HITL, comentario, laminas: [4, 2], reviewer: 'emilio', especialidades: ['texto', 'imagen'], despertar: false })
    expect(r.status).toBe(409)
    expect(eventos()).toHaveLength(1)
    expect(eventos()[0]).toMatchObject({ canal: 'dashboard', accion: 'pedir_cambios', decision: 'cambios_pedidos', comentario, laminas: [2, 4], especialidades: ['texto', 'imagen'], autor: 'emilio' })
    expect(eventos()[0].resultado).toMatchObject({ http: 409, error: 'encargo_no_cerrado' })
  })
  it('un pedido mal formado (400) no deja evento: no llegó a ser un pedido', async () => {
    mocks.db = mundo()
    expect((await cambios({ hitl_id: HITL, comentario: 'x' })).status).toBe(400)
    expect(eventos()).toHaveLength(0)
  })
})

describe('inmutabilidad y permisos (la migración)', () => {
  const SQL = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '202610291900_eventos_de_emilio.sql'), 'utf8')
  it('un disparador impide UPDATE, DELETE y TRUNCATE; el servidor solo puede insertar y leer; hay RLS', () => {
    expect(SQL).toMatch(/BEFORE UPDATE OR DELETE ON public\.eventos_de_emilio/)
    expect(SQL).toMatch(/BEFORE TRUNCATE ON public\.eventos_de_emilio/)
    expect(SQL).toMatch(/GRANT SELECT, INSERT ON public\.eventos_de_emilio TO service_role/)
    expect(SQL).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*eventos_de_emilio/)
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(SQL).toMatch(/UNIQUE \(clave_unica\)/)
  })
  it('la jefatura y el revisor GPT no importan este módulo', () => {
    for (const f of ['src/lib/jefatura/revision/orquestador.ts', 'src/lib/jefatura/revision/pedidos.ts', 'src/lib/revisor-gpt.ts']) {
      expect(readFileSync(join(__dirname, '..', '..', '..', '..', '..', f), 'utf8')).not.toMatch(/eventos-de-emilio|eventos_de_emilio/)
    }
  })
})

describe('el adaptador real de Slack escribe el evento', () => {
  it('registrarEvento del puerto real deja una fila canal slack con el texto del hilo', async () => {
    const { puertosDeNotas } = await import('@/lib/notas-del-dueno/adaptadores')
    const db = mundo()
    const P = puertosDeNotas(db as never, { baseUrl: 'https://t.test', internalKey: 'k', slackToken: undefined, alCerebro: false })
    await P.registrarEvento!({ accion: 'comentar', autor: 'U1', hitl_id: HITL, comentario: 'la 3 no me gusta', slack: { canal: 'C1', ts: '5.5' }, crudo: {} })
    expect(db.tablas['eventos_de_emilio'][0]).toMatchObject({ canal: 'slack', accion: 'comentar', autor: 'U1', comentario: 'la 3 no me gusta', client_id: CLIENTE })
  })
})

describe('de punta a punta (dashboard → evento → nota → puerta del dueño del cerebro)', () => {
  it('rechazar con motivo + NOTAS_AL_CEREBRO=1 llama a /api/brain/alimentar/dueno con la forma exacta y deja el envío «enviada»', async () => {
    process.env.NOTAS_DEL_DUENO = '1'; process.env.NOTAS_AL_CEREBRO = '1'
    const llamadas: Array<{ url: string; cuerpo: any }> = []
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => { llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }) as never
    try {
      mocks.db = mundo()
      const { PATCH } = await import('@/app/api/hitl/[id]/route')
      const r = await PATCH(peticion(`https://t.test/api/hitl/${HITL}`, { status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'Muy formal para la gente de planta' }, 'PATCH'), { params: { id: HITL } })
      expect(r.status).toBe(200)
      await new Promise((res) => setTimeout(res, 20))
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0].url).toBe('https://t.test/api/brain/alimentar/dueno')
      const c = llamadas[0].cuerpo
      expect(c).toMatchObject({ evento: 'respuesta', acumula: true, client_id: CLIENTE, canal: '#oficina-creativa', respuesta: 'Muy formal para la gente de planta', dry_run: false, preguntado_por: { oficina: 'oficina-creativa', agente: 'content-creator' } })
      expect(c.tema).toBe('oficina creativa · pieza 22222222'); expect(c.tema.length).toBeLessThanOrEqual(80)
      expect(c.mensaje_ref).toMatch(/^dashboard:/); expect(c.respondido_en).toMatch(/^\d{4}-\d\d-\d\dT/)
      expect(c.workflow_execution_id).toMatch(/^dashboard:dashboard:/)
      const envios = (mocks.db as DbFalsa).tablas['notas_del_dueno_envios']
      expect(envios[0]).toMatchObject({ estado: 'enviada' })
    } finally { globalThis.fetch = real; delete process.env.NOTAS_AL_CEREBRO }
  })
  it('con NOTAS_AL_CEREBRO apagado la nota queda ENCOLADA (pendiente) y no se llama a nadie', async () => {
    process.env.NOTAS_DEL_DUENO = '1'; delete process.env.NOTAS_AL_CEREBRO
    const real = globalThis.fetch; let n = 0
    globalThis.fetch = (async () => { n++; return new Response('{}') }) as never
    try {
      mocks.db = mundo()
      const { PATCH } = await import('@/app/api/hitl/[id]/route')
      await PATCH(peticion(`https://t.test/api/hitl/${HITL}`, { status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'motivo' }, 'PATCH'), { params: { id: HITL } })
      await new Promise((res) => setTimeout(res, 20))
      expect(n).toBe(0)
      expect((mocks.db as DbFalsa).tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'pendiente' })
    } finally { globalThis.fetch = real }
  })
})
