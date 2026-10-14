/**
 * JEFATURA como oficina propia · J3 · las RUTAS `/api/jefatura/{revisiones,turnos,vigia}` con la base falsa: la llave, APAGADA = 409 (no abre ni gasta), `dry_run` obligatorio, el recorrido completo en seco por HTTP,
 * y la regla dura del editor (cabecera y `extra.workflow_execution_id`, diseño §9.4). US$ 0: sin red, sin modelo, sin base real.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsaJefatura } from './_helpers/dbfalsa-jefatura'
import { FILAS_DE_POLITICA, sobre, TEXTO_DEL_PLAN } from './_helpers/jefatura-revision'

const h = vi.hoisted(() => ({ db: null as unknown, aperturasDeLaBase: 0 }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => { h.aperturasDeLaBase++; return h.db } }))

import { POST as REVISIONES } from '../src/app/api/jefatura/revisiones/route'
import { POST as TURNOS } from '../src/app/api/jefatura/turnos/route'
import { POST as VIGIA } from '../src/app/api/jefatura/vigia/route'
import * as revisionesRuta from '../src/app/api/jefatura/revisiones/route'
import * as turnosRuta from '../src/app/api/jefatura/turnos/route'
import * as vigiaRuta from '../src/app/api/jefatura/vigia/route'
import { auditarPedidoDeAgente } from '../src/lib/jefatura/revision/pedidos'

const LLAVE = process.env.SALA_DISPATCH_KEY ?? 'test-dispatch-key-e67'
const pedir = (url: string, cuerpo: unknown, cab: Record<string, string> = { 'x-sala-dispatch-key': LLAVE }) => new Request(`http://app.test/api/jefatura/${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) })
type Json = Record<string, any>
const llamar = async (ruta: (r: Request) => Promise<Response>, url: string, cuerpo: unknown, cab?: Record<string, string>): Promise<{ status: number; j: Json }> => { const r = await ruta(pedir(url, cuerpo, cab)); return { status: r.status, j: (await r.json()) as Json } }

const TIPOS = ['plan', 'estrategia', 'calendario', 'brief', 'pieza']
function baseConJefatura(estado: 'apagada' | 'ensayo' | 'encendida' = 'ensayo'): DbFalsaJefatura {
  const db = new DbFalsaJefatura()
  db.semilla('jefatura_config', [{ id: 1, estado, tipos_activos: TIPOS, clientes_ensayo: ['cliente-prueba'] }])
  db.semilla('jefatura_grading_policies', TIPOS.map((t) => ({ ...FILAS_DE_POLITICA[t], is_active: false })))
  return db
}
beforeEach(() => { h.db = baseConJefatura(); h.aperturasDeLaBase = 0 })
const db = () => h.db as DbFalsaJefatura

describe('la llave de la sala', () => {
  const INTERNA = 'la-llave-interna-de-prueba'
  const conInterna = async <T,>(f: () => Promise<T>): Promise<T> => { const g = process.env.INTERNAL_API_KEY; process.env.INTERNAL_API_KEY = INTERNA; try { return await f() } finally { if (g === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = g } }
  it.each([['revisiones', REVISIONES], ['turnos', TURNOS], ['vigia', VIGIA]] as const)('%s: sin llave 401 · llave equivocada 401 (de despacho y interna) · ninguna vale en la cabecera de la otra · sin ninguna variable 503', async (url, ruta) => {
    await conInterna(async () => {
      expect((await llamar(ruta, url, {}, {})).status).toBe(401)
      expect((await llamar(ruta, url, {}, { 'x-sala-dispatch-key': 'otra' })).status).toBe(401)
      expect((await llamar(ruta, url, {}, { 'x-api-key': 'otra' })).status).toBe(401)
      // el valor de una llave en la cabecera de la otra no abre
      expect((await llamar(ruta, url, {}, { 'x-api-key': LLAVE })).status).toBe(401)
      expect((await llamar(ruta, url, {}, { 'x-sala-dispatch-key': INTERNA })).status).toBe(401)
      expect((await llamar(ruta, url, {}, { 'x-internal-api-key': INTERNA })).status).toBe(401)
    })
    const g1 = process.env.SALA_DISPATCH_KEY, g2 = process.env.INTERNAL_API_KEY
    delete process.env.SALA_DISPATCH_KEY; delete process.env.INTERNAL_API_KEY
    try { expect((await llamar(ruta, url, {}, { 'x-sala-dispatch-key': 'x', 'x-api-key': 'x' })).status).toBe(503) } finally { process.env.SALA_DISPATCH_KEY = g1; if (g2 !== undefined) process.env.INTERNAL_API_KEY = g2 }
    expect(db().escrituras).toHaveLength(0)
  })
  it.each([['revisiones', REVISIONES], ['turnos', TURNOS], ['vigia', VIGIA]] as const)('%s: con la llave INTERNA pasa la puerta (el cuerpo vacío ya es otro error, no 401/503) y con la de despacho también', async (url, ruta) => {
    await conInterna(async () => {
      const a = (await llamar(ruta, url, url === 'vigia' ? { dry_run: true } : {}, { 'x-api-key': INTERNA })).status
      const b = (await llamar(ruta, url, url === 'vigia' ? { dry_run: true } : {}, { 'x-sala-dispatch-key': LLAVE })).status
      expect([a, b].every((s) => s !== 401 && s !== 503)).toBe(true)
    })
  })
  it('sin INTERNAL_API_KEY pero con la de despacho la puerta sigue abierta para los flujos (y la interna ajena no abre)', async () => {
    const g = process.env.INTERNAL_API_KEY
    delete process.env.INTERNAL_API_KEY
    try {
      expect((await llamar(VIGIA, 'vigia', { dry_run: true }, { 'x-sala-dispatch-key': LLAVE })).status).toBe(200)
      expect((await llamar(VIGIA, 'vigia', { dry_run: true }, { 'x-api-key': '' })).status).toBe(401)
    } finally { if (g !== undefined) process.env.INTERNAL_API_KEY = g }
  })
  it('un cuerpo que no es JSON o no es objeto = 400', async () => {
    const r = await REVISIONES(new Request('http://app.test/api/jefatura/revisiones', { method: 'POST', headers: { 'x-sala-dispatch-key': LLAVE }, body: 'no es json' }))
    expect(r.status).toBe(400)
    const arr = await llamar(REVISIONES, 'revisiones', [1, 2])
    expect(arr.status).toBe(400)
    expect(arr.j.errores).toEqual(['el cuerpo debe ser un objeto'])
    expect((await llamar(TURNOS, 'turnos', [1])).j.errores).toEqual(['el cuerpo debe ser un objeto'])
    expect((await llamar(VIGIA, 'vigia', [1])).status).toBe(400)
  })
})

describe('APAGADA = 409: no abre, no gasta, no escribe (ni siquiera en seco)', () => {
  it('revisiones: 409 `jefatura_no_abre` y la base no recibe NINGUNA escritura', async () => {
    h.db = baseConJefatura('apagada')
    const r = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    expect(r.status).toBe(409)
    expect(r.j).toMatchObject({ error: 'jefatura_no_abre', motivo: 'apagada' })
    expect(db().escrituras).toHaveLength(0)
    expect(db().tablas.jefatura_revisiones ?? []).toHaveLength(0)
  })
  it('sin fila de config legible = apagada (falla CERRADO)', async () => {
    h.db = new DbFalsaJefatura()
    expect((await llamar(REVISIONES, 'revisiones', sobre('pieza'))).j.motivo).toBe('apagada')
    const roto = new DbFalsaJefatura(); roto.fallar.jefatura_config = 'caída'
    h.db = roto
    expect((await llamar(REVISIONES, 'revisiones', sobre('pieza'))).j.motivo).toBe('apagada')
  })
  it('turnos: 409 y no corre ningún paso (apagar frena también las revisiones a medio camino)', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    expect(a.status).toBe(200)
    const antes = db().escrituras.length
    ;(db().tablas.jefatura_config[0] as Json).estado = 'apagada'
    const t = await llamar(TURNOS, 'turnos', { accion: 'siguiente', revision_id: a.j.revision_id })
    expect(t.status).toBe(409)
    expect(t.j.motivo).toBe('apagada')
    expect(db().escrituras).toHaveLength(antes)
  })
  it('vigía: apagada no hace nada; en seco no escribe', async () => {
    h.db = baseConJefatura('apagada')
    const v = await llamar(VIGIA, 'vigia', {})
    expect(v).toMatchObject({ status: 200, j: { accion: 'apagada' } })
    h.db = baseConJefatura('ensayo')
    expect((await llamar(VIGIA, 'vigia', { dry_run: true })).j.accion).toBe('dry_run')
    expect(db().escrituras).toHaveLength(0)
  })
})

describe('dry_run es obligatorio', () => {
  it.each([undefined, 'true', 1, null])('abrir con dry_run %j = 400', async (malo) => {
    const s = sobre('pieza') as { payload: Json }
    if (malo === undefined) delete s.payload.dry_run
    else s.payload.dry_run = malo
    const r = await llamar(REVISIONES, 'revisiones', s)
    expect(r.status).toBe(400)
    expect(r.j.error).toBe('dry_run_obligatorio')
    expect(db().escrituras).toHaveLength(0)
  })
  it('el vigía valida su dry_run (booleano o ausente)', async () => {
    expect((await llamar(VIGIA, 'vigia', { dry_run: 'si' })).status).toBe(400)
  })
})

describe('despertar: la ruta llama al flujo con SU llave de despacho', () => {
  const INTERNA = 'la-llave-interna-de-prueba'
  const llamadas: Array<{ url: string; cab: Record<string, string>; cuerpo: Json }> = []
  const falso = (status = 200) => vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: string, init: RequestInit) => { llamadas.push({ url: String(u), cab: init.headers as Record<string, string>, cuerpo: JSON.parse(String(init.body)) }); return new Response('{}', { status }) }) as typeof fetch)
  beforeEach(() => { llamadas.length = 0; process.env.INTERNAL_API_KEY = INTERNA })
  afterEach(() => { vi.restoreAllMocks(); delete process.env.INTERNAL_API_KEY; delete process.env.N8N_WEBHOOK_BASE })
  const interna = { 'x-api-key': INTERNA }
  async function abierta() { const a = await llamar(REVISIONES, 'revisiones', sobre('pieza'), interna); return { id: String(a.j.revision_id), turno: a.j.turno as Json } }
  it('con la llave interna: el webhook sale con la llave de DESPACHO del servidor y el cuerpo { revision_id, turno }; la respuesta no repite ninguna llave', async () => {
    const { id, turno } = await abierta()
    const f = falso(200)
    const r = await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, interna)
    expect(r.status).toBe(200)
    expect(r.j).toEqual({ despertado: true, webhook_status: 200 })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://n8n-production-72be.up.railway.app/webhook/zero-risk/jefatura-turno')
    expect(llamadas[0].cab['x-sala-dispatch-key']).toBe(LLAVE)
    expect(llamadas[0].cab['x-api-key']).toBeUndefined()
    expect(llamadas[0].cuerpo).toEqual({ revision_id: id, turno })
    expect(JSON.stringify(r.j)).not.toContain(LLAVE)
    f.mockRestore()
  })
  it('el destino sale de N8N_WEBHOOK_BASE, nunca del cuerpo', async () => {
    process.env.N8N_WEBHOOK_BASE = 'https://n8n.nuestro.test/webhook/'
    const { id, turno } = await abierta()
    falso()
    await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno, url: 'https://tercero.test/x' }, interna)
    expect(llamadas[0].url).toBe('https://n8n.nuestro.test/webhook/zero-risk/jefatura-turno')
  })
  it('sin turno 400 · revisión inexistente 404 · sin SALA_DISPATCH_KEY 503 · apagada 409; en ninguno sale una llamada', async () => {
    const { id, turno } = await abierta()
    falso()
    expect((await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id }, interna)).status).toBe(400)
    expect((await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: '00000000-0000-4000-8000-0000000000aa', turno }, interna)).status).toBe(404)
    const g = process.env.SALA_DISPATCH_KEY
    delete process.env.SALA_DISPATCH_KEY
    try { expect((await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, interna)).status).toBe(503) } finally { process.env.SALA_DISPATCH_KEY = g }
    db().tablas.jefatura_config[0].estado = 'apagada'
    expect((await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, interna)).status).toBe(409)
    expect(llamadas).toHaveLength(0)
  })
  it('sin llave 401 y el webhook no sale; si n8n contesta 500 o no responde, 502 con despertado:false', async () => {
    const { id, turno } = await abierta()
    falso(500)
    expect((await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, {})).status).toBe(401)
    expect(llamadas).toHaveLength(0)
    const m = await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, interna)
    expect(m.status).toBe(502)
    expect(m.j).toMatchObject({ despertado: false, webhook_status: 500 })
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const c = await llamar(TURNOS, 'turnos', { accion: 'despertar', revision_id: id, turno }, interna)
    expect(c.status).toBe(502)
    expect(c.j).toMatchObject({ despertado: false, error: 'webhook_inalcanzable' })
  })
})

describe('el recorrido por HTTP, en seco', () => {
  async function recorrer(s: Json, tope = 30) {
    const a = await llamar(REVISIONES, 'revisiones', s)
    const id = String(a.j.revision_id)
    const pedidos: Json[] = []
    let rsp = a
    for (let i = 0; i < tope && rsp.j.accion === 'esperar'; i++) {
      const t = rsp.j.turno as Json
      pedidos.push(t)
      const molde = t.pedido.molde as { texto: string | null; error?: string }
      rsp = await llamar(TURNOS, 'turnos', molde.texto === null ? { accion: 'resultado', revision_id: id, n: t.n, error: molde.error ?? 'sin molde' } : { accion: 'resultado', revision_id: id, n: t.n, texto: molde.texto, costo_usd: 0 })
    }
    return { id, a, pedidos, final: rsp }
  }
  it('pieza: abrir → turnos con el molde → cierra LIMPIA; la base queda con la revisión cerrada, sus pasos y sus fichas', async () => {
    const r = await recorrer(sobre('pieza') as Json)
    expect(r.a.status).toBe(200)
    expect(r.final.j).toMatchObject({ accion: 'cerrado', estado: 'cerrada', resultado: 'limpia', simulado: true })
    const rev = db().tablas.jefatura_revisiones[0] as Json
    expect(rev).toMatchObject({ estado: 'cerrada', resultado: 'limpia', dry_run: true, client_id: 'cliente-prueba', artifact_type: 'pieza' })
    expect(rev.cerrado_en).toBeTruthy()
    expect(rev.policy_snapshot.artifact_type).toBe('pieza')
    const pasos = db().tablas.jefatura_pasos as Json[]
    expect(pasos.map((p) => p.paso)).toEqual(expect.arrayContaining(['revision_fondo', 'segunda_mirada', 'decision:content-creator']))
    expect(pasos.every((p) => p.estado === 'hecho')).toBe(true)
    expect(pasos.find((p) => p.paso === 'segunda_mirada')).toMatchObject({ concepto: 'revisor_externo', tipo: 'externo' })
    expect((db().tablas.jefatura_fichas as Json[]).some((f) => f.origen === 'externa')).toBe(true)
  })
  it('plan con ficha que bloquea y toma algo: la salida trae las 3 versiones A, B, C con su texto', async () => {
    const r = await recorrer(sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }) as Json)
    expect(r.final.j.salida.versiones.map((v: Json) => v.etiqueta)).toEqual(['A', 'B', 'C'])
    expect(r.final.j.salida.versiones[0].texto).toBe(TEXTO_DEL_PLAN)
    expect(r.pedidos.map((p) => p.paso)).toEqual(['revision_fondo', 'correccion:campaign-brief-agent', 'decision:campaign-brief-agent'])
  })
  it('brief («solo marca»): un solo turno de agente y cierra con_desacuerdo si el jefe deja una ficha que bloquea', async () => {
    const r = await recorrer(sobre('brief', { simulacion: { fichas: 'bloquea' } }) as Json)
    expect(r.pedidos.map((p) => p.paso)).toEqual(['revision_fondo'])
    expect(r.final.j.resultado).toBe('con_desacuerdo')
  })
  it('abrir dos veces la misma revisión: la base lo impide (índice único) y se devuelve la existente', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('brief', { id: 'b-9' }))
    const b = await llamar(REVISIONES, 'revisiones', sobre('brief', { id: 'b-9' }))
    expect(b.j).toMatchObject({ accion: 'ya_existia', revision_id: a.j.revision_id })
    expect(db().tablas.jefatura_revisiones).toHaveLength(1)
  })
  it('un «siguiente» repetido devuelve el MISMO pedido (misma dispatch_key) y no abre otro paso', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    const t = await llamar(TURNOS, 'turnos', { accion: 'siguiente', revision_id: a.j.revision_id })
    expect(t.j.reentrega).toBe(true)
    expect(t.j.turno.dispatch_key).toBe(a.j.turno.dispatch_key)
    expect(db().tablas.jefatura_pasos).toHaveLength(1)
  })
  it('un resultado con número de paso equivocado = 409; entradas mal formadas = 400', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    expect((await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: a.j.revision_id, n: 99, texto: '{}' })).status).toBe(409)
    expect((await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: 'no-uuid', n: 1, texto: '{}' })).status).toBe(400)
    expect((await llamar(TURNOS, 'turnos', { accion: 'otra', revision_id: a.j.revision_id })).status).toBe(400)
    expect((await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: a.j.revision_id, n: 1 })).status).toBe(400)
    for (const malo of [0, -1, 1.5, '1', null]) {
      const r = await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: a.j.revision_id, n: malo, texto: '{}' })
      expect(r.status, JSON.stringify(malo)).toBe(400)
      expect((r.j.errores as string[]).join(' ')).toMatch(/`n` debe ser el número del paso/)
    }
    expect((await llamar(TURNOS, 'turnos', { accion: 'siguiente', revision_id: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404)
  })
  it('§149: el flujo manda su workflow_id y su ejecución con el resultado y quedan en el renglón del paso', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('brief'))
    const t = a.j.turno as Json
    const r = await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: a.j.revision_id, n: t.n, texto: (t.pedido.molde as Json).texto, costo_usd: 0.05, workflow_id: 'wf-jefatura-turno', workflow_execution_id: 'ex-9' })
    expect(r.status).toBe(200)
    expect((db().tablas.jefatura_pasos as Json[]).find((p) => p.n === t.n)).toMatchObject({ workflow_id: 'wf-jefatura-turno', workflow_execution_id: 'ex-9', estado: 'hecho' })
  })
  it('leer: devuelve el estado y, si ya cerró, la salida completa', async () => {
    const r = await recorrer(sobre('brief') as Json)
    const l = await llamar(REVISIONES, 'revisiones', { accion: 'leer', revision_id: r.id })
    expect(l.status).toBe(200)
    expect(l.j).toMatchObject({ estado: 'cerrada', resultado: 'limpia' })
    expect(l.j.salida.trace_id).toBe(`jefatura:${r.id}`)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'leer', revision_id: 'x' })).status).toBe(400)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'leer', revision_id: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'borrar' })).status).toBe(400)
  })
  it('elegir_version (solo el plan): la mejor versión aceptable y qué guardar; entradas malas = 400', async () => {
    const r = await recorrer(sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }) as Json)
    const ok = await llamar(REVISIONES, 'revisiones', { accion: 'elegir_version', revision_id: r.id, id_de_a: 'a-id', existentes: [], evaluaciones: [{ etiqueta: 'A', marcas: 3, largo: 30000 }, { etiqueta: 'B', marcas: 1, largo: 30500 }, { etiqueta: 'C', marcas: 2, largo: 31000 }] })
    expect(ok.status).toBe(200)
    expect(ok.j).toMatchObject({ adoptada: 'B', resultado: 'con_desacuerdo' })
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'elegir_version', revision_id: r.id, id_de_a: '', evaluaciones: [] })).status).toBe(400)
    expect(((await llamar(REVISIONES, 'revisiones', { accion: 'elegir_version', revision_id: r.id, id_de_a: 'a', existentes: [{ id: 1 }], evaluaciones: [{ etiqueta: 'A', marcas: 1, largo: 1 }] })).j.errores as string[]).join(' ')).toMatch(/existentes/)
    // el resultado final quedó guardado
    expect((db().tablas.jefatura_revisiones[0] as Json).resultado).toBe('con_desacuerdo')
  })
  it('marcar_reemplazo devuelve el provenance_tag ENTERO de un plan REAL (sin type ni trust_level; puro: no escribe nada en la base); con un tag vacío = 400 y no escribe', async () => {
    const A = { fuente: 'planeacion', caracteres: 24827, workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '48113', guardado_antes_de_drive: true }
    const ok = await llamar(REVISIONES, 'revisiones', { accion: 'marcar_reemplazo', provenance_tag: A, por: 'b-id', en: '2026-10-13T12:00:00Z' })
    expect(ok.status).toBe(200)
    expect(ok.j.provenance_tag).toEqual({ ...A, reemplazado_por: 'b-id', reemplazado_en: '2026-10-13T12:00:00Z' })
    const vacio = await llamar(REVISIONES, 'revisiones', { accion: 'marcar_reemplazo', provenance_tag: {}, por: 'b-id' })
    expect(vacio.status).toBe(400)
    expect(vacio.j).toMatchObject({ error: 'provenance_invalido' })
    expect(String(vacio.j.detalle)).toMatch(/está vacío: no se escribe un objeto que no se leyó antes/)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'marcar_reemplazo', provenance_tag: 'texto', por: 'b-id' })).j.error).toBe('provenance_invalido')
    const sinPor = await llamar(REVISIONES, 'revisiones', { accion: 'marcar_reemplazo', provenance_tag: A })
    expect(sinPor.status).toBe(400)
    expect(sinPor.j.error).toBe('entrada_invalida')
    expect(sinPor.j.errores).toEqual(['`por` debe ser el id de la versión que reemplaza'])
    // otra versión no puede reemplazar a una ya reemplazada (G7)
    const dos = await llamar(REVISIONES, 'revisiones', { accion: 'marcar_reemplazo', provenance_tag: ok.j.provenance_tag, por: 'c-id' })
    expect(dos.status).toBe(400)
    expect(String(dos.j.detalle)).toMatch(/ya fue reemplazada por b-id/)
    expect(db().escrituras).toHaveLength(0)
    expect(h.aperturasDeLaBase, 'las acciones puras ni siquiera abren la conexión a la base').toBe(0)
  })
  it('provenance_de_version arma el tag de B o C heredando type y trust_level; valida sus entradas', async () => {
    const A = { fuente: 'planeacion', caracteres: 24827, workflow_id: 'X9F0zp6LQ2xGEYVS', reemplazado_por: 'x' }
    const b = await llamar(REVISIONES, 'revisiones', { accion: 'provenance_de_version', provenance_tag: A, etiqueta: 'B', version: 2, version_de: 'a-id', jefatura_revision_id: 'rev-1' })
    expect(b.status).toBe(200)
    expect(b.j.provenance_tag).toMatchObject({ fuente: 'planeacion', caracteres: 24827, workflow_id: 'X9F0zp6LQ2xGEYVS', etiqueta: 'B', version: 2, version_de: 'a-id', jefatura_revision_id: 'rev-1', reentrega: 'version_nueva' })
    expect(b.j.provenance_tag).not.toHaveProperty('reemplazado_por')
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'provenance_de_version', provenance_tag: A, etiqueta: 'A', version: 2, version_de: 'a', jefatura_revision_id: 'r' })).status).toBe(400)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'provenance_de_version', provenance_tag: A, etiqueta: 'C', version: 4, version_de: 'b', jefatura_revision_id: 'r' })).status).toBe(400)
    expect((await llamar(REVISIONES, 'revisiones', { accion: 'provenance_de_version', provenance_tag: {}, etiqueta: 'B', version: 2, version_de: 'a', jefatura_revision_id: 'r' })).j.error).toBe('provenance_invalido')
    expect(db().escrituras).toHaveLength(0)
    expect(h.aperturasDeLaBase).toBe(0)
  })
  it('G3: un artefacto producido por una revisión no abre otra (409, sin escribir)', async () => {
    const r = await llamar(REVISIONES, 'revisiones', sobre('plan', { payload: { generado_por_jefatura: '00000000-0000-4000-8000-000000000001' } }))
    expect(r.status).toBe(409)
    expect(r.j.error).toBe('sin_otra_vuelta')
    expect(db().escrituras).toHaveLength(0)
  })
  it('regla 8: con `necesita_humano` no abre (409) y no escribe', async () => {
    const r = await llamar(REVISIONES, 'revisiones', sobre('estrategia', { payload: { chequeos_previos: { pasaron: false, necesita_humano: true, marcas: ['S01'] } } }))
    expect(r.status).toBe(409)
    expect(db().escrituras).toHaveLength(0)
  })
  it('un tipo sin renglón = 404; una base caída se lanza (500), nunca se lee como vacío', async () => {
    h.db = new DbFalsaJefatura().semilla('jefatura_config', [{ id: 1, estado: 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: ['cliente-prueba'] }])
    expect((await llamar(REVISIONES, 'revisiones', sobre('pieza'))).status).toBe(404)
    const caida = baseConJefatura(); caida.fallar.jefatura_grading_policies = 'base caída'
    h.db = caida
    const r = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    expect(r.status).toBe(500)
    expect(r.j.detalle).toMatch(/base caída/)
  })
  it('el vigía en ensayo: un paso colgado de más de 12 min se da por muerto y se reanuda UNA vez', async () => {
    const a = await llamar(REVISIONES, 'revisiones', sobre('brief'))
    ;(db().tablas.jefatura_pasos[0] as Json).inicio = new Date(Date.now() - 20 * 60_000).toISOString()
    const v1 = await llamar(VIGIA, 'vigia', {})
    expect(v1.j).toMatchObject({ accion: 'vigilado', reanudar: [a.j.revision_id] })
    expect((db().tablas.jefatura_pasos[0] as Json).estado).toBe('muerto')
    const otra = await llamar(TURNOS, 'turnos', { accion: 'siguiente', revision_id: a.j.revision_id })
    expect(otra.j.accion).toBe('esperar')
    ;(db().tablas.jefatura_pasos[0] as Json).inicio = new Date(Date.now() - 20 * 60_000).toISOString()
    const v2 = await llamar(VIGIA, 'vigia', {})
    expect(v2.j.fallidos).toEqual([a.j.revision_id])
    expect((db().tablas.jefatura_revisiones[0] as Json)).toMatchObject({ estado: 'fallida', resultado: 'fallida' })
  })
})

describe('regla dura del editor y `extra.workflow_execution_id` (diseño §9.4)', () => {
  it('(a) CADA pedido que entregan las rutas lleva la cabecera x-skip-editor-middleware: 1, force_restart y solo las 4 claves de `extra` (los 5 tipos, con fichas que bloquean)', async () => {
    for (const tipo of TIPOS) {
      h.db = baseConJefatura()
      const a = await llamar(REVISIONES, 'revisiones', sobre(tipo as never, { id: `${tipo}-ed`, simulacion: { fichas: 'bloquea', toma: 'algo' } }))
      const id = String(a.j.revision_id)
      let rsp = a
      let pedidos = 0
      for (let i = 0; i < 20 && rsp.j.accion === 'esperar'; i++) {
        const t = rsp.j.turno as Json
        const p = t.pedido as Json
        pedidos++
        expect(auditarPedidoDeAgente(p), `${tipo} ${t.paso}`).toEqual([])
        expect(p.headers_requeridos).toEqual({ 'x-skip-editor-middleware': '1' })
        expect(Object.keys(p.extra).sort()).toEqual(['dispatch_key', 'indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id'])
        expect(p.force_restart).toBe(true)
        expect(JSON.stringify(p)).not.toMatch(/"workflow_execution_id"/)
        rsp = await llamar(TURNOS, 'turnos', { accion: 'resultado', revision_id: id, n: t.n, texto: (p.molde as Json).texto, costo_usd: 0 })
      }
      expect(pedidos, tipo).toBeGreaterThan(0)
    }
  })
  it('(b) ningún constructor de pedido de la jefatura pone `workflow_execution_id` dentro de `extra` (revisión estática de las fuentes)', () => {
    const dirs = [resolve(__dirname, '..', 'src', 'lib', 'jefatura', 'revision'), resolve(__dirname, '..', 'src', 'app', 'api', 'jefatura')]
    const archivos: string[] = []
    const recorre = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = resolve(d, e.name); if (e.isDirectory()) { if (e.name !== 'grade-cimiento') recorre(p) } else if (p.endsWith('.ts')) archivos.push(p) } }
    for (const d of dirs) recorre(d)
    expect(archivos.length).toBeGreaterThan(10)
    for (const f of archivos) {
      const s = readFileSync(f, 'utf8')
      // `extra` solo se arma en pedidos.ts, con las 4 claves; en ningún archivo `extra` y `workflow_execution_id` van en la misma expresión
      expect(s, f).not.toMatch(/extra\s*[:=][^;\n]*workflow_execution_id/)
      expect(s, f).not.toMatch(/extra\.workflow_execution_id\s*=/)
    }
    const pedidos = readFileSync(resolve(dirs[0], 'pedidos.ts'), 'utf8')
    expect(pedidos).toMatch(/extra: \{ indicacion_jefatura: a\.indicacion, paso_de_la_jefatura: a\.paso, revision_id: a\.revision_id, dispatch_key: a\.dispatch_key \}/)
  })
  it('(c) la alarma §148 por cualquier fila `editor_escalation` nueva existe y es de solo lectura; esta jefatura nunca toca `hitl_pending_approvals`', async () => {
    const r = await llamar(REVISIONES, 'revisiones', sobre('pieza'))
    expect(r.status).toBe(200)
    expect(db().escrituras.every((e) => e.tabla.startsWith('jefatura_'))).toBe(true)
    expect(Object.keys(db().tablas)).not.toContain('hitl_pending_approvals')
  })
})

describe('las rutas son nodejs, dinámicas y con tiempo para GPT', () => {
  it('exports de runtime', () => {
    for (const m of [revisionesRuta, turnosRuta, vigiaRuta]) { expect(m.dynamic).toBe('force-dynamic'); expect(m.runtime).toBe('nodejs'); expect(m.maxDuration).toBe(300) }
  })
})
