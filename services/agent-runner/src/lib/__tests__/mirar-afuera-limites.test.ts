/**
 * LÍMITES DE «MIRAR AFUERA» POR CORRIDA · «máximo N pedidos» y «sólo estas opciones» los hace cumplir el SISTEMA, no el texto del pedido · pruebas a costo cero · CC#1 · 2026-10-01
 * (encargo Lenovo `cerrar-el-rojo-del-flujo-de-la-pieza` punto 3 · certificación CC#3: «el tope y la prohibición son TEXTO»).
 *
 * 🔴 El ROJO, contra el estado de ANTES (`origin/main` 8bce36f): ni el esquema de la herramienta ni su ejecución conocían un límite por corrida:
 *   · la herramienta ofrecía los NUEVE `que_mirar` (incluidos `anuncios_en_meta` y `anuncios_en_google`, los caros) a quien la montara
 *   · un empleado podía pedir 5, 8, 20 raspados en una corrida: cada uno llegaba al Servicio de Apify (que no tiene tope ni contador por agente)
 * Después: con límites en el pedido, el esquema sólo ofrece lo permitido y el pedido N+1 se rechaza ANTES de llegar al Servicio. SIN límites todo es idéntico a hoy (opt-in puro).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildMcpServers } from '../agent-mcp-registry'

const require = createRequire(import.meta.url)
const { resolverLimites, crearControl, leerLimitesDeEntorno, LIMITE_MAXIMO_DE_PEDIDOS } = require('../mcp/mirar-afuera-limites.js') as {
  resolverLimites: (...c: unknown[]) => { ok: boolean; valor?: { maxPedidos: number | null; permitidos: string[] | null } | null; motivo?: string }
  crearControl: (l: { maxPedidos: number | null; permitidos: string[] | null }) => { revisar: (q: string) => { ok: boolean; motivo?: string; codigo?: string }; usados: () => number }
  leerLimitesDeEntorno: (env: Record<string, string | undefined>) => { maxPedidos: number | null; permitidos: string[] | null }
  LIMITE_MAXIMO_DE_PEDIDOS: number
}
const { CATALOGO } = require('../mcp/apify-catalogo.js') as { CATALOGO: Record<string, unknown> }
const CUATRO = ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador']

describe('① el pedido con límites se valida (un límite mal escrito se rechaza, no se ignora)', () => {
  it('ausente ⇒ sin límites (valor null · el comportamiento de hoy)', () => {
    expect(resolverLimites(undefined, undefined)).toEqual({ ok: true, valor: null })
  })
  it('válido: max_pedidos entero 1..20 y/o permitidos ⊂ catálogo · acepta camelCase y snake_case · el primero presente manda', () => {
    expect(resolverLimites({ max_pedidos: 4, permitidos: CUATRO })).toEqual({ ok: true, valor: { maxPedidos: 4, permitidos: CUATRO } })
    expect(resolverLimites(undefined, { maxPedidos: 2 })).toEqual({ ok: true, valor: { maxPedidos: 2, permitidos: null } })
    expect(resolverLimites({ permitidos: ['instagram'] })).toEqual({ ok: true, valor: { maxPedidos: null, permitidos: ['instagram'] } })
  })
  it.each([[0], [-1], [1.5], ['4'], [null], [LIMITE_MAXIMO_DE_PEDIDOS + 1], [NaN]])('🔴 max_pedidos %j ⇒ se RECHAZA', (v) => {
    expect(resolverLimites({ max_pedidos: v }).ok).toBe(false)
  })
  it.each([[[]], [['no_existe']], [['instagram', 'no_existe']], ['instagram'], [[1]], [null]])('🔴 permitidos %j ⇒ se RECHAZA (una opción que no existe no se ignora)', (v) => {
    expect(resolverLimites({ permitidos: v }).ok).toBe(false)
  })
  it('un objeto vacío, un texto o una lista no son límites válidos', () => {
    for (const malo of [{}, 'x', [], 3, true]) expect(resolverLimites(malo).ok, JSON.stringify(malo)).toBe(false)
  })
})

describe('② el control cuenta y rechaza ANTES de llegar al Servicio', () => {
  it('🔴 «máximo 4 pedidos»: el 5.º se rechaza con su motivo · los 4 primeros pasan', () => {
    const c = crearControl({ maxPedidos: 4, permitidos: null })
    for (let i = 0; i < 4; i++) expect(c.revisar('instagram').ok, 'pedido ' + (i + 1)).toBe(true)
    const quinto = c.revisar('ficha_en_mapas')
    expect(quinto).toMatchObject({ ok: false, codigo: 'limite_de_pedidos' })
    expect(quinto.motivo).toMatch(/máximo de 4 pedidos/)
    expect(c.usados()).toBe(4)
  })
  it('🔴 «sólo estas opciones»: lo no permitido se rechaza y NO gasta un pedido del cupo', () => {
    const c = crearControl({ maxPedidos: 2, permitidos: CUATRO })
    expect(c.revisar('anuncios_en_meta')).toMatchObject({ ok: false, codigo: 'opcion_no_permitida' })
    expect(c.revisar('anuncios_en_google').ok).toBe(false)
    expect(c.usados()).toBe(0)
    expect(c.revisar('instagram').ok).toBe(true)
    expect(c.revisar('leer_el_sitio').ok).toBe(true)
    expect(c.revisar('que_dice_el_buscador').ok).toBe(false) // el cupo era 2
  })
  it('sin límites ⇒ ilimitado e idéntico a hoy (opt-in puro)', () => {
    const c = crearControl({ maxPedidos: null, permitidos: null })
    for (const k of Object.keys(CATALOGO)) expect(c.revisar(k).ok).toBe(true)
    for (let i = 0; i < 50; i++) expect(c.revisar('instagram').ok).toBe(true)
  })
  it('los pedidos «de una vez» (en paralelo) también cuentan: el cupo se toma de forma síncrona', async () => {
    const c = crearControl({ maxPedidos: 4, permitidos: null })
    const r = await Promise.all(Array.from({ length: 8 }, () => Promise.resolve().then(() => c.revisar('instagram'))))
    expect(r.filter((x) => x.ok)).toHaveLength(4)
    expect(r.filter((x) => !x.ok)).toHaveLength(4)
  })
  it('el entorno que arma el registro se lee de vuelta igual · entorno sin variables ⇒ sin límites', () => {
    expect(leerLimitesDeEntorno({})).toEqual({ maxPedidos: null, permitidos: null })
    expect(leerLimitesDeEntorno({ MIRAR_AFUERA_MAX_PEDIDOS: '4', MIRAR_AFUERA_PERMITIDOS: CUATRO.join(',') })).toEqual({ maxPedidos: 4, permitidos: CUATRO })
    expect(leerLimitesDeEntorno({ MIRAR_AFUERA_MAX_PEDIDOS: 'abc', MIRAR_AFUERA_PERMITIDOS: '' })).toEqual({ maxPedidos: null, permitidos: null })
  })
})

describe('③ el registro monta la herramienta CON los límites del pedido · y sin ellos como siempre', () => {
  const ctx = { agentSlug: 'campaign-brief-agent', clientId: 'cli-1' }
  it('🔴 con límites: el entorno del servidor los lleva', () => {
    const s = buildMcpServers({ ...ctx, mirarAfueraLimites: { maxPedidos: 4, permitidos: CUATRO } })['mirar-afuera']
    expect(s.env.MIRAR_AFUERA_MAX_PEDIDOS).toBe('4')
    expect(s.env.MIRAR_AFUERA_PERMITIDOS).toBe(CUATRO.join(','))
  })
  it('CONTROL POSITIVO: sin límites el entorno es el de siempre (ni existen las claves) · otros agentes y default-deny intactos', () => {
    const s = buildMcpServers(ctx)['mirar-afuera']
    expect(Object.keys(s.env).sort()).toEqual(['AGENT_SLUG', 'APIFY_SERVICE_URL', 'CLIENT_ID', 'PATH'])
    expect(buildMcpServers({ agentSlug: 'content-creator', clientId: 'c', mirarAfueraLimites: { maxPedidos: 1, permitidos: null } })['mirar-afuera']).toBeUndefined()
    expect(buildMcpServers({ agentSlug: 'campaign-brief-agent', mirarAfueraLimites: { maxPedidos: 1, permitidos: null } })['mirar-afuera']).toBeUndefined()
  })
})

// ── ④ EL MECANISMO DE PUNTA A PUNTA · el servidor MCP REAL (proceso aparte) contra un Servicio de Apify FALSO que cuenta lo que le llega ──────────────────────
describe('④ de punta a punta · el servidor MCP real · el Servicio sólo ve lo permitido', () => {
  let falso: Server | null = null
  afterEach(() => { falso?.close(); falso = null })
  async function conServidor(env: Record<string, string>) {
    const llegaron: string[] = []
    falso = createServer((req, res) => {
      let b = ''
      req.on('data', (d) => (b += d))
      req.on('end', () => { llegaron.push(JSON.parse(b).apify_function); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, chunks_count: 1, datos: [] })) })
    })
    await new Promise<void>((r) => falso!.listen(0, '127.0.0.1', () => r()))
    const puerto = (falso!.address() as { port: number }).port
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(__dirname, '..', 'mcp', 'apify-service-server.js')],
      env: { ...process.env, CLIENT_ID: 'cli-1', AGENT_SLUG: 'campaign-brief-agent', APIFY_SERVICE_URL: `http://127.0.0.1:${puerto}/`, ...env } as Record<string, string>,
    })
    const client = new Client({ name: 'prueba', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    return { client, llegaron, cerrar: () => client.close() }
  }
  const pedir = async (client: any, que_mirar: string) => {
    try {
      const r = await client.callTool({ name: 'mirar_afuera', arguments: { que_mirar, de_quien: 'negocio' } })
      if (r.isError) return { rechazadoPorElEsquema: true, texto: JSON.stringify(r.content) }
      return JSON.parse(r.content[0].text)
    } catch (e) { return { rechazadoPorElEsquema: true, texto: String((e as Error).message) } }
  }

  it('🔴 SIN límites (el estado de hoy): el esquema ofrece los 9 y 8 pedidos llegan TODOS al Servicio — esto es lo que el flujo de la pieza NO puede permitir', async () => {
    const s = await conServidor({})
    try {
      const tools = await s.client.listTools()
      const enumOfrecido = tools.tools[0].inputSchema.properties.que_mirar.enum as string[]
      expect(enumOfrecido).toEqual(Object.keys(CATALOGO))
      expect(enumOfrecido).toContain('anuncios_en_meta')
      for (let i = 0; i < 8; i++) expect((await pedir(s.client, 'instagram')).se_pudo).toBe(true)
      expect(s.llegaron).toHaveLength(8)
    } finally { await s.cerrar() }
  }, 30000)

  it('🔴 CON límites (4 pedidos · 4 opciones): el esquema NO ofrece los anuncios · el 5.º pedido NO llega al Servicio · los anuncios tampoco', async () => {
    const s = await conServidor({ MIRAR_AFUERA_MAX_PEDIDOS: '4', MIRAR_AFUERA_PERMITIDOS: CUATRO.join(',') })
    try {
      const tools = await s.client.listTools()
      const enumOfrecido = tools.tools[0].inputSchema.properties.que_mirar.enum as string[]
      expect(enumOfrecido).toEqual(CUATRO)
      expect(enumOfrecido).not.toContain('anuncios_en_meta')
      expect(enumOfrecido).not.toContain('anuncios_en_google')
      // los anuncios de pago: el propio esquema los rechaza (el modelo ni siquiera puede nombrarlos)
      expect((await pedir(s.client, 'anuncios_en_meta')).rechazadoPorElEsquema).toBe(true)
      for (const q of ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador']) expect((await pedir(s.client, q)).se_pudo, q).toBe(true)
      const quinto = await pedir(s.client, 'instagram')
      expect(quinto.se_pudo).toBe(false)
      expect(quinto.motivo).toMatch(/máximo de 4 pedidos/)
      expect(s.llegaron).toEqual(['instagram_scraper', 'google_maps_scraper', 'website_content_scraper', 'google_serp_scraper'])
    } finally { await s.cerrar() }
  }, 30000)

  it('con límites y los pedidos hechos «todos de una vez» (en paralelo): llegan 4, no 8', async () => {
    const s = await conServidor({ MIRAR_AFUERA_MAX_PEDIDOS: '4', MIRAR_AFUERA_PERMITIDOS: CUATRO.join(',') })
    try {
      const r = await Promise.all(Array.from({ length: 8 }, () => pedir(s.client, 'instagram')))
      expect(r.filter((x) => x.se_pudo === true)).toHaveLength(4)
      expect(s.llegaron).toHaveLength(4)
    } finally { await s.cerrar() }
  }, 30000)
})
