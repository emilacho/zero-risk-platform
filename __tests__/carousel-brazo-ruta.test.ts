/**
 * RUTA /api/carousel/generate · `subcarpeta`, extras de lámina y tipografías en la respuesta (pruebas permanentes).
 * Sin red, sin bucket, sin base: el almacenamiento es un cliente FALSO que anota cada subida y el render está sustituido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const subidas: Array<{ path: string; opts: Record<string, unknown>; bucket: string }> = []
let renderLlamado: Array<{ slides: Array<Record<string, unknown>> }> = []

vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _png: Buffer, opts: Record<string, unknown>) => { subidas.push({ path, opts, bucket }); return { error: null } },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://bucket.test/${path}` } }),
      }),
    },
  }),
}))
vi.mock('../packages/carousel-engine/src', async (orig) => {
  const real = await orig<typeof import('../packages/carousel-engine/src')>()
  return {
    ...real,
    renderCarousel: async (a: { slides: Array<Record<string, unknown>> }) => {
      renderLlamado.push(a)
      return a.slides.map((_s, i) => ({ platform: 'instagram-feed', slide_index: i + 1, total_slides: a.slides.length, width: 1080, height: 1350, png: Buffer.from('png'), durationMs: 1, fonts_usadas: ['Inter'], fonts_faltantes: ['Caveat'] }))
    },
  }
})

import { POST } from '../src/app/api/carousel/generate/route'
import { bucketDeLaRuta } from '../src/lib/carousel-ruta'

const cuerpo = (extra: Record<string, unknown> = {}, slide: Record<string, unknown> = {}) => ({
  client_slug: 'cliente-demo',
  platform: 'instagram-feed',
  date: '2026-10-10',
  brand: { colors: { primary: '#123456' }, fonts: { family: 'Inter' } },
  slides: [{ headline: 'Uno', ...slide }, { headline: 'Dos' }],
  ...extra,
})
const llamar = (b: unknown) => POST(new Request('http://x/api/carousel/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(b) }))

beforeEach(() => { subidas.length = 0; renderLlamado = []; process.env.OFICINA_BUCKET = 'oficina-test' })

// ── frontera: el bucket `client-websites` es de la web del cliente; la oficina escribe en el suyo
describe('bucketDeLaRuta (función pura)', () => {
  it('sin subcarpeta: el bucket de siempre, aunque exista OFICINA_BUCKET', () => {
    expect(bucketDeLaRuta(undefined, {})).toEqual({ ok: true, bucket: 'client-websites' })
    expect(bucketDeLaRuta(undefined, { OFICINA_BUCKET: 'x' })).toEqual({ ok: true, bucket: 'client-websites' })
  })
  it('con subcarpeta: OFICINA_BUCKET, sin valor por omisión', () => {
    expect(bucketDeLaRuta('oficina/e1', { OFICINA_BUCKET: 'bucket-oficina' })).toEqual({ ok: true, bucket: 'bucket-oficina' })
    for (const env of [{}, { OFICINA_BUCKET: '' }, { OFICINA_BUCKET: '   ' }]) {
      expect(bucketDeLaRuta('oficina/e1', env)).toEqual({ ok: false, error: 'oficina_bucket_not_configured' })
    }
  })
})

describe('la ruta y el bucket', () => {
  it('con subcarpeta sube al OFICINA_BUCKET, nunca a client-websites', async () => {
    await llamar(cuerpo({ subcarpeta: 'oficina/e1' }))
    expect(subidas.length).toBe(2)
    expect(subidas.every((s) => s.bucket === 'oficina-test')).toBe(true)
  })
  it('con subcarpeta y sin OFICINA_BUCKET: 500 oficina_bucket_not_configured ANTES de renderizar o subir', async () => {
    delete process.env.OFICINA_BUCKET
    const r = await llamar(cuerpo({ subcarpeta: 'oficina/e1' }))
    expect(r.status).toBe(500)
    expect((await r.json()).error).toBe('oficina_bucket_not_configured')
    expect(renderLlamado.length).toBe(0)
    expect(subidas.length).toBe(0)
  })
  it('sin subcarpeta: client-websites y ruta de hoy, con o sin OFICINA_BUCKET', async () => {
    delete process.env.OFICINA_BUCKET
    const r = await llamar(cuerpo())
    expect(r.status).toBe(200)
    expect(subidas.every((s) => s.bucket === 'client-websites')).toBe(true)
    expect(subidas[0].path).toBe('cliente-demo/carousels/2026-10-10/slide-1.png')
  })
})

describe('ruta de guardado', () => {
  it('SIN subcarpeta: la ruta de siempre (compatibilidad)', async () => {
    const r = await llamar(cuerpo())
    expect(r.status).toBe(200)
    expect(subidas.map((s) => s.path)).toEqual(['cliente-demo/carousels/2026-10-10/slide-1.png', 'cliente-demo/carousels/2026-10-10/slide-2.png'])
  })
  it('CON subcarpeta: cuelga de la fecha y lo dice la respuesta', async () => {
    const r = await llamar(cuerpo({ subcarpeta: 'oficina/enc-123' }))
    const j = await r.json()
    expect(subidas.map((s) => s.path)).toEqual(['cliente-demo/carousels/2026-10-10/oficina/enc-123/slide-1.png', 'cliente-demo/carousels/2026-10-10/oficina/enc-123/slide-2.png'])
    expect(j.slide_urls[0]).toBe('https://bucket.test/cliente-demo/carousels/2026-10-10/oficina/enc-123/slide-1.png')
    expect(j.subcarpeta).toBe('oficina/enc-123')
  })
  it('dos carruseles del mismo cliente el mismo día con distinta subcarpeta NO se pisan; sin ella siguen pisándose (como hoy)', async () => {
    await llamar(cuerpo({ subcarpeta: 'oficina/enc-A' }))
    await llamar(cuerpo({ subcarpeta: 'oficina/enc-B' }))
    const rutas = subidas.map((s) => s.path)
    expect(new Set(rutas).size).toBe(rutas.length)
    subidas.length = 0
    await llamar(cuerpo()); await llamar(cuerpo())
    expect(new Set(subidas.map((s) => s.path)).size).toBe(2) // 4 subidas, 2 rutas: el viejo comportamiento
  })
  it('subcarpeta inválida → 400 (no sale del prefijo del cliente)', async () => {
    for (const mala of ['..', '../x', '/abs', 'a//b', 'a/../b', 'a/b/c/d/e', 'con espacio', 'a/', 5, ['a']]) {
      const r = await llamar(cuerpo({ subcarpeta: mala }))
      expect(r.status, JSON.stringify(mala)).toBe(400)
    }
    expect(subidas.length).toBe(0)
  })
})

describe('extras de lámina y respuesta', () => {
  it('pasa tal cual background_image_url, pie y ocultar_indicador al motor', async () => {
    const r = await llamar(cuerpo({}, { background_image_url: 'https://fotos.test/a.jpg', pie: null, ocultar_indicador: true }))
    expect(r.status).toBe(200)
    expect(renderLlamado[0].slides[0]).toMatchObject({ background_image_url: 'https://fotos.test/a.jpg', pie: null, ocultar_indicador: true })
  })
  it('rechaza una foto que no sea https ni data:image, y tipos mal puestos', async () => {
    for (const mal of [{ background_image_url: 'http://x/a.jpg' }, { background_image_url: 'file:///etc/passwd' }, { background_image_url: 'javascript:1' }, { background_image_url: 'data:text/html;base64,AAAA' }, { background_image_url: 5 }, { pie: 5 }, { ocultar_indicador: 'si' }]) {
      const r = await llamar(cuerpo({}, mal))
      expect(r.status, JSON.stringify(mal)).toBe(400)
    }
    expect((await llamar(cuerpo({}, { background_image_url: 'data:image/png;base64,iVBORw0KGgo=' }))).status).toBe(200)
  })
  it('devuelve fonts_usadas y fonts_faltantes (nunca en silencio)', async () => {
    const j = await (await llamar(cuerpo())).json()
    expect(j.fonts_usadas).toEqual(['Inter'])
    expect(j.fonts_faltantes).toEqual(['Caveat'])
  })
})
