// @ts-nocheck · pruebas de los constructores de n8n: tipan mal a propósito los nodos de código (CI 04-nov)
/**
 * 02-nov · recolector de métricas de Instagram (CC#2 · encargo de métricas de redes). Ejecuta el CÓDIGO REAL de los nodos con una base y un destino falsos.
 * Garantías: nace APAGADO y en ENSAYO · US$ 0 (no llama a Apify ni a modelos) · lo no medido se OMITE (nunca 0) · cada post lleva su AUTOR · solo lecturas de la cuenta PROPIA ·
 * una lectura por día (la última) · un fallo del destino termina en ERROR.
 */
import { describe, it, expect } from 'vitest'
import { construir, N, LEER_Y_MAPEAR, RESUMEN } from '../scripts/ops/oficina-marketing/construir-metricas-instagram.mjs'

const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor as new (...a: string[]) => (...a: any[]) => Promise<any>

const CLIENTE = { id: 'c-1', name: 'Náufrago', config: { apify: { own_handles: { instagram: 'https://www.instagram.com/Naufrago.ec/' } } } }
const otro = { id: 'c-2', name: 'Sin red', config: {} }
const perfil = (o: any = {}) => ({
  id: '111', username: 'naufrago.ec', url: 'https://www.instagram.com/naufrago.ec', followersCount: 1500, followsCount: 80, postsCount: 40,
  latestPosts: [
    { id: 'p1', url: 'https://i/p1', type: 'Video', productType: 'clips', timestamp: '2026-10-30T15:00:00.000Z', ownerUsername: 'naufrago.ec', likesCount: 120, commentsCount: 7, videoViewCount: 900 },
    { id: 'p2', url: 'https://i/p2', type: 'Image', timestamp: '2026-10-29T15:00:00.000Z', ownerUsername: 'otra.cuenta', likesCount: -1, commentsCount: 3 },
  ],
  ...o,
})
const fila = (id: number, created_at: string, respuesta: any, usernames = ['naufrago.ec']) => ({ id, created_at, params: { usernames }, respuesta })

async function leer(filas: any[], params: any = { dry_run: true, dias_atras: 1 }, clientes: any[] = [CLIENTE, otro]) {
  const pedidos: string[] = []
  const ctx = { helpers: { httpRequest: async (o: any) => { pedidos.push(o.url); return o.url.includes('/clients') ? clientes : filas } } }
  const f = new AsyncFunction('$', '$env', LEER_Y_MAPEAR)
  const salida = await f.call(ctx, () => ({ first: () => ({ json: params }) }), { SUPABASE_SERVICE_ROLE_KEY: 'k' })
  return { salida: salida.map((s: any) => s.json), pedidos }
}

describe('recolector de Instagram · estructura', () => {
  const f = construir()
  it('nace apagado y su único gasto es nulo: no llama a Apify ni a modelos', () => {
    expect(f.active).toBe(false)
    const todo = JSON.stringify(f)
    expect(todo).not.toMatch(/api\.apify|run-sdk|anthropic|openai/i)
  })
  it('nace en ensayo: el nodo de parámetros trae dry_run:true', () => {
    const p = f.nodes.find((n: any) => n.name === N.parametros)
    expect(p.parameters.jsCode).toContain('dry_run: true')
  })
  it('todas las conexiones apuntan a nodos que existen y el destino es el endpoint de métricas con la llave interna', () => {
    const nombres = new Set(f.nodes.map((n: any) => n.name))
    for (const [de, c] of Object.entries<any>(f.connections)) { expect(nombres.has(de)).toBe(true); for (const g of c.main) for (const x of g) expect(nombres.has(x.node)).toBe(true) }
    const h = f.nodes.find((n: any) => n.name === N.registrar)
    expect(h.parameters.url).toContain('/api/metricas/registrar')
    expect(JSON.stringify(h.parameters.headerParameters)).toContain('INTERNAL_API_KEY')
  })
})

describe('recolector de Instagram · lectura y mapeo', () => {
  it('arma el cuerpo del contrato: cuenta, posts con autor, fuente publico, dia de Ecuador, y dry_run en ensayo', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil()])])
    expect(salida).toHaveLength(1)
    const c = salida[0].cuerpo
    expect(c).toMatchObject({ client_id: 'c-1', red: 'instagram', fuente: 'publico', dia: '2026-11-02', dry_run: true })
    expect(c.cuenta).toMatchObject({ handle: 'naufrago.ec', seguidores: 1500, siguiendo: 80, publicaciones: 40 })
    expect(c.publicaciones[0]).toMatchObject({ post_externo: 'p1', autor: 'naufrago.ec', me_gusta: 120, comentarios: 7, vistas: 900 })
    expect(c.publicaciones[1].autor).toBe('otra.cuenta')
  })
  it('lo no medido se omite, nunca 0 (me gusta -1 y vistas ausentes no aparecen)', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil()])])
    const p2 = salida[0].cuerpo.publicaciones[1]
    expect('me_gusta' in p2).toBe(false)
    expect('vistas' in p2).toBe(false)
    expect(p2.comentarios).toBe(3)
  })
  it('un día (hora de Ecuador) cuenta una sola lectura: la última; y la noche UTC cae en el día anterior', async () => {
    const { salida } = await leer([
      fila(3, '2026-11-02T03:00:00.000Z', [perfil({ followersCount: 1400 })]),   // 22:00 del 1-nov en Ecuador
      fila(2, '2026-11-01T20:00:00.000Z', [perfil({ followersCount: 1300 })]),   // 15:00 del 1-nov
      fila(1, '2026-10-31T20:00:00.000Z', [perfil({ followersCount: 1200 })]),
    ], { dry_run: true, dias_atras: 5 })
    expect(salida.map((s: any) => [s.dia, s.cuerpo.cuenta.seguidores])).toEqual([['2026-11-01', 1400], ['2026-10-31', 1200]])
  })
  it('ignora la lectura de otras cuentas y no cuenta los competidores como propios', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil({ username: 'rival' })], ['rival'])])
    expect(salida[0].sin_envio).toBe(true)
    expect(salida[0].omitidos.length).toBeGreaterThan(0)
  })
  it('la lectura pedida para otra cuenta no se toma aunque su respuesta traiga el perfil propio', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil()], ['rival'])])
    expect(salida[0].sin_envio).toBe(true)
  })
  it('rellenar historia tiene tope de 60 días', async () => {
    const { pedidos } = await leer([], { dry_run: true, dias_atras: 9999 })
    const q = decodeURIComponent(pedidos.find((u) => u.includes('apify_raw'))!)
    const desde = Date.parse(/created_at=gte\.([^&]+)/.exec(q)![1])
    expect(Date.now() - desde).toBeLessThanOrEqual(60 * 86400000 + 60000)
  })
  it('solo lee ensayo=false de instagram_scraper del cliente con Instagram propio', async () => {
    const { pedidos } = await leer([])
    const q = pedidos.find((u) => u.includes('apify_raw'))!
    expect(q).toContain('apify_function=eq.instagram_scraper')
    expect(q).toContain('ensayo=eq.false')
    expect(q).toContain('client_id=eq.c-1')
    expect(pedidos.filter((u) => u.includes('apify_raw'))).toHaveLength(1)
  })
  it('solo un dry_run:false explícito quita el ensayo del cuerpo', async () => {
    const real = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil()])], { dry_run: false, dias_atras: 1 })
    expect('dry_run' in real.salida[0].cuerpo).toBe(false)
    for (const raro of [undefined, 'false', 0, null]) {
      const r = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil()])], { dry_run: raro, dias_atras: 1 })
      expect(r.salida[0].cuerpo.dry_run).toBe(true)
    }
  })
  it('una lectura con error se declara y no se manda', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [perfil({ error: 'no_items' })])])
    expect(salida[0].sin_envio).toBe(true)
    expect(JSON.stringify(salida[0].omitidos)).toContain('error')
  })
})

describe('recolector de Instagram · cierre', () => {
  const correr = (entradas: any[], previos: any[]) => new AsyncFunction('$', '$input', RESUMEN)(() => ({ all: () => previos.map((json) => ({ json })) }), { all: () => entradas.map((json) => ({ json })) })
  const previo = { cliente: 'Náufrago', dia: '2026-11-02', publicaciones_n: 2, dry_run: true, omitidos: [] }
  it('todo registrado → ok con conteos', async () => {
    const r = await correr([{ statusCode: 200, body: { ok: true } }], [previo])
    expect(r[0].json).toMatchObject({ ok: true, ensayo: true, enviados: 1, publicaciones: 2 })
  })
  it('un rechazo del destino termina en ERROR, no en silencio', async () => {
    await expect(correr([{ statusCode: 401, body: { error: 'x' } }], [previo])).rejects.toThrow(/METRICAS_IG_FALLO/)
    await expect(correr([{ statusCode: 500, body: {} }], [previo])).rejects.toThrow(/METRICAS_IG_FALLO/)
  })
  it('sin nada que enviar termina bien y lo dice', async () => {
    const r = await correr([{ sin_envio: true, dry_run: true, motivo: 'no hay lecturas', omitidos: [] }], [])
    expect(r[0].json).toMatchObject({ ok: true, enviados: 0, sin_envio: 'no hay lecturas' })
  })
})
