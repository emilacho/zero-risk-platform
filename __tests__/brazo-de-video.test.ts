/**
 * BRAZO DE VIDEO · fase 2 (31-oct): la fórmula del proveedor, lo aprobado por Emilio, el tope antes de gastar, el envío idempotente y el libro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { costoEstimadoUsd, dimensiones, leerTarifas, tokensDeVideo, cabeceras } from '@/lib/video/higgsfield'
import { armarPedido, cuerpoParaHiggsfield, rutaDelModelo, REGLAS_DEL_PEDIDO, TOPE_POR_VIDEO_USD } from '@/lib/video/parametros'
import { cierreDeFila, filaDeEnvio, FLUJO_DE_VIDEO } from '@/lib/video/libro'

// las descripciones EXACTAS que devolvió /estimate el 31-oct (gratis, con la llave real)
const DESC_25 = 'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. If video inputs are provided, the token rate is multiplied by 0.6: $0.01284 per 1,000 tokens at 480p or 720p and $0.01404 at 1080p. Both input and generated video durations are billable. Billable video tokens = ceil(output height × output width × (input video duration + generated video duration) × 24 / 1024). Image and audio references do not count as video input. Actual pricing depends on output dimensions and billable duration. Rates shown are before any applicable customer discount.'
const DESC_20 = 'Token-metered pricing. Billable video tokens = ceil((input video seconds + generated video seconds) × output width × output height × 24 fps / 1024). Image and audio references do not count as video input. Per 1,000 video tokens: without video input — 480p/720p/1080p $0.014, 4K $0.008; with video input — 480p/720p/1080p $0.0084, 4K $0.0048 (0.6× the standard rate). With video references, both input and generated video durations are billable. Rates shown are before any applicable customer discount.'

describe('la fórmula del proveedor (leída de /estimate)', () => {
  it('lee las tarifas de Seedance 2.5 y 2.0; un texto distinto no se entiende (fallo cerrado)', () => {
    expect(leerTarifas(DESC_25)).toMatchObject({ por_mil_tokens: { '480p': 0.0214, '720p': 0.0214, '1080p': 0.0234 }, con_video_entrada: { '1080p': 0.01404 } })
    expect(leerTarifas(DESC_20)).toMatchObject({ por_mil_tokens: { '1080p': 0.014, '4k': 0.008 }, con_video_entrada: { '720p': 0.0084 } })
    // el tercer formato (2.0 text-to-video, visto el 31-oct)
    expect(leerTarifas('Token-metered pricing. Billable video tokens = ceil(generated video seconds × output width × output height × 24 fps / 1024). Image and audio references do not count as video input. Per 1,000 video tokens: 480p/720p/1080p $0.014, 4K $0.008. Rates shown are before any applicable customer discount.')).toMatchObject({ por_mil_tokens: { '720p': 0.014, '4k': 0.008 } })
    expect(leerTarifas('Pricing changed, see dashboard.')).toBeNull()
  })
  it('dimensiones: el lado corto es la resolución y el largo sale de la relación', () => {
    expect(dimensiones('1080p', '9:16')).toEqual({ ancho: 1080, alto: 1920 })
    expect(dimensiones('720p', '16:9')).toEqual({ ancho: 1280, alto: 720 })
    expect(dimensiones('480p', '16:9')).toEqual({ ancho: 854, alto: 480 })
    expect(dimensiones('2k', '9:16')).toBeNull()
    expect(dimensiones('720p', 'cuadrado')).toBeNull()
  })
  it('reproduce el «roughly $0.2056 / $0.4622 / $1.1372 por segundo» del proveedor para 16:9', () => {
    const t = leerTarifas(DESC_25)!
    expect(costoEstimadoUsd(t, { resolucion: '480p', relacion: '16:9', segundos: 1 })).toBeCloseTo(0.2056, 3)
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '16:9', segundos: 1 })).toBeCloseTo(0.4622, 3)
    expect(costoEstimadoUsd(t, { resolucion: '1080p', relacion: '16:9', segundos: 1 })).toBeCloseTo(1.1372, 3)
  })
  it('los dos videos de la primera prueba (9:16): 8 s a 1080p = US$ 9,10 cada uno; a 720p 3,70; a 480p 1,64 · 2.0 a 720p 2,42', () => {
    const t25 = leerTarifas(DESC_25)!, t20 = leerTarifas(DESC_20)!
    expect(costoEstimadoUsd(t25, { resolucion: '1080p', relacion: '9:16', segundos: 8 })).toBeCloseTo(9.0979, 3)
    expect(costoEstimadoUsd(t25, { resolucion: '720p', relacion: '9:16', segundos: 8 })).toBeCloseTo(3.698, 3)
    expect(costoEstimadoUsd(t25, { resolucion: '480p', relacion: '9:16', segundos: 8 })).toBeCloseTo(1.6445, 3)
    expect(costoEstimadoUsd(t25, { resolucion: '1080p', relacion: '9:16', segundos: 15 })).toBeCloseTo(17.0586, 3)
    expect(costoEstimadoUsd(t20, { resolucion: '720p', relacion: '9:16', segundos: 8 })).toBeCloseTo(2.4192, 3)
    expect(tokensDeVideo(1080, 1920, 8)).toBe(388800)
  })
  it('un video de referencia también se cobra (tarifa ×0,6 sobre entrada + salida)', () => {
    const t = leerTarifas(DESC_25)!
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '9:16', segundos: 8, segundosDeEntrada: 8 })).toBeCloseTo(4.4375, 3)
  })
  it('la llave se manda tal cual en `Authorization: Key <valor>` (la consola ya la entrega como id:secreto)', () => {
    expect(cabeceras('abc:def', { 'Idempotency-Key': 'k' })).toEqual({ Authorization: 'Key abc:def', 'Content-Type': 'application/json', 'Idempotency-Key': 'k' })
  })
})

describe('lo aprobado por Emilio (31-oct) · armarPedido', () => {
  it('por omisión (adenda 4): Seedance 2.5 · 8 s · 720p · 9:16 para reel · audio sí · sin fotos → text-to-video; 1080p sigue admitida', () => {
    const r = armarPedido({ prompt: 'Así servimos un encebollado en Náufrago, de la olla al plato', formato: 'reel' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pedido).toMatchObject({ modelo: 'bytedance/seedance-2.5', segundos: 8, resolucion: '720p', relacion: '9:16', audio: true, fotos: [] })
    expect(rutaDelModelo(r.pedido)).toBe('bytedance/seedance-2.5/text-to-video')
    const c = cuerpoParaHiggsfield(r.pedido)
    expect(c).toMatchObject({ duration: 8, resolution: '720p', aspect_ratio: '9:16', generate_audio: true })
    expect(armarPedido({ prompt: 'Así servimos un encebollado en Náufrago', formato: 'reel', resolucion: '1080p' })).toMatchObject({ ok: true, pedido: { resolucion: '1080p' } })
    expect('image_urls' in c).toBe(false)
    for (const regla of REGLAS_DEL_PEDIDO) expect(String(c.prompt)).toContain(regla)
    expect(String(c.prompt)).toMatch(/Sin voces/)
    expect(String(c.prompt)).toMatch(/Sin rostros de personas reales/)
  })
  it('con fotos propias → reference-to-video con `image_urls` (máximo 9, sin repetidas); video de youtube → 16:9', () => {
    const fotos = Array.from({ length: 12 }, (_, i) => `https://x/f${i % 10}.jpg`)
    const r = armarPedido({ prompt: 'Ceviche en Náufrago: cómo lo montamos', formato: 'video', segundos: 15, fotos })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pedido.fotos).toHaveLength(9)
    expect(r.pedido.relacion).toBe('16:9')
    expect(rutaDelModelo(r.pedido)).toBe('bytedance/seedance-2.5/reference-to-video')
    expect(cuerpoParaHiggsfield(r.pedido).image_urls).toHaveLength(9)
  })
  it('rechaza lo que se sale de lo aprobado: 5 s, 30 s, 4k, modelo ajeno, formato desconocido, foto http', () => {
    const base = { prompt: 'un pedido suficientemente largo', formato: 'reel' }
    expect(armarPedido({ ...base, segundos: 5 })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, segundos: 30 })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, resolucion: '4k' })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, modelo: 'kling/3.0' })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, formato: 'carrusel' })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, fotos: ['http://x/f.jpg'] })).toMatchObject({ ok: false })
    expect(armarPedido({ prompt: 'corto', formato: 'reel' })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, resolucion: '720p', segundos: 12 })).toMatchObject({ ok: true })
  })
  it('el tope aprobado es US$ 5 por video', () => expect(TOPE_POR_VIDEO_USD).toBe(5))
})

describe('el libro', () => {
  it('la fila de envío es `running` con el costo reservado y nunca sin workflow_id; el cierre completado conserva el costo y el fallido lo pone en 0', () => {
    const fila = filaDeEnvio({ requestId: 'r1', clientId: 'c1', agentSlug: null, modelo: 'bytedance/seedance-2.5', ruta: 'bytedance/seedance-2.5/text-to-video', segundos: 8, resolucion: '1080p', relacion: '9:16', conFotos: 0, caller: 'test', costoEstimadoUsd: 9.0979, startedAtMs: 0, claveIdempotente: 'k' })
    expect(fila).toMatchObject({ session_id: 'vid-r1', status: 'running', cost_usd: 9.0979, workflow_id: FLUJO_DE_VIDEO, workflow_execution_id: 'r1', agent_id: 'video-generation', model: 'bytedance/seedance-2.5' })
    expect((fila.metadata as Record<string, unknown>).kind).toBe('video_generation')
    expect(cierreDeFila('completed', { urlCopiada: 'https://b/v.mp4', costoUsd: 9.0979, endedAtMs: 1000 })).toMatchObject({ status: 'completed', cost_usd: 9.0979, exit_code: 0, error_message: null })
    expect(cierreDeFila('nsfw', { error: 'policy', endedAtMs: 1000 })).toMatchObject({ status: 'failed', cost_usd: 0, exit_code: 1, error_message: 'nsfw · policy' })
  })
})

// ───────── la ruta ─────────
const insert = vi.fn(), update = vi.fn(), upload = vi.fn()
const selectRows: { value: unknown[] } = { value: [] }
const db: any = {
  from: vi.fn(() => ({
    insert: (row: unknown) => { insert(row); return Promise.resolve({ error: null }) },
    update: (row: unknown) => ({ eq: () => { update(row); return Promise.resolve({ error: null }) } }),
    select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: selectRows.value, error: null }) }) }),
  })),
  storage: { from: vi.fn(() => ({ upload: (...a: unknown[]) => { upload(...a); return Promise.resolve({ error: null }) }, getPublicUrl: () => ({ data: { publicUrl: 'https://bucket/videos/r1.mp4' } }) })) },
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))
const fetchMock = vi.fn()
const respuesta = (status: number, cuerpo: unknown, h: Record<string, string> = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(h), text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)), arrayBuffer: async () => Buffer.from(String(cuerpo)) })

beforeEach(() => {
  vi.clearAllMocks()
  selectRows.value = []
  process.env.INTERNAL_API_KEY = 'k'
  process.env.HIGGSFIELD_API_KEY_V2 = 'id:secreto'
  process.env.OFICINA_BUCKET = 'oficina-creativos'
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => { delete process.env.HIGGSFIELD_API_KEY_V2; delete process.env.OFICINA_BUCKET })

async function post(body: Record<string, unknown>, llave = 'k') {
  const { POST } = await import('@/app/api/video/generate/route')
  return POST(new Request('http://x/api/video/generate', { method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}
async function get(qs: string, llave = 'k') {
  const { GET } = await import('@/app/api/video/generate/route')
  return GET(new Request(`http://x/api/video/generate?${qs}`, { headers: { 'x-api-key': llave } }))
}
const llamadas = () => fetchMock.mock.calls.map((c) => ({ url: String(c[0]), init: c[1] as RequestInit | undefined }))
const PEDIDO = { prompt: 'Así servimos un encebollado en Náufrago, de la olla al plato', formato: 'reel', client_id: 'c1', clave: 'enc1:fila1:v1', workflow_id: 'wf-0', workflow_execution_id: 'ex-0' }

describe('POST /api/video/generate', () => {
  it('sin llave interna → 401 y ninguna llamada al proveedor', async () => {
    expect((await post(PEDIDO, 'mala')).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('pedido fuera de lo aprobado → 400 sin llamar al proveedor', async () => {
    const r = await post({ ...PEDIDO, segundos: 30 })
    expect(r.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sin la credencial del proveedor → 500 y nada sale', async () => {
    delete process.env.HIGGSFIELD_API_KEY_V2
    expect((await post(PEDIDO)).status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('1080p 8 s cuesta US$ 9,10 > tope 5 → 409 SIN enviar (solo la estimación gratis)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }, { 'x-correlation-id': 'c-1' }))
    const r = await post({ ...PEDIDO, resolucion: '1080p' })
    const j = await r.json()
    expect(r.status).toBe(409)
    expect(j.error).toBe('tope_por_video')
    expect(j.costo_lista_usd).toBeCloseTo(9.0979, 3)
    expect(j.costo_estimado_usd).toBeCloseTo(6.3685, 3) // con el 30 % vigente sigue fuera del tope
    expect(llamadas()).toHaveLength(1)
    expect(llamadas()[0].url).toBe('https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video')
    expect((llamadas()[0].init!.headers as Record<string, string>).Authorization).toBe('Key id:secreto')
    expect(insert).not.toHaveBeenCalled()
  })
  it('si la estimación no se entiende → 502 sin gastar (fallo cerrado)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: 'new pricing, see console' }))
    const r = await post({ ...PEDIDO, resolucion: '480p' })
    expect(r.status).toBe(502)
    expect(llamadas()).toHaveLength(1)
  })
  it('dry_run: estima (gratis), respeta el tope y NO envía ni anota', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
    const j = await (await post({ ...PEDIDO, resolucion: '480p', dry_run: true })).json()
    expect(j).toMatchObject({ ok: true, dry_run: true, status: 'simulado', ruta: 'bytedance/seedance-2.5/text-to-video', descuento_pct: 0.3 })
    expect(j.costo_lista_usd).toBeCloseTo(1.6445, 3)
    expect(j.costo_estimado_usd).toBeCloseTo(1.1512, 3)
    expect(llamadas()).toHaveLength(1)
    expect(insert).not.toHaveBeenCalled()
  })
  it('480p 8 s (US$ 1,64) → estima, envía con Idempotency-Key = clave y anota `running` con el costo reservado', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
      .mockResolvedValueOnce(respuesta(200, { status: 'queued', request_id: 'r1', status_url: 'https://api.higgsfield.ai/requests/r1/status', cancel_url: 'https://api.higgsfield.ai/requests/r1/cancel' }, { 'x-correlation-id': 'c-2' }))
    const r = await post({ ...PEDIDO, resolucion: '480p', fotos: ['https://fotos/1.jpg'], workflow_id: 'wf-1', workflow_execution_id: 'ex-1' })
    const j = await r.json()
    expect(r.status).toBe(202)
    expect(j).toMatchObject({ ok: true, request_id: 'r1', status: 'queued', libro: 'anotado', ruta: 'bytedance/seedance-2.5/reference-to-video', fotos: 1 })
    const [est, env] = llamadas()
    expect(est.url).toBe('https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/reference-to-video')
    expect(env.url).toBe('https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video')
    expect((env.init!.headers as Record<string, string>)['Idempotency-Key']).toBe('enc1:fila1:v1')
    expect(JSON.parse(String(est.init!.body))).toEqual(JSON.parse(String(env.init!.body))) // se estima EXACTAMENTE lo que se envía
    expect(JSON.parse(String(env.init!.body))).toMatchObject({ duration: 8, resolution: '480p', aspect_ratio: '9:16', generate_audio: true, image_urls: ['https://fotos/1.jpg'] })
    expect(insert.mock.calls[0][0]).toMatchObject({ session_id: 'vid-r1', status: 'running', client_id: 'c1', workflow_id: 'wf-1', workflow_execution_id: 'ex-1' })
    expect(insert.mock.calls[0][0].cost_usd).toBeCloseTo(1.1512, 3) // se reserva lo que de verdad se cobra (30 % vigente)
  })
  it('la prueba elegida (opción B): 720p · 8 s por omisión → estima US$ 3,70, cabe en el tope y se envía', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
      .mockResolvedValueOnce(respuesta(200, { status: 'queued', request_id: 'r2', status_url: 'https://api.higgsfield.ai/requests/r2/status' }))
    const j = await (await post(PEDIDO)).json()
    expect(j).toMatchObject({ ok: true, request_id: 'r2', resolucion: '720p', segundos: 8, descuento_pct: 0.3 })
    expect(j.costo_lista_usd).toBeCloseTo(3.698, 3)
    expect(j.costo_estimado_usd).toBeCloseTo(2.5885, 3) // = el cargo real medido el 31-oct (US$ 2,59)
  })
  it('el proveedor responde 429 (fila llena, sin cobro) → 429 y nada en el libro', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 })).mockResolvedValueOnce(respuesta(429, { error: 'queue full', limit: 40 }, { 'retry-after': '30' }))
    expect((await post({ ...PEDIDO, resolucion: '480p' })).status).toBe(429)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('GET /api/video/generate', () => {
  it('en curso → terminal:false sin tocar el libro', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { status: 'in_progress', request_id: 'r1' }))
    const j = await (await get('request_id=r1')).json()
    expect(j).toMatchObject({ status: 'in_progress', terminal: false })
    expect(update).not.toHaveBeenCalled()
  })
  it('completado → descarga, copia al bucket como video/mp4, cierra la fila con el costo reservado y devuelve nuestra URL', async () => {
    selectRows.value = [{ cost_usd: 1.6445, client_id: 'c1' }]
    fetchMock
      .mockResolvedValueOnce(respuesta(200, { status: 'completed', request_id: 'r1', video: { url: 'https://cdn.higgsfield/r1.mp4' }, expires_at: '2026-11-07T00:00:00Z' }))
      .mockResolvedValueOnce(respuesta(200, 'MP4BYTES'))
    const j = await (await get('request_id=r1')).json()
    expect(j).toMatchObject({ status: 'completed', terminal: true, cobrado: true, costo_usd: 1.6445, video_url: 'https://bucket/videos/r1.mp4', url_proveedor: 'https://cdn.higgsfield/r1.mp4', copia: 'bucket' })
    expect(upload.mock.calls[0][0]).toBe('videos/r1.mp4')
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'video/mp4' })
    expect(update.mock.calls[0][0]).toMatchObject({ status: 'completed', cost_usd: 1.6445 })
  })
  it('nsfw/failed → cierra con costo 0 y no descarga nada', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { status: 'nsfw', request_id: 'r1', error: 'content policy' }))
    const j = await (await get('request_id=r1')).json()
    expect(j).toMatchObject({ status: 'nsfw', terminal: true, cobrado: false })
    expect(update.mock.calls[0][0]).toMatchObject({ status: 'failed', cost_usd: 0 })
    expect(upload).not.toHaveBeenCalled()
  })
  it('sin bucket configurado → devuelve solo la URL del proveedor con aviso (no falla)', async () => {
    delete process.env.OFICINA_BUCKET
    fetchMock.mockResolvedValueOnce(respuesta(200, { status: 'completed', request_id: 'r1', video: { url: 'https://cdn/r1.mp4' } }))
    const j = await (await get('request_id=r1')).json()
    expect(j).toMatchObject({ status: 'completed', copia: 'solo_proveedor', video_url: 'https://cdn/r1.mp4' })
    expect(j.aviso).toMatch(/OFICINA_BUCKET/)
  })
})

// ───────── certificación CC3 (31-oct): 2 condiciones + 2 mutantes vivos ─────────
describe('condición 1 · la llave solo viaja al proveedor y solo se descarga de destinos públicos', () => {
  it('destinoPublico: https público sí; http, IP privada, metadatos de nube, bucle local, IPv6 y nombres internos no', async () => {
    const { destinoPublico } = await import('@/lib/video/destino')
    expect(destinoPublico('https://cdn.higgsfield.ai/r1.mp4')).toBeNull()
    expect(destinoPublico('http://cdn.higgsfield.ai/r1.mp4')).toMatch(/https/)
    expect(destinoPublico('https://169.254.169.254/latest/meta-data')).toMatch(/privada|reservada/)
    expect(destinoPublico('https://10.0.0.1/x')).toMatch(/privada/)
    expect(destinoPublico('https://172.20.1.1/x')).toMatch(/privada/)
    expect(destinoPublico('https://192.168.1.1/x')).toMatch(/privada/)
    expect(destinoPublico('https://127.0.0.1/x')).toMatch(/privada/)
    expect(destinoPublico('https://localhost/x')).toMatch(/interno/)
    expect(destinoPublico('https://db.internal/x')).toMatch(/interno/)
    expect(destinoPublico('https://[::1]/x')).toMatch(/IPv6/)
    expect(destinoPublico('https://2130706433/x')).toMatch(/numérico|privada/) // Node ya lo normaliza a 127.0.0.1
    expect(destinoPublico('no-es-url')).toMatch(/válida/)
  })
  it('GET ignora `status_url` del llamador: la llave solo va a api.higgsfield.ai', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { status: 'in_progress', request_id: 'r1' }))
    const j = await (await get('request_id=r1&status_url=https%3A%2F%2Fevil.example%2Fcaptura')).json()
    expect(j).toMatchObject({ status: 'in_progress', terminal: false })
    expect(llamadas()).toHaveLength(1)
    expect(llamadas()[0].url).toBe('https://api.higgsfield.ai/requests/r1/status')
    expect(llamadas().some((c) => c.url.includes('evil'))).toBe(false)
  })
  it('GET con request_id que no es un identificador (ruta, barras, espacios) → 400 sin llamar a nadie', async () => {
    expect((await get('request_id=..%2Fotra%2Fcosa')).status).toBe(400)
    expect((await get('request_id=r1%20x')).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('completado con video.url hacia metadatos de nube → NO se descarga, no se sube nada y se declara', async () => {
    selectRows.value = [{ cost_usd: 1.6445, client_id: 'c1' }]
    fetchMock.mockResolvedValueOnce(respuesta(200, { status: 'completed', request_id: 'r1', video: { url: 'http://169.254.169.254/latest/meta-data' } }))
    const j = await (await get('request_id=r1')).json()
    expect(llamadas()).toHaveLength(1) // solo el estado; ninguna descarga
    expect(upload).not.toHaveBeenCalled()
    expect(j).toMatchObject({ status: 'completed', copia: 'solo_proveedor' })
    expect(j.aviso).toMatch(/no se descarga/)
  })
})

describe('condición 2 · sin clave y sin contexto de flujo no se envía nada', () => {
  it('sin `clave` → 400 y ninguna llamada al proveedor (un reintento sin clave cobraría dos veces)', async () => {
    const { clave: _c, ...sinClave } = PEDIDO
    void _c
    const r = await post(sinClave)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('falta_clave')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
  it('sin `workflow_id` o sin `workflow_execution_id` → 400 y nada sale', async () => {
    const { workflow_id: _w, ...sinFlujo } = PEDIDO
    void _w
    expect((await post(sinFlujo)).status).toBe(400)
    const { workflow_execution_id: _e, ...sinEjecucion } = PEDIDO
    void _e
    const r = await post(sinEjecucion)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('falta_contexto_de_flujo')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mutantes vivos de CC3 (a, b)', () => {
  it('(a) `tope_usd` del pedido NO puede subir el tope aprobado: 1080p con tope_usd 50 sigue siendo 409 y el tope aplicado es 5', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
    const r = await post({ ...PEDIDO, resolucion: '1080p', tope_usd: 50 })
    const j = await r.json()
    expect(r.status).toBe(409)
    expect(j.tope_usd).toBe(5)
    expect(llamadas()).toHaveLength(1)
  })
  it('(b) GET sin llave interna → 401 y ninguna llamada al proveedor', async () => {
    expect((await get('request_id=r1', 'mala')).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('el descuento vigente del proveedor (medido 31-oct: lista 3,70 → cargo 2,59 = 30 %)', () => {
  it('conDescuento: 30 % mientras rija y para los modelos de la promoción; después de la fecha, o con otro modelo, vuelve la lista', async () => {
    const { conDescuento, DESCUENTO_VIGENTE } = await import('@/lib/video/parametros')
    const antes = Date.parse(DESCUENTO_VIGENTE.hasta) - 1000
    const despues = Date.parse(DESCUENTO_VIGENTE.hasta) + 1000
    expect(conDescuento(3.6979, 'bytedance/seedance-2.5', antes)).toEqual({ usd: 2.5885, pct: 0.3 })
    expect(conDescuento(3.6979, 'bytedance/seedance-2.5', despues)).toEqual({ usd: 3.6979, pct: 0 })
    expect(conDescuento(3.6979, 'otro/modelo', antes)).toEqual({ usd: 3.6979, pct: 0 })
  })
  it('D6 (CC3): el tope se compara con el costo CON descuento, no con la lista: 720p 12 s = lista 5,55 > 5 pero 3,88 con el 30 % → se envía y se reserva 3,88', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
      .mockResolvedValueOnce(respuesta(200, { status: 'queued', request_id: 'r12', status_url: 'https://api.higgsfield.ai/requests/r12/status' }))
    const r = await post({ ...PEDIDO, segundos: 12 })
    const j = await r.json()
    expect(r.status).toBe(202)
    expect(j.costo_lista_usd).toBeCloseTo(5.5469, 3)
    expect(j.costo_estimado_usd).toBeCloseTo(3.8828, 3)
    expect(j.tope_usd).toBe(5)
    expect(llamadas()).toHaveLength(2) // estimación + envío
    expect(insert.mock.calls[0][0].cost_usd).toBeCloseTo(3.8828, 3)
  })
  it('pasada la fecha del descuento, la ruta vuelve a reservar la lista (720p 8 s = US$ 3,70)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-12-01T00:00:00Z'))
      fetchMock.mockResolvedValueOnce(respuesta(200, { type: 'description', pricing_description: DESC_25 }))
      const j = await (await post({ ...PEDIDO, dry_run: true })).json()
      expect(j.descuento_pct).toBe(0)
      expect(j.costo_estimado_usd).toBeCloseTo(3.698, 3)
      expect(j.costo_lista_usd).toBeCloseTo(3.698, 3)
    } finally { vi.useRealTimers() }
  })
})
