/**
 * PASO 4 · las piezas de `etiquetar`: la bajada de la foto (solo de nuestro almacén), la escritura (solo las 4 columnas) y la llamada real al modelo con imagen
 * (con `fetch` SIMULADO: no sale ninguna petición de verdad). Pruebas escritas ANTES del código.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAXIMO_DE_BYTES_DE_FOTO, PREFIJO_DEL_ALMACEN, crearBajador, esUrlDelAlmacen } from '../almacen'
import { COLUMNAS_QUE_ESCRIBE, crearEscritor } from '../etiqueta-escritura'
import { llamarAlModeloConImagen, type PeticionConImagen } from '../modelo'
import { SinLlave } from '../razonar'

const BASE = 'https://zero.supabase.co'
const OK = `${BASE}${PREFIJO_DEL_ALMACEN}c1/f1.jpg`

describe('esUrlDelAlmacen · lista cerrada de UN anfitrión y UNA carpeta', () => {
  it('acepta solo https, el anfitrión de la base y la carpeta pública de client-social-images', () => {
    expect(PREFIJO_DEL_ALMACEN).toBe('/storage/v1/object/public/client-social-images/')
    expect(esUrlDelAlmacen(OK, BASE)).toBe(true)
    expect(esUrlDelAlmacen(OK, `${BASE}/`)).toBe(true)
    expect(esUrlDelAlmacen(`${BASE}${PREFIJO_DEL_ALMACEN}a/b/c.png?x=1`, BASE)).toBe(true)
  })
  it.each([
    'https://scontent.cdninstagram.com/x.jpg',
    'https://zero.supabase.co.evil.example/storage/v1/object/public/client-social-images/a.jpg',
    'https://evil.example/zero.supabase.co/storage/v1/object/public/client-social-images/a.jpg',
    'https://zero.supabase.co:8443/storage/v1/object/public/client-social-images/a.jpg',
    'http://zero.supabase.co/storage/v1/object/public/client-social-images/a.jpg',
    'https://zero.supabase.co/storage/v1/object/public/agent-images/a.jpg',
    'https://zero.supabase.co/storage/v1/object/sign/client-social-images/a.jpg',
    'https://zero.supabase.co/storage/v1/object/public/client-social-images',
    'https://user:pass@zero.supabase.co/storage/v1/object/public/client-social-images/a.jpg',
    'https://zero.supabase.co/storage/v1/object/public/client-social-images/../agent-images/a.jpg',
    'https://zero.supabase.co/storage/v1/object/public/client-social-images/%2e%2e/agent-images/a.jpg',
    'https://zero.supabase.co//storage/v1/object/public/client-social-images/a.jpg',
    'file:///etc/passwd', 'javascript:alert(1)', '', 'no es una url',
  ])('rechaza %s', (u) => { expect(esUrlDelAlmacen(u, BASE)).toBe(false) })
  it('si la base no está configurada, NADA es del almacén', () => {
    expect(esUrlDelAlmacen(OK, '')).toBe(false)
    expect(esUrlDelAlmacen(OK, 'no es una url')).toBe(false)
  })
})

describe('crearBajador · baja la foto con tope de tamaño, de tiempo, sin seguir saltos y solo si es una imagen', () => {
  const respuesta = (cuerpo: Uint8Array | string, init: ResponseInit & { url?: string } = {}) => new Response(cuerpo as BodyInit, { status: 200, headers: { 'content-type': 'image/jpeg' }, ...init })
  it('una foto del almacén: devuelve sus bytes en base64, su tipo y su tamaño; usa GET, sin seguir saltos', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => respuesta(new Uint8Array([65, 66, 67])))
    const r = await crearBajador({ urlDeLaBase: BASE, fetchImpl: f })(OK)
    expect(r).toEqual({ ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 })
    expect(f).toHaveBeenCalledTimes(1)
    const [u, init] = f.mock.calls[0] as [string, RequestInit]
    expect(u).toBe(OK)
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeDefined()
    expect(init.headers).toBeUndefined()
  })
  it('una dirección que NO es del almacén no sale a la red', async () => {
    const f = vi.fn()
    const r = await crearBajador({ urlDeLaBase: BASE, fetchImpl: f })('https://scontent.cdninstagram.com/x.jpg')
    expect(r).toEqual({ ok: false, motivo: 'foto_fuera_del_almacen' })
    expect(f).not.toHaveBeenCalled()
  })
  it.each([
    ['no es una imagen', () => respuesta('hola', { headers: { 'content-type': 'text/html' } }), 'foto_no_es_imagen'],
    ['un tipo de imagen que el modelo no acepta', () => respuesta(new Uint8Array([1]), { headers: { 'content-type': 'image/svg+xml' } }), 'foto_no_es_imagen'],
    ['responde 404', () => respuesta('x', { status: 404 }), 'no_se_pudo_bajar'],
    ['responde 500', () => respuesta('x', { status: 500 }), 'no_se_pudo_bajar'],
    ['es un salto (302)', () => respuesta('x', { status: 302, headers: { location: 'https://evil.example/x.jpg' } }), 'no_se_pudo_bajar'],
    ['declara un tamaño de más', () => respuesta(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg', 'content-length': String(MAXIMO_DE_BYTES_DE_FOTO + 1) } }), 'foto_demasiado_grande'],
    ['trae más bytes de los que declara', () => respuesta(new Uint8Array(MAXIMO_DE_BYTES_DE_FOTO + 1)), 'foto_demasiado_grande'],
    ['viene vacía', () => respuesta(new Uint8Array(0)), 'foto_vacia'],
  ])('%s → %s, sin devolver bytes', async (_n, hace, motivo) => {
    const r = await crearBajador({ urlDeLaBase: BASE, fetchImpl: async () => hace() })(OK)
    expect(r).toMatchObject({ ok: false, motivo })
    expect(r).not.toHaveProperty('base64')
  })
  it('una caída de red o un tiempo agotado se dicen (nunca revientan) y el tope de tamaño está declarado en 5 MB', async () => {
    expect(MAXIMO_DE_BYTES_DE_FOTO).toBe(5_000_000)
    expect(await crearBajador({ urlDeLaBase: BASE, fetchImpl: async () => { throw new Error('sin red') } })(OK)).toMatchObject({ ok: false, motivo: 'no_se_pudo_bajar' })
    expect(await crearBajador({ urlDeLaBase: BASE, fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'AbortError' }) } })(OK)).toMatchObject({ ok: false, motivo: 'tiempo_al_bajar' })
  })
  it('el límite de tiempo SE HACE CUMPLIR: vencido el plazo se corta con AbortError', async () => {
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_ok, no) => {
      init?.signal?.addEventListener('abort', () => no(Object.assign(new Error('abortado'), { name: 'AbortError' })))
    }))
    const r = await crearBajador({ urlDeLaBase: BASE, fetchImpl: f, timeoutMs: 30 })(OK)
    expect(r).toMatchObject({ ok: false, motivo: 'tiempo_al_bajar' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('crearEscritor · UPDATE de las 4 columnas de etiqueta, filtrado por la foto Y el cliente', () => {
  const valores = { que_muestra: 'un plato', producto_visto: ['Servicio uno'], etiquetada_en: '2026-10-07T00:00:00.000Z', etiqueta_modelo: 'claude-sonnet-5-5' }
  it('hace UN PATCH a la tabla con el filtro de la foto y del cliente, con la llave de servicio, y solo con esas 4 columnas', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(null, { status: 204 }))
    const r = await crearEscritor({ urlDeLaBase: BASE, llave: 'llave-servicio', fetchImpl: f })({ foto_id: 'f-1', cliente: 'c-1', valores })
    expect(r).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(1)
    const [u, init] = f.mock.calls[0] as [string, RequestInit]
    expect(u).toBe(`${BASE}/rest/v1/client_social_images?id=eq.f-1&client_id=eq.c-1`)
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>).apikey).toBe('llave-servicio')
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual([...COLUMNAS_QUE_ESCRIBE].sort())
  })
  it('las columnas son EXACTAMENTE las 4 y nada más', () => {
    expect([...COLUMNAS_QUE_ESCRIBE].sort()).toEqual(['etiqueta_modelo', 'etiquetada_en', 'producto_visto', 'que_muestra'])
  })
  it('se NIEGA a escribir cualquier otra columna (producto, url, caption, estado…): no sale ninguna petición', async () => {
    const f = vi.fn()
    const escribir = crearEscritor({ urlDeLaBase: BASE, llave: 'k', fetchImpl: f })
    for (const extra of ['producto', 'url', 'caption', 'estado', 'client_id', 'id', 'hash_archivo']) {
      const r = await escribir({ foto_id: 'f', cliente: 'c', valores: { ...valores, [extra]: 'x' } as never })
      expect(r.ok, extra).toBe(false)
      expect(r.detalle, extra).toMatch(/columna/)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('se NIEGA sin el id de la foto o sin el cliente (nunca un PATCH sin filtro de dos llaves) o con caracteres que rompan el filtro', async () => {
    const f = vi.fn()
    const escribir = crearEscritor({ urlDeLaBase: BASE, llave: 'k', fetchImpl: f })
    for (const a of [{ foto_id: '', cliente: 'c' }, { foto_id: 'f', cliente: '' }, { foto_id: 'f&id=neq.0', cliente: 'c' }, { foto_id: 'f', cliente: 'c,or=(id.neq.0)' }, { foto_id: 'f)', cliente: 'c' }]) {
      expect((await escribir({ ...a, valores })).ok, JSON.stringify(a)).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('un estado de error o una caída de red vuelve como {ok:false} con su motivo; nunca reintenta ni revienta', async () => {
    const f = vi.fn(async () => new Response('permiso denegado', { status: 403 }))
    const r = await crearEscritor({ urlDeLaBase: BASE, llave: 'k', fetchImpl: f })({ foto_id: 'f', cliente: 'c', valores })
    expect(r).toMatchObject({ ok: false })
    expect(r.detalle).toMatch(/403/)
    expect(f).toHaveBeenCalledTimes(1)
    expect(await crearEscritor({ urlDeLaBase: BASE, llave: 'k', fetchImpl: async () => { throw new Error('sin red') } })({ foto_id: 'f', cliente: 'c', valores })).toEqual({ ok: false, detalle: 'sin red' })
  })
  it('sin llave de servicio configurada no sale ninguna petición', async () => {
    const f = vi.fn()
    expect((await crearEscritor({ urlDeLaBase: BASE, llave: '', fetchImpl: f })({ foto_id: 'f', cliente: 'c', valores })).ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('llamarAlModeloConImagen · UNA petición con la foto en base64, sin reintentos, con la llave que ya existe', () => {
  const original = process.env.CLAUDE_API_KEY
  beforeEach(() => { process.env.CLAUDE_API_KEY = 'llave-secreta-de-prueba' })
  afterEach(() => { vi.unstubAllGlobals(); if (original === undefined) delete process.env.CLAUDE_API_KEY; else process.env.CLAUDE_API_KEY = original })
  const peticion = (timeoutMs = 25_000): PeticionConImagen => ({
    model: 'claude-sonnet-5-5', max_tokens: 600, thinking: { type: 'between_tools' }, system: 'instrucción', texto: 'leyenda y productos', imagen: { tipo: 'image/jpeg', base64: 'QUJD' }, timeoutMs,
  })
  it('manda la imagen como un bloque `image` en base64 junto al texto, al destino único, sin temperatura', async () => {
    const f = vi.fn(async (_u: unknown, _i?: RequestInit) => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"que_muestra":"x"}' }], stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 200 } }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const r = await llamarAlModeloConImagen(peticion())
    expect(r).toEqual({ texto: '{"que_muestra":"x"}', stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 200 } })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('llave-secreta-de-prueba')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo).toEqual({
      model: 'claude-sonnet-5-5', max_tokens: 600, thinking: { type: 'between_tools' }, system: 'instrucción',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'leyenda y productos' }] }],
    })
    expect(cuerpo).not.toHaveProperty('temperature')
  })
  it('sin llave: SinLlave y no sale ninguna petición; un error del modelo se informa sin reintentar y SIN mostrar la llave', async () => {
    delete process.env.CLAUDE_API_KEY
    const f0 = vi.fn()
    vi.stubGlobal('fetch', f0)
    await expect(llamarAlModeloConImagen(peticion())).rejects.toBeInstanceOf(SinLlave)
    expect(f0).not.toHaveBeenCalled()
    process.env.CLAUDE_API_KEY = 'llave-secreta-de-prueba'
    const f = vi.fn(async () => new Response('{"error":"sobrecargado"}', { status: 529 }))
    vi.stubGlobal('fetch', f)
    const e = await llamarAlModeloConImagen(peticion()).catch((x: Error) => x)
    expect((e as Error).message).toMatch(/529/)
    expect((e as Error).message).not.toContain('llave-secreta-de-prueba')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('el límite de tiempo se hace cumplir (AbortError) y no hay segunda petición', async () => {
    const f = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_ok, no) => {
      expect(init?.signal).toBeDefined()
      init?.signal?.addEventListener('abort', () => no(Object.assign(new Error('abortado'), { name: 'AbortError' })))
    }))
    vi.stubGlobal('fetch', f)
    await expect(llamarAlModeloConImagen(peticion(30))).rejects.toMatchObject({ name: 'AbortError' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
