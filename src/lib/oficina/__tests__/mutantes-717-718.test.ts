/**
 * LAS SEIS PRUEBAS QUE FALTABAN (certificación de CC#3 sobre #717/#718: mutaciones M02, M08, M10, M16, M17 y M20 sobrevivían). US$ 0, sin red.
 * Cada prueba lleva en su nombre el mutante que mata.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { abrirEncargo } from '../orquestador'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { revisarPasosMuertos, MINUTOS_PARA_DAR_POR_MUERTO } from '../vigia'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL } from './memoria'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const ENV = { baseUrl: 'https://app.test', internalKey: 'k' }
const ID = '11111111-1111-4111-8111-111111111111'

function semilla(): DbFalsa {
  return new DbFalsa()
    .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
    .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
    .semilla('client_social_images', [])
    .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
    .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
}

describe('el vigía y lo recién reentregado (M08, M10)', () => {
  async function conPasoColgado() {
    const db = semilla()
    const hora = { v: new Date('2026-10-10T12:00:00Z') }
    const P = crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora.v)
    const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const turno = db.tablas['oficina_turnos'].find((t) => t.estado === 'corriendo')!
    return { db, P, hora, id: String(a.cuerpo.encargo_id), turno }
  }
  const sinAcuse = (t: Record<string, unknown>, ahora: Date, min: number) => { t.workflow_execution_id = null; t.inicio = new Date(ahora.getTime() - min * 60_000).toISOString() }

  it('M08 · un turno sin acuse de más de 12 min con reentregas disponibles se REENTREGA una vez y NO se da por muerto', async () => {
    const { db, P, hora, id, turno } = await conPasoColgado()
    sinAcuse(turno, hora.v, MINUTOS_PARA_DAR_POR_MUERTO + 1)
    expect(await revisarPasosMuertos(P, db, hora.v)).toEqual({ reanudar: [id], fallidos: [], cierres: [] }) // una sola vez, no dos
    expect(turno.estado).toBe('corriendo') // no pasó a «muerto»
    expect((db.tablas['oficina_encargos'][0].estado_del_motor as { vueltas: Record<string, number> }).vueltas[`muerto:${String(turno.paso)}`]).toBeUndefined() // ni gastó el reintento de los muertos
  })
  it.each(['cerrado', 'cerrado_por_tope', 'fallido'])('M10 · un turno sin acuse de un encargo %s NO se reentrega ni se toca', async (estado) => {
    const { db, P, hora, turno } = await conPasoColgado()
    db.tablas['oficina_encargos'][0].estado = estado
    const antes = JSON.stringify(db.tablas['oficina_encargos'][0].estado_del_motor)
    sinAcuse(turno, hora.v, 4)
    expect(await revisarPasosMuertos(P, db, hora.v)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(JSON.stringify(db.tablas['oficina_encargos'][0].estado_del_motor)).toBe(antes) // ni el contador de reentregas se movió
  })
})

describe('el acuse solo toma turnos corriendo (M02)', () => {
  it.each(['muerto', 'ok', 'fallo'])('M02 · un turno %s sin dueño NO se puede acusar: no_abierto y la fila no cambia', async (estado) => {
    const db = semilla()
    const P = crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch)
    const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const t = db.tablas['oficina_turnos'].find((x) => x.estado === 'corriendo')!
    t.estado = estado; t.workflow_execution_id = null
    expect(await P.almacen.acusarTurno(id, Number(t.n), 'ex-tardio')).toBe('no_abierto')
    expect(t.workflow_execution_id).toBeNull()
  })
})

describe('rutas: despertar y validación del acuse (M16, M17)', () => {
  let encargos: typeof import('@/app/api/oficina/encargos/route').POST
  let turnos: typeof import('@/app/api/oficina/turnos/route').POST
  const previo = { k: process.env.SALA_DISPATCH_KEY, p: process.env.PORTERO_WEBHOOK_KEY, w: process.env.N8N_WEBHOOK_BASE }
  const llamadas: Array<{ url: string; llave: string | null; cuerpo: Record<string, unknown> }> = []
  const req = (cuerpo: unknown) => new Request('https://app.test/api/oficina/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': 'la-llave' }, body: JSON.stringify(cuerpo) })
  const cuerpoDeApertura = (extra: Record<string, unknown> = {}) => ({ client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR, parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img', ...extra })
  beforeEach(async () => {
    process.env.SALA_DISPATCH_KEY = 'la-llave'; process.env.PORTERO_WEBHOOK_KEY = 'k-portero'; process.env.N8N_WEBHOOK_BASE = 'https://n8n.test/webhook'
    mocks.db = semilla(); llamadas.length = 0
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => {
      const url = String(u)
      if (url.endsWith('/zero-risk/portero')) return new Response(JSON.stringify({ error: 'PORTERO_CLIENTE_INVALIDO' }), { status: 400 }) // la puerta del portero viva
      llamadas.push({ url, llave: (i?.headers as Record<string, string> | undefined)?.['x-sala-dispatch-key'] ?? null, cuerpo: JSON.parse(String(i?.body ?? '{}')) })
      return new Response('{}', { status: 200 })
    })
    encargos = (await import('@/app/api/oficina/encargos/route')).POST
    turnos = (await import('@/app/api/oficina/turnos/route')).POST
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [['SALA_DISPATCH_KEY', previo.k], ['PORTERO_WEBHOOK_KEY', previo.p], ['N8N_WEBHOOK_BASE', previo.w]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  })

  it('M16 · con `despertar: true` la ruta despierta al flujo con el primer turno y la llave de despacho', async () => {
    const r = await encargos(req(cuerpoDeApertura({ despertar: true })))
    const j = await r.json()
    expect(r.status).toBe(200); expect(j).toMatchObject({ accion: 'esperar', despertado: true })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://n8n.test/webhook/zero-risk/oficina-turno')
    expect(llamadas[0].llave).toBe('la-llave')
    expect(llamadas[0].cuerpo).toMatchObject({ encargo_id: j.encargo_id, turno: { n: j.turno.n } })
  })
  it('M16 · sin `despertar` (o distinto de true) la ruta NO llama a n8n: el que abre desde n8n ya lo despierta la puerta', async () => {
    for (const extra of [{}, { despertar: 'true' }, { despertar: false }]) {
      mocks.db = semilla()
      const j = await (await encargos(req(cuerpoDeApertura(extra)))).json()
      expect(j.despertado).toBeUndefined()
    }
    expect(llamadas).toHaveLength(0)
  })
  it('M17 · el acuse exige `n` entero ≥ 1 y `workflow_execution_id` con texto: lo demás es 400 antes de tocar la base', async () => {
    const malos: Array<Record<string, unknown>> = [
      { n: 1.5, workflow_execution_id: 'ex' }, { n: '2', workflow_execution_id: 'ex' }, { n: 0, workflow_execution_id: 'ex' }, { n: -1, workflow_execution_id: 'ex' }, { workflow_execution_id: 'ex' },
      { n: 1 }, { n: 1, workflow_execution_id: '' }, { n: 1, workflow_execution_id: 7 },
    ]
    for (const m of malos) { const r = await turnos(req({ accion: 'acuse', encargo_id: ID, ...m })); expect(r.status, JSON.stringify(m)).toBe(400); expect((await r.json()).error).toBe('entrada_invalida') }
    expect((await turnos(req({ accion: 'acuse', encargo_id: ID, n: 1, workflow_execution_id: 'ex' }))).status).not.toBe(400) // el bueno pasa la validación
  })
})

describe('el nodo del portero exige un portero entero (M20)', () => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../../../scripts/worker-staging/oficina/turno-n3p-portero.js'), 'utf8')
  const correr = (respuesta: unknown) => {
    const f = new Function('$', '$input', '$execution', codigo)
    const entrada = { encargo_id: 'enc-1', dry_run: false, turno: { n: 2, paso: 'paquete', tipo: 'portero' } }
    return (f(() => ({ first: () => ({ json: entrada }) }), { first: () => ({ json: respuesta }) }, { id: 'ex-1' }) as Array<{ json: { resultado_body: Record<string, unknown> } }>)[0].json.resultado_body
  }
  const BUENO = { caso: 'x', cliente: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', modo: 'conversado', estado: 'ok', material: [], costo_usd: 0.03 }
  it.each([
    ['sin estado', { modo: 'conversado', cliente: 'c' }],
    ['sin cliente', { modo: 'conversado', estado: 'ok' }],
    ['sin modo', { estado: 'ok', cliente: 'c' }],
    ['solo modo', { modo: 'conversado' }],
    ['estado que no es texto', { modo: 'conversado', estado: 3, cliente: 'c' }],
    ['cliente que no es texto', { modo: 'conversado', estado: 'ok', cliente: 9 }],
  ])('M20 · una respuesta %s NO es un portero: PORTERO_NO_RESPONDE y sin texto', (_n, r) => {
    const b = correr(r)
    expect(String(b.error)).toMatch(/^PORTERO_NO_RESPONDE/)
    expect(b.texto).toBeUndefined()
  })
  it('M20 · el portero entero sigue pasando', () => { expect(correr(BUENO).error).toBeUndefined() })
})
