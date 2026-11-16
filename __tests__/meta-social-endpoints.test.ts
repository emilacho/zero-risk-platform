/**
 * meta-social-endpoints.test.ts · CC#2 (contrato original) + CC3 16-nov (las cuentas salen de la ficha del cliente + ensayo)
 *
 *   POST /api/meta-social/post/instagram · POST /api/meta-social/post/facebook
 *     - la cuenta sale de `clients.config.redes_oficiales.meta` (nunca de META_IG_BUSINESS_ACCOUNT_ID / META_FB_PAGE_ID)
 *     - sin `dry_run: false` explícito = ENSAYO: solo lecturas a Meta, ningún POST, ninguna fila
 *     - `dry_run: false` publica SOLO si la ficha tiene `publicacion_real: true`
 *     - Facebook publica con el token DE LA PÁGINA (pedido con el token del sistema)
 *
 *   GET /api/meta-social/insights/[post_id]
 *     - métricas por defecto que Meta sí acepta (medidas el 16-nov)
 *     - facebook + ?client_id= → token de la página del cliente
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cuentasMetaDe, decidirModo, idDeMeta } from '../src/lib/clients/cuentas-meta'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

/** fichas de clientes de la base falsa · id → config */
let fichas: Record<string, unknown> = {}
let errorDeBase: { message: string } | null = null
const mockInsertCapture = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (row: Record<string, unknown>) => {
        mockInsertCapture(tabla, row)
        return Promise.resolve({ data: null, error: null })
      },
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => {
            if (tabla !== 'clients' || col !== 'id') throw new Error(`lectura inesperada ${tabla}.${col}`)
            if (errorDeBase) return Promise.resolve({ data: null, error: errorDeBase })
            return Promise.resolve({ data: val in fichas ? { id: val, config: fichas[val] } : null, error: null })
          },
        }),
      }),
    }),
  }),
}))

const SISTEMA = 'tok-sistema'
const PAGINA_TOKEN = 'tok-de-la-pagina'
const PAG = '1525854397268597'
const IG = '17841464538946870'
const ENV_IG = '17841400000000000'
const ENV_PAG = '101000000000000'

type Llamada = { url: string; metodo: string; cuerpo: unknown }
let llamadas: Llamada[] = []
/** respuestas de Meta por defecto; cada prueba puede cambiar una */
let graph: (url: string, metodo: string) => Response | null = () => null

let originalFetch: typeof fetch
function metaFalsa(url: string, init?: RequestInit): Promise<Response> {
  const metodo = (init?.method || 'GET').toUpperCase()
  let cuerpo: unknown = null
  try { cuerpo = init?.body ? JSON.parse(String(init.body)) : null } catch { cuerpo = init?.body ?? null }
  llamadas.push({ url, metodo, cuerpo })
  const propia = graph(url, metodo)
  if (propia) return Promise.resolve(propia)
  const j = (o: unknown, s = 200) => Promise.resolve(new Response(JSON.stringify(o), { status: s }))
  if (metodo === 'GET' && url.includes(`/${PAG}?fields=access_token`)) return j({ id: PAG, access_token: PAGINA_TOKEN, name: 'Náufrago' })
  if (metodo === 'GET' && url.includes(`/${IG}?fields=username`)) return j({ id: IG, username: 'naufrago.ec' })
  if (metodo === 'POST' && url.includes('/media_publish')) return j({ id: 'media-987' })
  if (metodo === 'POST' && url.includes('/media')) return j({ id: 'container-123' })
  if (metodo === 'POST' && url.includes('/photos')) return j({ id: 'photo-1', post_id: 'fb-photo-post-456' })
  if (metodo === 'POST' && url.includes('/feed')) return j({ id: 'fb-post-123' })
  if (metodo === 'GET' && url.includes('/insights')) return j({ data: [] })
  return j({ error: { message: `ruta no simulada ${metodo} ${url}` } }, 400)
}
const posts = () => llamadas.filter((l) => l.metodo === 'POST')

const NAUFRAGO = { redes_oficiales: { meta: { pagina_facebook: PAG, instagram_id: IG } } }
const NAUFRAGO_REAL = { redes_oficiales: { meta: { pagina_facebook: PAG, instagram_id: IG }, publicacion_real: true } }

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockInsertCapture.mockReset()
  fichas = { 'c-ensayo': NAUFRAGO, 'c-real': NAUFRAGO_REAL, 'c-vacio': { apify: { own_handles: { instagram: 'x' } } } }
  errorDeBase = null
  llamadas = []
  graph = () => null
  originalFetch = globalThis.fetch
  globalThis.fetch = metaFalsa as unknown as typeof fetch
  // variables globales VIEJAS apuntando a OTRA cuenta: nada debe usarlas
  vi.stubEnv('META_IG_BUSINESS_ACCOUNT_ID', ENV_IG)
  vi.stubEnv('META_IG_ACCESS_TOKEN', 'tok-ig-viejo')
  vi.stubEnv('META_FB_PAGE_ID', ENV_PAG)
  vi.stubEnv('META_FB_PAGE_ACCESS_TOKEN', 'tok-fb-viejo')
  vi.stubEnv('META_ACCESS_TOKEN', SISTEMA)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

const buildPost = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const buildGet = (path: string) => new Request(`http://localhost:3000${path}`)
const ninguna = (pedazo: string) => expect(llamadas.some((l) => l.url.includes(pedazo))).toBe(false)

// ============================================================================
// Lo puro · lib/clients/cuentas-meta
// ============================================================================

describe('cuentas-meta (puro)', () => {
  it('lee página, Instagram y la publicación real de la ficha', () => {
    expect(cuentasMetaDe(NAUFRAGO_REAL)).toEqual({ pagina_facebook: PAG, instagram_id: IG, publicacion_real: true })
  })
  it('sin bloque, o con basura, no hay cuentas y la publicación real queda apagada', () => {
    expect(cuentasMetaDe(null)).toEqual({ pagina_facebook: null, instagram_id: null, publicacion_real: false })
    expect(cuentasMetaDe({ redes_oficiales: [] })).toEqual({ pagina_facebook: null, instagram_id: null, publicacion_real: false })
    expect(cuentasMetaDe({ redes_oficiales: { meta: { pagina_facebook: 'naufrago', instagram_id: '@naufrago.ec' } } }).pagina_facebook).toBeNull()
  })
  it('publicacion_real solo con true booleano', () => {
    for (const v of ['true', 1, 'sí', {}]) expect(cuentasMetaDe({ redes_oficiales: { publicacion_real: v } }).publicacion_real).toBe(false)
  })
  it('un id de Meta es solo dígitos (acepta número entero seguro y recorta espacios)', () => {
    expect(idDeMeta(' 1525854397268597 ')).toBe(PAG)
    expect(idDeMeta(123456789)).toBe('123456789')
    expect(idDeMeta('1234')).toBeNull()
    expect(idDeMeta('12345a')).toBeNull()
    expect(idDeMeta(1.5)).toBeNull()
  })
  it('decidirModo: solo dry_run === false sale del ensayo, y solo con la publicación real encendida', () => {
    const on = { pagina_facebook: PAG, instagram_id: IG, publicacion_real: true }
    const off = { ...on, publicacion_real: false }
    for (const d of [undefined, null, true, 'false', 0]) expect(decidirModo(d, on)).toEqual({ modo: 'ensayo' })
    expect(decidirModo(false, on)).toEqual({ modo: 'real' })
    expect(decidirModo(false, off)).toEqual({ modo: 'negado', motivo: 'publicacion_real_apagada' })
  })
})

// ============================================================================
// POST /api/meta-social/post/instagram
// ============================================================================

describe('POST /api/meta-social/post/instagram', () => {
  const ruta = '/api/meta-social/post/instagram'
  const imp = () => import('../src/app/api/meta-social/post/instagram/route')

  it('401 sin llave', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo' }))
    expect(res.status).toBe(401)
  })

  it('400 sin image_url', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { caption: 'no image', client_id: 'c-ensayo' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-META-IG-IMAGE-URL')
  })

  it('503 sin META_ACCESS_TOKEN (el token viejo de IG ya no sirve de reemplazo)', async () => {
    vi.stubEnv('META_ACCESS_TOKEN', '')
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('not_configured')
    expect(json.missing).toEqual(['META_ACCESS_TOKEN'])
  })

  it('400 sin client_id · no cae a la variable global', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('client_id required')
    expect(llamadas).toHaveLength(0)
  })

  it('404 si el cliente no existe · 502 si la base falla (no se confunden)', async () => {
    let res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'no-existe' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('cliente_no_existe')
    errorDeBase = { message: 'se cayó' }
    res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('no_se_pudo_leer_la_ficha')
    expect(llamadas).toHaveLength(0)
  })

  it('409 si la ficha no tiene Instagram · aunque la variable global vieja exista', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-vacio', dry_run: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('cliente_sin_instagram')
    expect(llamadas).toHaveLength(0)
  })

  it('ENSAYO por defecto: comprueba la cuenta leyendo y arma los dos pasos, sin POST ni fila', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', caption: 'hola', client_id: 'c-real' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.ensayo).toBe(true)
    expect(json.cuenta).toEqual({ instagram_id: IG, usuario: 'naufrago.ec' })
    expect(json.armado[0]).toEqual({ metodo: 'POST', ruta: `/${IG}/media`, cuerpo: { image_url: 'https://x.com/a.jpg', caption: 'hola' } })
    expect(json.armado[1].ruta).toBe(`/${IG}/media_publish`)
    expect(JSON.stringify(json)).not.toContain(SISTEMA)
    expect(posts()).toHaveLength(0)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain(`/${IG}?fields=username`)
    ninguna(ENV_IG)
    await new Promise((r) => setTimeout(r, 5))
    expect(mockInsertCapture).not.toHaveBeenCalled()
  })

  it('dry_run que no es el booleano false (texto, 0, true) sigue en ensayo', async () => {
    for (const d of ['false', 0, true]) {
      llamadas = []
      const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-real', dry_run: d }))
      expect((await res.json()).ensayo).toBe(true)
      expect(posts()).toHaveLength(0)
    }
  })

  it('ensayo con una cuenta que Meta no deja leer → 502, sin POST', async () => {
    graph = (url) => (url.includes('fields=username') ? new Response(JSON.stringify({ error: { message: 'sin permiso' } }), { status: 400 }) : null)
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo' }))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('sin_acceso_a_instagram')
    expect(json.detail).toBe('sin permiso')
    expect(posts()).toHaveLength(0)
  })

  it('dry_run:false con la publicación real APAGADA en la ficha → 409, sin tocar Meta', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo', dry_run: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('publicacion_real_apagada')
    expect(llamadas).toHaveLength(0)
  })

  it('REAL (dry_run:false + publicación real encendida): contenedor y publicación en la cuenta de la ficha', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', caption: 'hello', client_id: 'c-real', dry_run: false }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ensayo).toBeUndefined()
    expect(json.media_id).toBe('media-987')
    expect(json.creation_id).toBe('container-123')
    expect(json.client_id).toBe('c-real')
    const p = posts()
    expect(p.map((l) => new URL(l.url).pathname)).toEqual([`/v21.0/${IG}/media`, `/v21.0/${IG}/media_publish`])
    expect(p.every((l) => new URL(l.url).searchParams.get('access_token') === SISTEMA)).toBe(true)
    expect(p[0].cuerpo).toEqual({ image_url: 'https://x.com/a.jpg', caption: 'hello' })
    expect(p[1].cuerpo).toEqual({ creation_id: 'container-123' })
    ninguna(ENV_IG)
  })

  it('REAL: el contenedor falla → 502 meta_container_failed', async () => {
    graph = (url, m) => (m === 'POST' ? new Response(JSON.stringify({ error: { message: 'oauth fail' } }), { status: 500 }) : null)
    const res = await (await imp()).POST(buildPost(ruta, { image_url: 'https://x.com/a.jpg', client_id: 'c-real', dry_run: false }))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('meta_container_failed')
    expect(json.stage).toBe('container')
  })

  it('REAL: guarda la fila en agent_invocations', async () => {
    await (await imp()).POST(
      buildPost(ruta, { image_url: 'https://x.com/a.jpg', caption: 'hi', client_id: 'c-real', agent_slug: 'social-publisher', dry_run: false }),
    )
    await new Promise((r) => setTimeout(r, 5))
    expect(mockInsertCapture).toHaveBeenCalled()
    const [tabla, row] = mockInsertCapture.mock.calls[0] as [string, Record<string, unknown>]
    expect(tabla).toBe('agent_invocations')
    expect(row.status).toBe('completed')
    expect(row.agent_id).toBe('social-publisher')
    expect(row.client_id).toBe('c-real')
    expect((row.metadata as Record<string, unknown>).platform).toBe('instagram')
    expect((row.metadata as Record<string, unknown>).source).toBe('api_meta_social_instagram')
  })
})

// ============================================================================
// POST /api/meta-social/post/facebook
// ============================================================================

describe('POST /api/meta-social/post/facebook', () => {
  const ruta = '/api/meta-social/post/facebook'
  const imp = () => import('../src/app/api/meta-social/post/facebook/route')

  it('401 sin llave', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-ensayo' }))
    expect(res.status).toBe(401)
  })

  it('400 sin mensaje ni imagen', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { link_url: 'https://x.com', client_id: 'c-ensayo' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-META-FB-INPUT')
  })

  it('503 sin META_ACCESS_TOKEN (el token viejo de página ya no sirve de reemplazo)', async () => {
    vi.stubEnv('META_ACCESS_TOKEN', '')
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-ensayo' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('not_configured')
    expect(json.missing).toEqual(['META_ACCESS_TOKEN'])
  })

  it('400 sin client_id · no cae a la variable global', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('client_id required')
    expect(llamadas).toHaveLength(0)
  })

  it('404 si el cliente no existe · 502 si la base falla', async () => {
    let res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'no-existe' }))
    expect(res.status).toBe(404)
    errorDeBase = { message: 'se cayó' }
    res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-ensayo' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('no_se_pudo_leer_la_ficha')
    expect(llamadas).toHaveLength(0)
  })

  it('409 si la ficha no tiene página · aunque la variable global vieja exista', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-vacio', dry_run: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('cliente_sin_pagina_facebook')
    expect(llamadas).toHaveLength(0)
  })

  it('ENSAYO por defecto (/feed): pide el token de la página leyendo y arma el post, sin POST ni fila', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hola', link_url: 'https://naufrago.ec', client_id: 'c-real' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ensayo).toBe(true)
    expect(json.cuenta).toEqual({ pagina_facebook: PAG, nombre: 'Náufrago' })
    expect(json.armado).toEqual({ metodo: 'POST', ruta: `/${PAG}/feed`, cuerpo: { message: 'hola', link: 'https://naufrago.ec' } })
    expect(JSON.stringify(json)).not.toContain(PAGINA_TOKEN)
    expect(JSON.stringify(json)).not.toContain(SISTEMA)
    expect(posts()).toHaveLength(0)
    expect(llamadas).toHaveLength(1)
    expect(new URL(llamadas[0].url).searchParams.get('access_token')).toBe(SISTEMA)
    ninguna(ENV_PAG)
    await new Promise((r) => setTimeout(r, 5))
    expect(mockInsertCapture).not.toHaveBeenCalled()
  })

  it('ENSAYO con imagen arma /photos con url y caption', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'pie', image_url: 'https://x.com/a.jpg', client_id: 'c-ensayo' }))
    const json = await res.json()
    expect(json.armado).toEqual({ metodo: 'POST', ruta: `/${PAG}/photos`, cuerpo: { url: 'https://x.com/a.jpg', caption: 'pie' } })
    expect(posts()).toHaveLength(0)
  })

  it('sin acceso a la página → 502 sin_acceso_a_la_pagina, sin POST', async () => {
    graph = (url) => (url.includes('fields=access_token') ? new Response(JSON.stringify({ error: { message: 'no es admin' } }), { status: 400 }) : null)
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-real', dry_run: false }))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('sin_acceso_a_la_pagina')
    expect(json.detail).toBe('no es admin')
    expect(posts()).toHaveLength(0)
  })

  it('dry_run:false con la publicación real APAGADA → 409, sin tocar Meta', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hi', client_id: 'c-ensayo', dry_run: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('publicacion_real_apagada')
    expect(llamadas).toHaveLength(0)
  })

  it('REAL /feed: publica en la página de la ficha con el token DE LA PÁGINA', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'hello world', client_id: 'c-real', dry_run: false }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post_id).toBe('fb-post-123')
    expect(json.endpoint).toBe('feed')
    const p = posts()
    expect(p).toHaveLength(1)
    expect(new URL(p[0].url).pathname).toBe(`/v21.0/${PAG}/feed`)
    expect(new URL(p[0].url).searchParams.get('access_token')).toBe(PAGINA_TOKEN)
    expect(p[0].cuerpo).toEqual({ message: 'hello world' })
    ninguna(ENV_PAG)
  })

  it('REAL /photos con imagen y pie', async () => {
    const res = await (await imp()).POST(buildPost(ruta, { message: 'caption text', image_url: 'https://x.com/a.jpg', client_id: 'c-real', dry_run: false }))
    const json = await res.json()
    expect(json.post_id).toBe('fb-photo-post-456')
    expect(json.endpoint).toBe('photos')
    expect(new URL(posts()[0].url).pathname).toBe(`/v21.0/${PAG}/photos`)
  })

  it('REAL: guarda la fila en agent_invocations', async () => {
    await (await imp()).POST(buildPost(ruta, { message: 'persist test', client_id: 'c-real', dry_run: false }))
    await new Promise((r) => setTimeout(r, 5))
    expect(mockInsertCapture).toHaveBeenCalled()
    const [tabla, row] = mockInsertCapture.mock.calls[0] as [string, Record<string, unknown>]
    expect(tabla).toBe('agent_invocations')
    expect(row.status).toBe('completed')
    expect(row.client_id).toBe('c-real')
    expect((row.metadata as Record<string, unknown>).platform).toBe('facebook')
  })
})

// ============================================================================
// GET /api/meta-social/insights/[post_id]
// ============================================================================

describe('GET /api/meta-social/insights/[post_id]', () => {
  const imp = () => import('../src/app/api/meta-social/insights/[post_id]/route')
  const get = async (path: string, post_id: string) => (await imp()).GET(buildGet(path), { params: Promise.resolve({ post_id }) })

  it('401 sin llave', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    expect((await get('/api/meta-social/insights/123', '123')).status).toBe(401)
  })

  it('400 sin post_id', async () => {
    expect((await get('/api/meta-social/insights/', '')).status).toBe(400)
  })

  it('503 sin ningún token', async () => {
    vi.stubEnv('META_ACCESS_TOKEN', '')
    vi.stubEnv('META_FB_PAGE_ACCESS_TOKEN', '')
    vi.stubEnv('META_IG_ACCESS_TOKEN', '')
    expect((await get('/api/meta-social/insights/123', '123')).status).toBe(503)
  })

  it('200 · aplana los valores y pide las métricas de Facebook que Meta acepta', async () => {
    graph = (url) =>
      url.includes('/insights')
        ? new Response(JSON.stringify({ data: [
            { name: 'post_media_view', period: 'lifetime', values: [{ value: 100 }], title: 'Views' },
            { name: 'post_clicks', period: 'lifetime', values: [{ value: 12 }], title: 'Clicks' },
          ] }), { status: 200 })
        : null
    const res = await get('/api/meta-social/insights/fb-1', 'fb-1')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.platform).toBe('facebook')
    expect(json.insights.post_media_view.value).toBe(100)
    expect(json.insights.post_clicks.value).toBe(12)
    expect(json.metrics_requested).toEqual(['post_media_view', 'post_clicks', 'post_reactions_like_total', 'post_reactions_by_type_total'])
  })

  it('métricas de Instagram por defecto sin las que Meta ya no acepta', async () => {
    const json = await (await get('/api/meta-social/insights/ig-1?platform=instagram', 'ig-1')).json()
    expect(json.metrics_requested).toEqual(['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions'])
    for (const vieja of ['impressions', 'engagement', 'post_impressions', 'post_engaged_users']) expect(json.metrics_requested).not.toContain(vieja)
  })

  it('respeta ?metrics=', async () => {
    const res = await get('/api/meta-social/insights/ig-1?platform=instagram&metrics=reach,saved', 'ig-1')
    const json = await res.json()
    expect(json.platform).toBe('instagram')
    expect(json.metrics_requested).toEqual(['reach', 'saved'])
    expect(llamadas.at(-1)!.url).toContain('metric=reach%2Csaved')
  })

  it('facebook + client_id: lee con el token de la página del cliente', async () => {
    const res = await get(`/api/meta-social/insights/${PAG}_1?client_id=c-ensayo`, `${PAG}_1`)
    expect(res.status).toBe(200)
    expect(llamadas[0].url).toContain(`/${PAG}?fields=access_token`)
    const lectura = llamadas.find((l) => l.url.includes('/insights'))!
    expect(new URL(lectura.url).searchParams.get('access_token')).toBe(PAGINA_TOKEN)
  })

  it('facebook sin client_id: el token del sistema, como antes', async () => {
    await get('/api/meta-social/insights/fb-9', 'fb-9')
    expect(llamadas).toHaveLength(1)
    expect(new URL(llamadas[0].url).searchParams.get('access_token')).toBe(SISTEMA)
  })

  it('instagram + client_id: no busca página (Instagram acepta el token del sistema)', async () => {
    await get('/api/meta-social/insights/ig-2?platform=instagram&client_id=c-ensayo', 'ig-2')
    expect(llamadas).toHaveLength(1)
    expect(new URL(llamadas[0].url).searchParams.get('access_token')).toBe(SISTEMA)
  })

  it('facebook + cliente sin página → 409 · cliente inexistente → 404', async () => {
    let res = await get('/api/meta-social/insights/x?client_id=c-vacio', 'x')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('cliente_sin_pagina_facebook')
    res = await get('/api/meta-social/insights/x?client_id=no-existe', 'x')
    expect(res.status).toBe(404)
    expect(llamadas).toHaveLength(0)
  })

  it('502 cuando Meta devuelve 500', async () => {
    graph = (url) => (url.includes('/insights') ? new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }) : null)
    const res = await get('/api/meta-social/insights/fb-2', 'fb-2')
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('meta_insights_failed')
  })
})
