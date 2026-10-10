/**
 * P4 · la FORMA del flujo «mantenimiento diario del portero» y el comportamiento de sus nodos (ejecutados con un `$` falso). Sin n8n, sin red, sin modelo.
 * Se verifica: nace INACTIVO, arranca DESPUÉS del flujo de la mañana y no lo llama, no lee ninguna tabla, con dry_run no llama a ningún proveedor, ningún nodo reintenta, sin llaves pegadas.
 */
import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string; retryOnFail?: boolean }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; settings: unknown }
const DIR = 'scripts/worker-staging/diario'
const mod = await import('../../../../../scripts/worker-staging/diario/construir-diario.mjs')
const flujo = mod.construirDiario() as unknown as Flujo
const N = mod.NOMBRES as Record<string, string>
const nodo = (n: string) => flujo.nodes.find((x) => x.name === n)!
const codigo = (n: string) => nodo(n).parameters.jsCode as string

interface Contexto { entrada?: unknown[]; previos?: Record<string, unknown[]>; env?: Record<string, string>; http?: (o: Record<string, unknown>) => Promise<unknown>; webhook?: unknown }
async function correr(js: string, c: Contexto = {}): Promise<Array<{ json: any }>> {
  const items = (c.entrada ?? []).map((json) => ({ json }))
  const $ = (n: string) => {
    if (n === N.web && c.webhook === undefined) throw new Error('Node not executed')
    const lista = n === N.web ? [{ json: c.webhook }] : (c.previos ?? {})[n]?.map((json) => ({ json })) ?? []
    return { first: () => lista[0], all: () => lista }
  }
  const f = new Function('$input', '$', '$env', '$workflow', '$execution', `return (async function () { ${js} }).call(this)`)
  const ctx = { helpers: { httpRequest: c.http ?? (async () => { throw new Error('no debe llamarse') }) } }
  return f.call(ctx, { first: () => items[0], all: () => items }, $, c.env ?? {}, { id: 'WF' }, { id: 'EX' })
}

describe('la forma del flujo', () => {
  it('lo dispara el horario de las 08:30 UTC (DESPUÉS del de la mañana, 06:30) o una entrada a mano con llave; no tiene `active` (n8n lo crea INACTIVO)', () => {
    expect(flujo).not.toHaveProperty('active')
    const reloj = flujo.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger')!
    expect(reloj.parameters.rule.interval[0].expression).toBe('30 8 * * *')
    expect(flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')).toHaveLength(1)
  })
  it('NO llama al flujo de la mañana ni lo toca (B1 de CC#3): ni su id, ni su dirección, ni su horario', () => {
    const j = JSON.stringify(flujo)
    expect(j).not.toMatch(/EZXAFQvKZsJlvGNO|cerebro-diario-ensayo|executeWorkflow/)
  })
  it('es una cadena lineal con todos los nodos alcanzables y sin ramas que filtren (el cierre alinea por orden)', () => {
    const nombres = new Set(flujo.nodes.map((n) => n.name))
    const vistos = new Set<string>(); const cola = [N.web, N.horario]
    while (cola.length) { const n = cola.shift()!; if (vistos.has(n)) continue; vistos.add(n); for (const s of flujo.connections[n]?.main ?? []) { expect(s.length).toBeLessThanOrEqual(1); for (const c of s) { expect(nombres.has(c.node)).toBe(true); cola.push(c.node) } } }
    expect([...nombres].filter((x) => !vistos.has(x))).toEqual([])
    expect(flujo.nodes.some((n) => n.type === 'n8n-nodes-base.if' || n.type === 'n8n-nodes-base.switch')).toBe(false)
  })
  it('ningún nodo reintenta; toda llamada HTTP entrega siempre salida y deja decidir a una guarda', () => {
    for (const n of flujo.nodes) expect(n.retryOnFail).toBeUndefined()
    for (const n of flujo.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) { expect(n.onError).toBe('continueRegularOutput'); expect(n.parameters.options.response.response.neverError).toBe(true) }
  })
  it('el flujo NO lee ninguna tabla ni habla con la base: todo lo decide la app (solo /api/brain/diario/* y el Servicio de Apify)', () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
      const t = fs.readFileSync(`${DIR}/${f}`, 'utf8')
      expect(t, f).not.toMatch(/supabase|rest\/v1|SUPABASE_SERVICE_ROLE_KEY/)
    }
    const urls = flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest').map((n) => String(n.parameters.url))
    for (const u of urls) expect(u).toMatch(/\/api\/brain\/diario\/(plan|correr)$/)
    expect(fs.readFileSync(`${DIR}/n2-ampliar.js`, 'utf8')).toContain('/webhook/apify-service-workflow')
  })
  it('sin paso de modelo, sin paso de avisar (D-5) y sin llaves pegadas', () => {
    const j = JSON.stringify(flujo)
    expect(j).not.toMatch(/run-sdk|anthropic|openai|brain\/portero\/(recibir|razonar)|avisar|cerebro_avisos/i)
    expect(j).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9]{10,}/)
    expect(j).toContain('$env.INTERNAL_API_KEY')
  })
  it('todos los nodos de código compilan', () => {
    for (const n of flujo.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) expect(() => new Function('$input', '$', '$env', '$workflow', '$execution', `return (async function () { ${n.parameters.jsCode} }).call(this)`), n.name).not.toThrow()
  })
})

describe('los nodos, ejecutados', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'
  it('⓪ por horario corre de verdad; a mano exige llave, dry_run booleano y cliente uuid', async () => {
    expect((await correr(codigo(N.entrada)))[0].json).toMatchObject({ via: 'horario', dry_run: false, client_id: null, workflow_id: 'WF', workflow_execution_id: 'EX' })
    const mano = (body: unknown, headers: Record<string, string> = { 'x-sala-dispatch-key': 'k' }, env: Record<string, string> = { SALA_DISPATCH_KEY: 'k' }) => correr(codigo(N.entrada), { webhook: { headers, body }, env })
    expect((await mano({ dry_run: true }))[0].json).toMatchObject({ via: 'a mano', dry_run: true, client_id: null })
    expect((await mano({ dry_run: false, client_id: UUID }))[0].json).toMatchObject({ dry_run: false, client_id: UUID })
    await expect(mano({ dry_run: true }, {})).rejects.toThrow(/SIN_LLAVE/)
    await expect(mano({ dry_run: true }, { 'x-sala-dispatch-key': 'k' }, {})).rejects.toThrow(/SIN_LLAVE/)
    await expect(mano({})).rejects.toThrow(/DRY_RUN_OBLIGATORIO/)
    await expect(mano({ dry_run: 'true' })).rejects.toThrow(/DRY_RUN_OBLIGATORIO/)
    await expect(mano({ dry_run: true, client_id: 'x' })).rejects.toThrow(/CLIENTE_INVALIDO/)
  })
  const E = { workflow_id: 'WF', workflow_execution_id: 'EX', via: 'horario', dry_run: false, client_id: null }
  it('① separa el plan en un elemento por cliente; un plan que falla se DICE (no «sin clientes»)', async () => {
    const sep = (resp: unknown) => correr(codigo(N.separar), { entrada: [resp], previos: { [N.entrada]: [E] } })
    const ok = await sep({ clientes: [{ client_id: 'a', nombre: 'A', gastado_hoy_usd: 0.1, plan: { hacer: [{ fuente: 'mapas' }], omitidas: [], no_cubiertas: [] } }, { client_id: 'b', nombre: 'B', plan: { hacer: [] } }] })
    expect(ok.map((i) => i.json.cliente)).toEqual(['a', 'b']); expect(ok[0].json.acciones).toEqual([{ fuente: 'mapas' }])
    expect((await sep({ clientes: [], excluidos: [] }))[0].json).toMatchObject({ sin_clientes: true, cliente: null })
    expect((await sep({ error: 'lectura_fallida', detalle: 'clients: boom' }))[0].json.falla).toMatch(/El plan falló: lectura_fallida clients: boom/)
    expect((await sep(undefined))[0].json.falla).toMatch(/sin respuesta/)
  })
  it('② con dry_run NO llama a nadie; sin cliente o con falla tampoco', async () => {
    const http = vi.fn()
    const r = await correr(codigo(N.ampliar), { entrada: [{ ...E, dry_run: true, cliente: 'a', acciones: [{ fuente: 'mapas', funcion: 'own_google_maps_profile', params: {}, usd_max: 0.1 }] }, { ...E, cliente: null, falla: 'x' }], http })
    expect(http).not.toHaveBeenCalled(); expect(r).toHaveLength(2); expect(r[0].json.ampliacion.nota).toMatch(/dry_run/)
  })
  it('② sin dry_run: una llamada al Servicio por acción con los parámetros del plan y la marca de propio; cuenta el costo REAL si existe y si no el MÁXIMO (nunca 0)', async () => {
    const llamadas: Array<Record<string, any>> = []
    const http = async (o: Record<string, any>) => {
      llamadas.push(o)
      if (String(o.url).includes('apify-service-workflow')) return { statusCode: 200, body: { ok: true, apify_run_id: o.body.apify_function === 'own_google_maps_profile' ? 'run1' : null } }
      return { statusCode: 200, body: { data: { usageTotalUsd: 0.0123, status: 'SUCCEEDED' } } }
    }
    const acciones = [{ fuente: 'mapas', funcion: 'own_google_maps_profile', params: { searchStringsArray: ['X'], maxReviews: 100 }, metadata: { target_kind: 'own' }, usd_max: 0.1, medido: false }, { fuente: 'comentarios', funcion: 'instagram_post_comments_scraper', params: { directUrls: ['u'] }, metadata: { target_kind: 'own' }, usd_max: 0.05, medido: false }]
    const r = await correr(codigo(N.ampliar), { entrada: [{ ...E, cliente: 'a', acciones }], http, env: { APIFY_API_TOKEN: 't' } })
    const svc = llamadas.filter((l) => String(l.url).includes('apify-service-workflow'))
    expect(svc).toHaveLength(2)
    expect(svc[0].body).toMatchObject({ client_id: 'a', apify_function: 'own_google_maps_profile', destination: 'respuesta', dry_run: false, metadata: { target_kind: 'own', calling_workflow_id: 'WF' } })
    expect(svc[0].body.params).toMatchObject({ maxReviews: 100 })
    const a = r[0].json.ampliacion
    expect(a.llamadas.map((l: any) => l.costo_contado_usd)).toEqual([0.0123, 0.05]) // el real del primero; el MÁXIMO del segundo (sin run id)
    expect(a.gasto_usd).toBeCloseTo(0.0623, 6); expect(a.hecho).toBe(true)
  })
  it('② dos fallas seguidas paran a ese cliente (sin reintentar) y el siguiente cliente sigue', async () => {
    let n = 0
    const http = async () => { n++; return { statusCode: 500, body: { error: 'caído' } } }
    const mk = (f: string) => ({ fuente: f, funcion: 'website_content_scraper', params: {}, usd_max: 0.0536, medido: true })
    const r = await correr(codigo(N.ampliar), { entrada: [{ ...E, cliente: 'a', acciones: [mk('reparto'), mk('reparto'), mk('reparto')] }, { ...E, cliente: 'b', acciones: [mk('reparto')] }], http })
    expect(r[0].json.ampliacion).toMatchObject({ parado: 'dos_fallas_seguidas', hecho: false }); expect(r[0].json.ampliacion.llamadas).toHaveLength(2)
    expect(r[1].json.ampliacion.llamadas).toHaveLength(1); expect(n).toBe(3)
    expect(r[0].json.ampliacion.llamadas[0].error).toMatch(/caído/)
  })
  it('③ el pedido lleva el gasto real de la ampliación; sin cliente o con falla queda en null (saltado)', async () => {
    const r = await correr(codigo(N.pedido), { entrada: [{ ...E, cliente: 'a', ampliacion: { gasto_usd: 0.4 } }, { ...E, cliente: null }, { ...E, cliente: 'c', falla: 'x' }] })
    expect(r[0].json.correr_body).toEqual({ client_id: 'a', dry_run: false, workflow_id: 'WF', workflow_execution_id: 'EX', gasto_ampliacion_usd: 0.4 })
    expect(r[1].json.correr_body).toBeNull(); expect(r[2].json.correr_body).toBeNull()
  })
  it('④ el cierre alinea cada cliente con su respuesta, ignora lo saltado y DICE los errores; no deja pasar texto de reseñas', async () => {
    const pedidos = [{ ...E, cliente: 'a', correr_body: {}, ampliacion: { hecho: true, gasto_usd: 0.1, llamadas: [{}], parado: null } }, { ...E, cliente: null, correr_body: null }, { ...E, cliente: 'c', correr_body: {} }]
    const resp = [{ ok: true, estado: 'hecha', fuentes: [{ fuente: 'sitio', accion: 'renovada' }], oportunidades: [{ dato: 'x' }], gasto: { total_usd: 0.1 }, errores: [] }, { error: 'client_id obligatorio' }, { ok: false, estado: 'con_errores', errores: ['sin permiso'], fuentes: [] }]
    const r = (await correr(codigo(N.cierre), { entrada: resp, previos: { [N.pedido]: pedidos, [N.entrada]: [E] } }))[0].json
    expect(r.fin).toBe('con_errores')
    expect(r.clientes.map((c: any) => [c.cliente, c.estado])).toEqual([['a', 'hecha'], [null, 'saltado'], ['c', 'con_errores']])
    expect(r.clientes[0]).toMatchObject({ fuentes: ['sitio:renovada'], oportunidades: 1 }); expect(r.clientes[2].errores).toEqual(['sin permiso'])
    const bien = (await correr(codigo(N.cierre), { entrada: [resp[0], { error: 'x' }], previos: { [N.pedido]: pedidos.slice(0, 2), [N.entrada]: [E] } }))[0].json
    expect(bien.fin).toBe('hecho')
    const ya = (await correr(codigo(N.cierre), { entrada: [{ ok: true, estado: 'ya_corrio_hoy' }], previos: { [N.pedido]: [pedidos[0]], [N.entrada]: [E] } }))[0].json
    expect(ya.fin).toBe('hecho')
  })
})
