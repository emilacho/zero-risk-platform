/**
 * JEFATURA · PRUEBA DE HUMO J4 ↔ J3 (CC#2 · 13-oct): el código de los nodos de los flujos GENERADOS por `construir-jefatura.mjs` (no los archivos sueltos: lo que n8n recibiría) se EJECUTA, en el orden del flujo,
 * contra las RUTAS REALES `/api/jefatura/{revisiones,turnos,vigia}` con la base falsa. Un recorrido por tipo (pieza, plan A→B→C, estrategia, calendario, brief solo-marca) hasta la entrega al llamador.
 * US$ 0: sin red, sin modelo, sin base real; el nodo «Agente» (el único que paga) no se ejecuta: en seco el nodo ② devuelve su molde.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsaJefatura } from './_helpers/dbfalsa-jefatura'
import { FILAS_DE_POLITICA, sobre } from './_helpers/jefatura-revision'
// @ts-expect-error · módulo .mjs sin tipos
import { construirTurno, construirVigia } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))

import { POST as REVISIONES } from '../src/app/api/jefatura/revisiones/route'
import { POST as TURNOS } from '../src/app/api/jefatura/turnos/route'
import { POST as VIGIA } from '../src/app/api/jefatura/vigia/route'

type Json = Record<string, any>
const LLAVE = process.env.SALA_DISPATCH_KEY ?? 'test-dispatch-key-e67'
const TIPOS = ['plan', 'estrategia', 'calendario', 'brief', 'pieza']
const ENV = { SALA_DISPATCH_KEY: LLAVE, N8N_WEBHOOK_BASE: 'https://n8n-production-72be.up.railway.app/webhook' }

const turnoJson = construirTurno() as Json
const vigiaJson = construirVigia() as Json
const codigoDe = (flujo: Json, nombre: string): string => {
  const n = (flujo.nodes as Json[]).find((x) => x.name === nombre)
  if (!n) throw new Error(`el flujo generado no tiene el nodo «${nombre}»`)
  return String(n.parameters.jsCode)
}

/** ejecuta un nodo Code de n8n con sus globales simulados */
function nodo(flujo: Json, nombre: string, o: { entrada: Json | Json[]; nodos?: Record<string, Json | Json[]> }): Json[] {
  const entradas = (Array.isArray(o.entrada) ? o.entrada : [o.entrada]).map((json) => ({ json }))
  const nodos = o.nodos ?? {}
  const $ = (n: string) => ({
    first: () => ({ json: Array.isArray(nodos[n]) ? (nodos[n] as Json[])[0] : nodos[n] }),
    itemMatching: (k: number) => ({ json: Array.isArray(nodos[n]) ? (nodos[n] as Json[])[k] : nodos[n] }),
  })
  const fn = new Function('$input', '$env', '$', '$execution', '$workflow', codigoDe(flujo, nombre))
  const r = fn({ first: () => entradas[0], all: () => entradas }, ENV, $, { id: 'exec-1', resumeUrl: 'https://n8n.invalid/resume' }, { id: 'wf-1' }) as Array<{ json: Json }>
  return r.map((x) => x.json)
}

const pedir = (ruta: string, cuerpo: unknown) => new Request(`http://app.test/api/jefatura/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': LLAVE }, body: JSON.stringify(cuerpo) })
const http = async (f: (r: Request) => Promise<Response>, ruta: string, cuerpo: unknown): Promise<Json> => { const r = await f(pedir(ruta, cuerpo)); return { statusCode: r.status, body: await r.json() } }

function baseConJefatura(): DbFalsaJefatura {
  const db = new DbFalsaJefatura()
  db.semilla('jefatura_config', [{ id: 1, estado: 'ensayo', tipos_activos: TIPOS, clientes_ensayo: ['cliente-prueba'] }])
  db.semilla('jefatura_grading_policies', TIPOS.map((t) => ({ ...FILAS_DE_POLITICA[t], is_active: false })))
  return db
}
beforeEach(() => { h.db = baseConJefatura(); process.env.SALA_DISPATCH_KEY = LLAVE })
const db = () => h.db as DbFalsaJefatura

interface Recorrido { ejecuciones: number; pasos: string[]; entrega: Json | null; ultimo: Json; turnos: Json[] }

/** el flujo `jefatura · turno` en orden, una ejecución por paso, hasta que el nodo ③ decide entregar o nada */
async function recorrer(abierto: Json, tope = 40): Promise<Recorrido> {
  let turnoBody: Json = { revision_id: abierto.body.revision_id, turno: abierto.body.turno }
  const pasos: string[] = [], turnos: Json[] = []
  for (let i = 1; i <= tope; i++) {
    const [entrada] = nodo(turnoJson, '⓪ Entrada · llave', { entrada: { body: turnoBody, headers: { 'x-sala-dispatch-key': LLAVE } } })
    const [armado] = nodo(turnoJson, '② Armar el pedido', { entrada })
    expect(armado.simulado, 'en seco el nodo ② contesta con su molde').toBe(true)
    // FUENTE ÚNICA (CC#3 · J2/J3 reparo 2): con la ruta real, el seco contesta el molde DE LA RUTA, nunca el de respaldo del flujo
    expect(armado.molde_de, `molde del paso ${entrada.turno.paso}`).toBe('ruta')
    pasos.push(`${entrada.turno.paso}`); turnos.push(entrada.turno)
    const respuesta = await http(TURNOS, 'turnos', armado.resultado_body)
    const [sigue] = nodo(turnoJson, '③ ¿Y ahora?', { entrada: respuesta, nodos: { '⓪ Entrada · llave': entrada } })
    if (sigue.ruta === 'esperar') { turnoBody = sigue.turno_body; continue }
    return { ejecuciones: i, pasos, entrega: sigue, ultimo: respuesta, turnos }
  }
  throw new Error('la revisión no cerró en el tope de pasos')
}

async function abrir(tipo: string, o: Parameters<typeof sobre>[1] & { devolver_a?: Json } = {}): Promise<Json> {
  const s = sobre(tipo as never, o) as Json
  s.payload.devolver_a = o.devolver_a ?? { tipo: 'webhook', destino: `${ENV.N8N_WEBHOOK_BASE}/zero-risk/llamador-de-prueba` }
  const r = await http(REVISIONES, 'revisiones', s)
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200)
  expect(r.body.accion).toBe('esperar')
  return r
}

describe('el flujo `jefatura · turno` generado, contra las rutas reales: un recorrido por tipo hasta la entrega', () => {
  it.each([
    ['pieza', 'bloquea'], ['plan', 'bloquea'], ['estrategia', 'bloquea'], ['calendario', 'bloquea'], ['brief', 'bloquea'],
  ])('%s (fichas %s): abre → pasos de agente → GPT y cierre dentro de la ruta → entrega por webhook', async (tipo, fichas) => {
    const abierto = await abrir(tipo, { simulacion: { fichas, toma: 'todo' } })
    const r = await recorrer(abierto)
    expect(r.entrega?.ruta, tipo).toBe('webhook')
    expect(r.entrega?.entrega_url).toBe(`${ENV.N8N_WEBHOOK_BASE}/zero-risk/llamador-de-prueba`)
  })
})

describe('lo que se entrega y por qué camino (con las rutas reales)', () => {
  it('pieza con fichas que bloquean: cada paso es UNA ejecución y la entrega trae el resultado y las marcas de la ruta', async () => {
    const r = await recorrer(await abrir('pieza', { simulacion: { fichas: 'bloquea', toma: 'todo' } }))
    expect(r.pasos[0]).toBe('revision_fondo')
    expect(r.pasos.some((p) => p.startsWith('correccion:'))).toBe(true)
    expect(r.pasos.some((p) => p.startsWith('decision:'))).toBe(true)
    expect(r.ejecuciones).toBe(r.pasos.length)
    expect(r.entrega?.entrega_cuerpo.resultado).toBe('limpia')
    expect(r.entrega?.entrega_cuerpo.marcas).toEqual({ con_desacuerdo: false, sin_segunda_mirada: false })
    expect(r.entrega?.entrega_cuerpo.salida.simulado).toBe(true)
  })
  it('sin fichas no hay corrección', async () => {
    const r = await recorrer(await abrir('brief', { simulacion: { fichas: 'ninguna' } }))
    expect(r.pasos.filter((p) => p.startsWith('correccion:'))).toEqual([])
    expect(r.entrega?.ruta).toBe('webhook')
  })
  it('plan: A→B→C se recorre con la cabecera del editor en CADA pedido y sin `workflow_execution_id` en extra', async () => {
    const r = await recorrer(await abrir('plan', { simulacion: { fichas: 'bloquea', toma: 'todo', version_nueva: 'mejora' } }))
    for (const t of r.turnos) {
      expect(t.pedido.headers_requeridos['x-skip-editor-middleware']).toBe('1')
      expect(Object.keys(t.pedido.extra).sort()).toEqual(['dispatch_key', 'indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id'])
      expect(t.pedido.force_restart).toBe(true)
    }
    expect(r.entrega?.entrega_cuerpo.salida.versiones.map((v: Json) => v.etiqueta)).toEqual(expect.arrayContaining(['A', 'B']))
  })
  it('plan con versión nueva que empeora o demasiado corta: la revisión cierra y entrega (no queda corriendo)', async () => {
    for (const version_nueva of ['empeora', 'demasiado_corta']) {
      h.db = baseConJefatura()
      const r = await recorrer(await abrir('plan', { id: `plan-${version_nueva}`, simulacion: { fichas: 'bloquea', toma: 'todo', version_nueva } }))
      expect(r.entrega?.ruta, version_nueva).toBe('webhook')
    }
  })
  it('toma:nada → `con_desacuerdo` viaja en la entrega', async () => {
    const r = await recorrer(await abrir('pieza', { simulacion: { fichas: 'bloquea', toma: 'nada' } }))
    expect(r.entrega?.entrega_cuerpo.resultado).toBe('con_desacuerdo')
    expect(r.entrega?.entrega_cuerpo.marcas.con_desacuerdo).toBe(true)
  })
  it('GPT sin respuesta (falla_red) → `sin_segunda_mirada`, y el cable a la sala lo dice con las palabras de la sala', async () => {
    const r = await recorrer(await abrir('pieza', { simulacion: { fichas: 'bloquea', gpt: 'falla_red' }, devolver_a: { tipo: 'sala_ref', destino: 'corr-123' } }))
    expect(r.entrega?.ruta).toBe('cable')
    expect(r.entrega?.payload_cable.resultado).toBe('sin_segunda_mirada')
    expect(r.entrega?.payload_cable._sala_correlation_id).toBe('corr-123')
    expect(r.entrega?.payload_cable.simulado).toBe(true)
  })
  it('devolver_a ninguno → el nodo ③ no entrega nada', async () => {
    const r = await recorrer(await abrir('estrategia', { simulacion: { fichas: 'bloquea' }, devolver_a: { tipo: 'ninguno', destino: '' } }))
    expect(r.entrega?.ruta).toBe('nada')
  })
  it('formato roto en el primer intento: el reintento lo manda la ruta y cierra limpia', async () => {
    const r = await recorrer(await abrir('pieza', { simulacion: { fichas: 'bloquea', toma: 'todo', productor: 'formato_roto' } }))
    expect(r.pasos.filter((p) => p === 'correccion:content-creator')).toHaveLength(2)
    expect(r.entrega?.entrega_cuerpo.resultado).toBe('limpia')
  })
  it('formato roto SIEMPRE → `fallida` entregada (nunca se queda corriendo)', async () => {
    const r = await recorrer(await abrir('pieza', { simulacion: { fichas: 'bloquea', productor: 'formato_roto_siempre' } }))
    expect(r.entrega?.entrega_cuerpo.resultado).toBe('fallida')
  })
  it('destino fuera de nuestro n8n y nuestro Vercel: el nodo ③ se DETIENE aunque la ruta lo haya aceptado', async () => {
    await expect(recorrer(await abrir('brief', { simulacion: { fichas: 'ninguna' }, devolver_a: { tipo: 'webhook', destino: 'https://ajeno.example.com/hook' } }))).rejects.toThrow(/JEFATURA_DESTINO_NO_PERMITIDO/)
  })
})

describe('la jefatura apagada y el vigía', () => {
  it('APAGADA: /turnos contesta 409 y el nodo ③ DETIENE el flujo con el motivo', async () => {
    const abierto = await abrir('pieza', { simulacion: { fichas: 'bloquea' } })
    db().tablas.jefatura_config = [{ id: 1, estado: 'apagada', tipos_activos: TIPOS, clientes_ensayo: ['cliente-prueba'] }]
    await expect(recorrer(abierto)).rejects.toThrow(/JEFATURA_TURNO_RECHAZADO · \/api\/jefatura\/turnos contestó 409/)
  })
  it('APAGADA: el vigía contesta `apagada` y el nodo ① no saca ningún ítem', async () => {
    db().tablas.jefatura_config = [{ id: 1, estado: 'apagada', tipos_activos: TIPOS, clientes_ensayo: ['cliente-prueba'] }]
    const r = await http(VIGIA, 'vigia', {})
    expect(r.body.accion).toBe('apagada')
    expect(nodo(vigiaJson, '① Qué hacer con cada pendiente', { entrada: r })).toEqual([])
  })
  it('vigía sin nada pendiente: `vigilado` con listas vacías → 0 ítems', async () => {
    const r = await http(VIGIA, 'vigia', {})
    expect(r.body).toMatchObject({ accion: 'vigilado', reanudar: [], cierres: [] })
    expect(nodo(vigiaJson, '① Qué hacer con cada pendiente', { entrada: r })).toEqual([])
  })
  it('productor muerto en seco: el nodo ② no devuelve nada y el vigía lo reanuda con el MISMO paso', async () => {
    const abierto = await abrir('pieza', { simulacion: { fichas: 'bloquea', productor: 'muerto' } })
    let turnoBody: Json = { revision_id: abierto.body.revision_id, turno: abierto.body.turno }
    let muerto: Json | null = null
    for (let i = 0; i < 6 && !muerto; i++) {
      const [entrada] = nodo(turnoJson, '⓪ Entrada · llave', { entrada: { body: turnoBody, headers: { 'x-sala-dispatch-key': LLAVE } } })
      const armado = nodo(turnoJson, '② Armar el pedido', { entrada })
      if (armado.length === 0) { muerto = entrada; break }
      const respuesta = await http(TURNOS, 'turnos', armado[0].resultado_body)
      turnoBody = nodo(turnoJson, '③ ¿Y ahora?', { entrada: respuesta, nodos: { '⓪ Entrada · llave': entrada } })[0].turno_body
    }
    expect(muerto, 'algún paso debía morir').toBeTruthy()
    for (const p of db().tablas.jefatura_pasos ?? []) if (p.estado === 'corriendo') for (const k of Object.keys(p)) if (/inicio|started|creado|created/.test(k)) p[k] = new Date(Date.now() - 20 * 60_000).toISOString()
    const v = await http(VIGIA, 'vigia', {})
    expect(v.body.accion).toBe('vigilado')
    const items = nodo(vigiaJson, '① Qué hacer con cada pendiente', { entrada: v })
    expect(items.map((x) => x.tipo)).toEqual(['reanudar'])
    expect(items[0].revision_id).toBe(muerto!.revision_id)
    const re = await http(TURNOS, 'turnos', { accion: 'siguiente', revision_id: items[0].revision_id })
    const [paso] = nodo(vigiaJson, '② Re-armar · resultado', { entrada: [re], nodos: { '① Qué hacer con cada pendiente': items } })
    expect(paso.turno_body.turno.paso).toBe(muerto!.turno.paso)
  })
})

describe('lo que el vigía y la vuelta del agente entregan a la ruta', () => {
  const cierre = (url: string) => nodo(vigiaJson, '① Qué hacer con cada pendiente', { entrada: { statusCode: 200, body: { accion: 'vigilado', reanudar: [], cierres: [{ revision_id: 'r2', resultado: 'fallida', devolver: { tipo: 'webhook', url } }] } } })
  it('el vigía solo entrega a nuestro n8n o a `/api/jefatura/` de nuestro Vercel (también con el prefijo escondido dentro de la dirección)', () => {
    expect(cierre(`${ENV.N8N_WEBHOOK_BASE}/zero-risk/x`)).toHaveLength(1)
    expect(cierre('https://zero-risk-platform.vercel.app/api/jefatura/x')).toHaveLength(1)
    for (const url of ['https://zero-risk-platform.vercel.app/api/agents/run-sdk', 'https://zero-risk-platform.vercel.app.otro.com/api/jefatura/x', 'https://otro.com/?x=https://zero-risk-platform.vercel.app/api/jefatura/', 'https://otro.com/https://n8n-production-72be.up.railway.app/webhook/x', 'https://ajeno.example.com/x']) {
      expect(() => cierre(url), url).toThrow(/JEFATURA_DESTINO_NO_PERMITIDO/)
    }
  })
  it('la vuelta del agente real llega a la ruta con `workflow_execution_id` ARRIBA del cuerpo (la ruta lo guarda en el paso; jamás va dentro de `extra`)', async () => {
    const abierto = await abrir('pieza', { dry_run: false })
    const t = abierto.body.turno as Json
    const armado = nodo(turnoJson, '② Armar el pedido', { entrada: { revision_id: abierto.body.revision_id, dry_run: false, turno: t } })[0]
    const [vuelta] = nodo(turnoJson, '② Vuelta', { entrada: { body: { response: '{"fichas":[]}', cost_usd: 0.03 } }, nodos: { '② Armar el pedido': armado } })
    expect(vuelta.resultado_body).toMatchObject({ accion: 'resultado', n: t.n, workflow_execution_id: 'exec-1', workflow_id: 'wf-1', costo_usd: 0.03, texto: '{"fichas":[]}' })
    const r = await http(TURNOS, 'turnos', vuelta.resultado_body)
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200)
    const guardado = (db().tablas.jefatura_pasos ?? []).find((p) => p.n === t.n)
    expect(guardado?.workflow_execution_id).toBe('exec-1')
  })
})

describe('fuente única de moldes: el nodo ② prefiere el molde de la ruta y el de respaldo del flujo solo entra sin él', () => {
  const REV = '00000000-0000-4000-8000-000000000009'
  const armar = (pedido: Json, dry_run = true) => nodo(turnoJson, '② Armar el pedido', { entrada: { revision_id: REV, dry_run, turno: { n: 3, tipo: 'agente', paso: 'revision_fondo', dispatch_key: `${REV}:3`, pedido: { agent_name: 'jefe-marketing', client_id: 'c', max_budget_usd: 0.2, dry_run, ...pedido } } } })
  it('con `pedido.molde.texto` contesta ESE texto, aunque el respaldo del flujo diga otra cosa', () => {
    const [r] = armar({ task: 't', esquema: 'fichas.v1', simulacion: { fichas: 'bloquea' }, molde: { texto: '{"fichas":[]}' } })
    expect(r.molde_de).toBe('ruta')
    expect(r.resultado_body.texto).toBe('{"fichas":[]}')
  })
  it('sin molde de la ruta usa el respaldo del flujo y lo dice (`molde_de: flujo`)', () => {
    const [r] = armar({ task: 't', esquema: 'fichas.v1', simulacion: { fichas: 'ninguna' } })
    expect(r.molde_de).toBe('flujo')
  })
  it('molde de la ruta sin texto: error visible al motor; si el productor murió, no contesta (lo recoge el vigía)', () => {
    const [e] = armar({ task: 't', esquema: 'resolucion.v1', molde: { texto: null, error: 'esquema sin molde (ruta)' } })
    expect(e.resultado_body.error).toMatch(/JEFATURA_MOLDE_DE_LA_RUTA_SIN_TEXTO · esquema sin molde \(ruta\)/)
    expect(armar({ task: 't', esquema: 'resolucion.v1', simulacion: { productor: 'muerto' }, molde: { texto: null, error: 'murió' } })).toEqual([])
  })
  it('en REAL el molde de la ruta se ignora: se arma el pedido a run-sdk y no se contesta nada simulado', () => {
    const [r] = armar({ task: 't', esquema: 'fichas.v1', molde: { texto: '{"fichas":[]}' }, extra: {} }, false)
    expect(r.simulado).toBe(false)
    expect(r.molde_de).toBeUndefined()
    expect(r.cuerpo.agent).toBe('jefe-marketing')
  })
})
