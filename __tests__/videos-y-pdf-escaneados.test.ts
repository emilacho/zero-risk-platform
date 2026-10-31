/**
 * «VIDEOS Y PDF ESCANEADOS» (31-oct · CC-CEREBRO) · US$ 0, sin red (el ffmpeg de la prueba real es local).
 * (1-2) el video se guarda COMO VIDEO con su tipo y origen · (3) capturas de momentos clave enlazadas · (4) lectura con subcategorías, capturas y transcripción · (5) PDF escaneado leído con OCR.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capturarMomentos, firmaDeVideo, firmarVideoDelEntorno, guardarVideos, instantesDeCaptura, rutaDeFfmpeg, tipoDeVideoDeInstagram, videosDeLasFilas, BUCKET_DE_VIDEOS, MAX_BYTES_DE_VIDEO } from '../src/lib/portero-alimenta/videos-del-cerebro'
import { deQueTrataElVideo, listarVideos } from '../src/lib/cerebro/portero/videos-lectura'
import { leerDocumentosDeLosSitios } from '../src/lib/portero-alimenta/documentos-enlazados'
import { textoUtilDelOcr, MAX_OCR_POR_CORRIDA } from '../src/lib/portero-alimenta/ocr-de-pdf'
import { esPedidoDeVideos, rutaPedido, type DepsDePedido } from '../src/lib/portero-alimenta/pedidos'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../src/lib/portero-alimenta/__tests__/diez-clientes.fixtures'
import { tablasDe } from '../src/lib/portero-alimenta/__tests__/diez-clientes.tablas'
import { AHORA, ON } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'

const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(20, 1)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)])
type Fila = Record<string, unknown>
const ig = (id: string, extra: Fila = {}): Fila => ({ id, shortCode: id, type: 'Video', productType: 'clips', videoUrl: `https://cdn.ig/${id}.mp4`, caption: `pie ${id}`, timestamp: '2026-10-20T10:00:00.000Z', likesCount: 5, commentsCount: 2, videoPlayCount: 90, ...extra })
const filaIg = (username: string, posts: Fila[], extra: Fila = {}): Fila => ({ id: `r-${username}`, apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-31T10:00:00Z', respuesta: [{ username, latestPosts: posts }], ...extra })

describe('1-2 · qué videos hay y cómo se rotulan', () => {
  it('Instagram: la cuenta propia es «propio», las demás «competidor»; reel / video de feed según el actor; métricas y pie viajan', () => {
    const v = videosDeLasFilas([filaIg('naufrago.ec', [ig('A'), ig('B', { productType: 'feed', type: 'Video' })]), filaIg('rival', [ig('C')])], { handlesPropios: ['@Naufrago.ec'] })
    expect(v.map((x) => [x.handle, x.post_id, x.rol, x.tipo])).toEqual([['naufrago.ec', 'A', 'propio', 'reel'], ['naufrago.ec', 'B', 'propio', 'video_feed'], ['rival', 'C', 'competidor', 'reel']])
    expect(v[0]).toMatchObject({ caption: 'pie A', metricas: { likesCount: 5, commentsCount: 2, videoPlayCount: 90 }, posted_at: '2026-10-20T10:00:00.000Z' })
    expect(tipoDeVideoDeInstagram({ productType: 'story' })).toBe('historia')
  })
  it('🔴 un post sin videoUrl no es video; un ensayo no cuenta', () => {
    expect(videosDeLasFilas([filaIg('naufrago.ec', [ig('A', { videoUrl: undefined, type: 'Image' })])], { handlesPropios: ['naufrago.ec'] })).toHaveLength(0)
    expect(videosDeLasFilas([filaIg('naufrago.ec', [ig('A')], { ensayo: true })], { handlesPropios: ['naufrago.ec'] })).toHaveLength(0)
  })
  it('el mismo video por revisión de perfil y por descarga: gana la dirección de la descarga y se completan transcripción y duración', () => {
    const descarga: Fila = { id: 'd', apify_function: 'videos_instagram', ensayo: false, created_at: '2026-10-31T11:00:00Z', respuesta: [{ ...ig('A'), ownerUsername: 'naufrago.ec', videoUrl: 'https://cdn.ig/A-hd.mp4', transcript: 'Hola desde Olón', videoDuration: 32.5 }] }
    const v = videosDeLasFilas([filaIg('naufrago.ec', [ig('A')]), descarga], { handlesPropios: ['naufrago.ec'] })
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ url: 'https://cdn.ig/A-hd.mp4', transcripcion: 'Hola desde Olón', duracion_s: 32.5, fuente: 'videos_instagram' })
  })
  it('anuncios de Facebook = referencia/anuncio; videos de webs solo si son archivo; el del sitio ajeno es referencia y el del competidor competidor', () => {
    const anuncio: Fila = { id: 'f', apify_function: 'facebook_ads_library_scraper', ensayo: false, created_at: '2026-10-31T10:00:00Z', respuesta: [{ ad_archive_id: '99', snapshot: { page_name: 'Marca X', body: { text: 'Oferta' }, videos: [{ video_sd_url: 'https://fb/v-sd.mp4', video_hd_url: 'https://fb/v-hd.mp4' }] } }, { ad_archive_id: '98', snapshot: { images: [{ original_image_url: 'https://fb/i.jpg' }] } }] }
    const web = (fn: string, url: string, vids: string[]): Fila => ({ id: fn + url, apify_function: fn, ensayo: false, created_at: '2026-10-31T10:00:00Z', respuesta: [{ url, _enlaces: { videos: vids.map((u) => ({ url: u })) } }] })
    const v = videosDeLasFilas([anuncio, web('website_content_scraper', 'https://x.ec/', ['https://x.ec/a.mp4', 'https://youtube.com/watch?v=1', 'https://cdn.otro.com/b.webm']), web('competitor_website_scraper', 'https://rival.ec/', ['https://rival.ec/c.mov'])], { handlesPropios: [] })
    const por = (id: string) => v.find((x) => x.post_id === id || x.url.endsWith(id))
    expect(por('ad-99')).toMatchObject({ rol: 'referencia', tipo: 'anuncio', url: 'https://fb/v-hd.mp4', handle: 'marca-x' })
    expect(por('a.mp4')).toMatchObject({ rol: 'propio', tipo: 'video_web', handle: 'x.ec' })
    expect(por('b.webm')).toMatchObject({ rol: 'referencia', tipo: 'video_web' })
    expect(por('c.mov')).toMatchObject({ rol: 'competidor', tipo: 'video_web' })
    expect(v.some((x) => x.url.includes('youtube'))).toBe(false)
    expect(v.some((x) => x.post_id === 'ad-98')).toBe(false)
  })
  it('lo propio va primero; firma y momentos clave', () => {
    const v = videosDeLasFilas([filaIg('rival', [ig('C')]), filaIg('naufrago.ec', [ig('A')])], { handlesPropios: ['naufrago.ec'] })
    expect(v.map((x) => x.rol)).toEqual(['propio', 'competidor'])
    expect(firmaDeVideo(MP4)).toEqual({ ct: 'video/mp4', ext: 'mp4' })
    expect(firmaDeVideo(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]))?.ext).toBe('webm')
    expect(firmaDeVideo(Buffer.from('<html>no soy video</html>'))).toBeNull()
    const t = instantesDeCaptura(30)
    expect(t).toHaveLength(5)
    expect(t[0]).toBeCloseTo(3, 1)
    expect(t[4]).toBeCloseTo(27, 1)
    expect(instantesDeCaptura(4)).toHaveLength(3)
    expect(instantesDeCaptura(0)).toEqual([])
  })
})

/** una «base» mínima: REST de client_videos / client_social_images y el almacén; registra todo */
function basePrueba(opciones: { descargas?: Record<string, { status?: number; body?: Buffer }>; previas?: Fila[]; subidaFalla?: boolean; tablaFalla?: boolean } = {}) {
  const r = { subidas: [] as Array<{ bucket: string; ruta: string; ct: string; bytes: number }>, videos: [] as Fila[], fotos: [] as Fila[], descargadas: [] as string[] }
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const m = init?.method ?? 'GET'
    if (url.includes('/rest/v1/client_videos') && m === 'GET') return new Response(JSON.stringify(opciones.previas ?? []), { status: 200 })
    if (url.includes('/rest/v1/client_videos') && m === 'POST') {
      if (opciones.tablaFalla) return new Response('{}', { status: 500 })
      const filas = JSON.parse(String(init?.body)) as Fila
      r.videos.push(filas)
      return new Response(JSON.stringify([{ id: String(filas.id ?? 'sin-id') }]), { status: 201 })
    }
    if (url.includes('/rest/v1/client_social_images') && m === 'POST') { r.fotos.push(...(JSON.parse(String(init?.body)) as Fila[])); return new Response('', { status: 201 }) }
    if (url.includes('/storage/v1/object/') && m === 'POST') {
      if (opciones.subidaFalla) return new Response('{"error":"too big"}', { status: 413 })
      const [, resto] = url.split('/storage/v1/object/')
      const bucket = resto.split('/')[0]
      r.subidas.push({ bucket, ruta: resto.slice(bucket.length + 1), ct: String((init?.headers as Record<string, string>)['content-type']), bytes: (init?.body as Uint8Array).length })
      return new Response('{}', { status: 200 })
    }
    r.descargadas.push(url)
    const d = opciones.descargas?.[url] ?? { body: MP4 }
    return new Response(new Uint8Array(d.body ?? MP4), { status: d.status ?? 200 })
  }
  return { r, fetchImpl: fetchImpl as never }
}
/** un «ffmpeg» falso: mide 20 s y escribe una imagen en cada salida */
const ffmpegFalso = (log: string[][] = []) => async (_cmd: string, args: string[]) => {
  log.push(args)
  if (args.includes('-frames:v')) { writeFileSync(args[args.length - 1], JPG); return { ok: true, salida: '' } }
  return { ok: true, salida: '  Duration: 00:00:20.00, start: 0.000000, bitrate: 900 kb/s' }
}
const candidatos = (...ids: string[]) => videosDeLasFilas([filaIg('naufrago.ec', ids.map((i) => ig(i)))], { handlesPropios: ['naufrago.ec'] })
const args = (b: ReturnType<typeof basePrueba>, extra: Record<string, unknown> = {}) => ({ clientId: CID, urlDeLaBase: 'https://base.test', llave: 'k', fetchImpl: b.fetchImpl, ffmpeg: '/ffmpeg-falso', ejecutar: ffmpegFalso(), ...extra })

describe('1-3 · guardar el video COMO VIDEO + capturas enlazadas', () => {
  it('sube el ARCHIVO al almacén privado de videos, escribe la fila con tipo/origen/transcripción y deja 5 capturas como fotos enlazadas por video_id', async () => {
    const b = basePrueba()
    const c = videosDeLasFilas([filaIg('naufrago.ec', [ig('A')]), { id: 'd', apify_function: 'videos_instagram', ensayo: false, created_at: '2026-10-31T11:00:00Z', respuesta: [{ ...ig('A'), ownerUsername: 'naufrago.ec', transcript: 'la mejor sopa', videoDuration: 20 }] }], { handlesPropios: ['naufrago.ec'] })
    const res = await guardarVideos({ ...args(b), candidatos: c })
    expect(res).toMatchObject({ guardados: 1, capturas: 5, estado: 'ok', por_tipo: { reel: 1 }, por_origen: { propio: 1 }, fallidos: [], sin_capturas: [] })
    const video = b.r.subidas.find((s) => s.bucket === BUCKET_DE_VIDEOS)!
    expect(video).toMatchObject({ ruta: `${CID}/propio/naufrago.ec/A.mp4`, ct: 'video/mp4', bytes: MP4.length })
    expect(b.r.subidas.filter((s) => s.bucket === 'client-social-images')).toHaveLength(5)
    expect(b.r.videos[0]).toMatchObject({ client_id: CID, owner_role: 'propio', handle: 'naufrago.ec', post_id: 'A', tipo: 'reel', estado: 'ok', path: `${CID}/propio/naufrago.ec/A.mp4`, bytes: MP4.length, transcripcion: 'la mejor sopa', caption: 'pie A', metricas: { likesCount: 5, commentsCount: 2, videoPlayCount: 90 } })
    expect(b.r.videos[0].hash_archivo).toMatch(/^[0-9a-f]{64}$/)
    expect(b.r.fotos).toHaveLength(5)
    expect(b.r.fotos.every((f) => f.tipo === 'video_captura' && f.video_id === b.r.videos[0].id && f.owner_role === 'propio' && f.medio === 'video' && f.estado === 'ok')).toBe(true)
    expect(b.r.fotos.map((f) => f.post_id)).toEqual(['A-f1', 'A-f2', 'A-f3', 'A-f4', 'A-f5'])
  })
  it('🔴 el video NO se guarda como foto: ninguna fila de fotos lleva el video ni su dirección', async () => {
    const b = basePrueba()
    await guardarVideos({ ...args(b), candidatos: candidatos('A') })
    expect(b.r.fotos.every((f) => /\.jpg$/.test(String(f.url)) && f.tipo === 'video_captura')).toBe(true)
    expect(b.r.subidas.filter((s) => s.bucket === 'client-social-images').every((s) => s.ct === 'image/jpeg')).toBe(true)
  })
  it('sin ffmpeg el video se guarda IGUAL y se declara sin capturas', async () => {
    const b = basePrueba()
    const res = await guardarVideos({ ...args(b, { ffmpeg: null }), candidatos: candidatos('A') })
    expect(res.guardados).toBe(1)
    expect(res.capturas).toBe(0)
    expect(res.sin_capturas[0]).toMatchObject({ post_id: 'A' })
    expect(res.sin_capturas[0].causa).toMatch(/ffmpeg/)
  })
  it('lo ya guardado no se baja otra vez; el mismo archivo con otro código tampoco', async () => {
    const hecho = { owner_role: 'propio', handle: 'naufrago.ec', post_id: 'A', estado: 'ok', hash_archivo: 'h', fuente_url: 'https://cdn.ig/A.mp4' }
    const b = basePrueba({ previas: [hecho] })
    const res = await guardarVideos({ ...args(b), candidatos: candidatos('A', 'B') })
    expect(b.r.descargadas).toEqual(['https://cdn.ig/B.mp4'])
    expect(res).toMatchObject({ ya_estaban: 1, guardados: 1 })
    const b2 = basePrueba()
    const dos = await guardarVideos({ ...args(b2), candidatos: candidatos('A', 'B') })
    expect(dos).toMatchObject({ guardados: 1, ya_estaban: 1 })
  })
  it('lo que no baja se DECLARA como fila no_bajo con su causa, sin tumbar a los demás: HTTP 403, no es un video, demasiado grande, subida rechazada', async () => {
    const b = basePrueba({ descargas: { 'https://cdn.ig/A.mp4': { status: 403 }, 'https://cdn.ig/B.mp4': { body: Buffer.from('<html>caducó</html>'.padEnd(40)) } } })
    const res = await guardarVideos({ ...args(b), candidatos: candidatos('A', 'B', 'C') })
    expect(res.guardados).toBe(1)
    expect(res.fallidos.map((f) => f.causa)).toEqual(['HTTP 403', expect.stringMatching(/^no es un video/)])
    const declaradas = b.r.videos.filter((v) => v.estado === 'no_bajo')
    expect(declaradas.map((v) => v.post_id)).toEqual(['A', 'B'])
    expect(declaradas.every((v) => v.causa && v.path === null)).toBe(true)
    const grande = basePrueba({ descargas: { 'https://cdn.ig/A.mp4': { body: Buffer.concat([MP4, Buffer.alloc(MAX_BYTES_DE_VIDEO)]) } } })
    expect((await guardarVideos({ ...args(grande), candidatos: candidatos('A') })).fallidos[0].causa).toMatch(/demasiado grande/)
    const rechazo = basePrueba({ subidaFalla: true })
    const rr = await guardarVideos({ ...args(rechazo), candidatos: candidatos('A') })
    expect(rr.guardados).toBe(0)
    expect(rr.fallidos[0].causa).toMatch(/subida rechazada · HTTP 413/)
    expect(rechazo.r.videos.every((v) => v.estado === 'no_bajo')).toBe(true)
  })
  it('un video que ya falló con ESTA dirección no se reintenta cada día; si la dirección cambió, sí', async () => {
    const falla = { owner_role: 'propio', handle: 'naufrago.ec', post_id: 'A', estado: 'no_bajo', hash_archivo: null, fuente_url: 'https://cdn.ig/A.mp4' }
    const b = basePrueba({ previas: [falla] })
    const res = await guardarVideos({ ...args(b), candidatos: candidatos('A') })
    expect(res).toMatchObject({ ya_fallaron: 1, guardados: 0 })
    expect(b.r.descargadas).toEqual([])
    const otra = basePrueba({ previas: [{ ...falla, fuente_url: 'https://cdn.ig/vieja.mp4' }] })
    expect((await guardarVideos({ ...args(otra), candidatos: candidatos('A') })).guardados).toBe(1)
  })
  it('tope por corrida: lo que sobra queda para la siguiente y se cuenta', async () => {
    const b = basePrueba({ descargas: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((i, k) => [`https://cdn.ig/${i}.mp4`, { body: Buffer.concat([MP4, Buffer.from([k])]) }])) })
    const res = await guardarVideos({ ...args(b), candidatos: candidatos('A', 'B', 'C', 'D', 'E', 'F'), max: 2 })
    expect(res).toMatchObject({ guardados: 2, omitidos_por_tope: 4 })
    let t = 0
    const lento = basePrueba()
    const res2 = await guardarVideos({ ...args(lento), candidatos: candidatos('A', 'B', 'C'), plazoMs: 10, ahora: () => (t += 100) })
    expect(res2.guardados + res2.omitidos_por_tope).toBe(3)
    expect(res2.omitidos_por_tope).toBeGreaterThan(0)
  })
  it('sin base o con la tabla caída: no tumba y lo dice; sin candidatos no hace nada', async () => {
    expect((await guardarVideos({ ...args(basePrueba()), candidatos: [] })).estado).toBe('sin_candidatos')
    expect((await guardarVideos({ ...args(basePrueba(), { llave: '' }), candidatos: candidatos('A') })).estado).toBe('sin_base')
    const caida = basePrueba({ tablaFalla: true })
    const res = await guardarVideos({ ...args(caida), candidatos: candidatos('A') })
    expect(res.guardados).toBe(0)
    expect(res.fallidos[0].causa).toMatch(/HTTP 500/)
  })
  it('firma la dirección del archivo privado (1 hora) y devuelve null si no se pudo', async () => {
    const pedidos: string[] = []
    const ok = firmarVideoDelEntorno({ urlDeLaBase: 'https://base.test', llave: 'k', fetchImpl: async (u, i) => { pedidos.push(`${u} ${i?.body}`); return new Response(JSON.stringify({ signedURL: '/object/sign/client-videos/x/y.mp4?token=t' }), { status: 200 }) } })
    expect(await ok('c/propio/n/A.mp4')).toBe('https://base.test/storage/v1/object/sign/client-videos/x/y.mp4?token=t')
    expect(pedidos[0]).toContain('/object/sign/client-videos/c/propio/n/A.mp4')
    expect(pedidos[0]).toContain('"expiresIn":3600')
    expect(await firmarVideoDelEntorno({ urlDeLaBase: 'https://base.test', llave: 'k', fetchImpl: async () => new Response('x', { status: 400 }) })('a/b.mp4')).toBeNull()
    expect(await firmarVideoDelEntorno({ urlDeLaBase: '', llave: '' })('a/b.mp4')).toBeNull()
  })
})

describe('3 · capturas de momentos clave', () => {
  it('mide la duración con ffmpeg cuando el actor no la trae y saca una captura por instante', async () => {
    const log: string[][] = []
    const r = await capturarMomentos({ bytes: MP4, ext: 'mp4', ffmpeg: '/ff', ejecutar: ffmpegFalso(log) })
    expect(r.duracion_s).toBe(20)
    expect(r.capturas.map((c) => c.segundo)).toEqual(instantesDeCaptura(20))
    expect(log.filter((a) => a.includes('-frames:v'))).toHaveLength(5)
  })
  it('una captura que no es imagen se descarta; si ffmpeg no saca ninguna, lo dice', async () => {
    const r = await capturarMomentos({ bytes: MP4, ext: 'mp4', duracion: 10, ffmpeg: '/ff', ejecutar: async (_c, a) => { if (a.includes('-frames:v')) writeFileSync(a[a.length - 1], Buffer.from('no soy imagen'.padEnd(2000))); return { ok: true, salida: '' } } })
    expect(r.capturas).toHaveLength(0)
    expect(r.causa).toMatch(/ninguna captura/)
    const sinDuracion = await capturarMomentos({ bytes: MP4, ext: 'mp4', ffmpeg: '/ff', ejecutar: async () => ({ ok: true, salida: 'sin duración' }) })
    expect(sinDuracion.causa).toMatch(/duración/)
  })
  const ff = rutaDeFfmpeg()
  it.skipIf(!ff)('🔴 con el ffmpeg REAL: un video de 6 s con colores distintos da capturas distintas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvt-'))
    try {
      const mp4 = join(dir, 'p.mp4')
      execFileSync(ff!, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x240:rate=10', '-pix_fmt', 'yuv420p', '-y', mp4])
      const bytes = readFileSync(mp4)
      expect(firmaDeVideo(bytes)?.ext).toBe('mp4')
      const r = await capturarMomentos({ bytes, ext: 'mp4', ffmpeg: ff })
      expect(r.duracion_s).toBeGreaterThan(5.5)
      expect(r.capturas.length).toBeGreaterThanOrEqual(3)
      expect(r.capturas.every((c) => c.bytes.subarray(0, 3).toString('hex') === 'ffd8ff')).toBe(true)
      expect(new Set(r.capturas.map((c) => c.bytes.toString('hex'))).size).toBe(r.capturas.length)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 60_000)
})

describe('4 · la lectura entrega el video con subcategorías, capturas y transcripción', () => {
  const vid = (id: string, extra: Fila = {}): Fila => ({ id, client_id: CID, owner_role: 'propio', handle: 'naufrago.ec', post_id: id, tipo: 'reel', estado: 'ok', path: `${CID}/propio/naufrago.ec/${id}.mp4`, bytes: 1000, duracion_s: 20.5, caption: 'la sopa', posted_at: '2026-10-20T10:00:00Z', post_url: 'https://ig/p/1', transcripcion: 'Hola desde Olón', metricas: { likesCount: 5 }, created_at: '2026-10-31T12:00:00Z', ...extra })
  const cap = (id: string, v: string, seg: number, extra: Fila = {}): Fila => ({ id, client_id: CID, video_id: v, tipo: 'video_captura', estado: 'ok', posicion: `segundo-${seg}`, url: `https://x/${id}.jpg`, etiquetada_en: '2026-10-31T13:00:00Z', que_muestra: `escena ${id}`, producto_visto: ['sopa'], texto_visible: null, created_at: '2026-10-31T12:00:00Z', ...extra })
  const consultaDe = (tablas: Record<string, Fila[]>) => async (p: { tabla: string; donde: Record<string, unknown> }) => ({ filas: (tablas[p.tabla] ?? []).filter((x) => Object.entries(p.donde).every(([k, v]) => x[k] === v)), error: null })
  it('trae tipo, origen, cuenta, fecha, duración, pie, métricas, transcripción, capturas ordenadas con su etiqueta y una dirección firmada', async () => {
    const t = { client_videos: [vid('v1'), vid('v2', { owner_role: 'competidor', tipo: 'anuncio', handle: 'x' }), vid('v3', { estado: 'no_bajo', path: null })], client_social_images: [cap('c2', 'v1', 10), cap('c1', 'v1', 3), cap('c3', 'v1', 20, { etiquetada_en: null, que_muestra: null })] }
    const r = await listarVideos(consultaDe(t) as never, { cliente: CID }, async (p) => `https://firmada/${p}`)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ total: 2, devueltos: 2, sin_descargar: 1, por_tipo: { reel: 1, anuncio: 1 }, por_origen: { propia: 1, competencia: 1, referencia: 0 }, archivo_firmado: true, costo_usd: 0, modelos_llamados: 0 })
    const v1 = r.videos.find((v) => v.video_id === 'v1')!
    expect(v1).toMatchObject({ tipo: 'reel', origen: 'propia', cuenta: 'naufrago.ec', duracion_s: 20.5, pie: 'la sopa', metricas: { likesCount: 5 }, transcripcion: 'Hola desde Olón', publicado_en: '2026-10-20T10:00:00Z', archivo_url: `https://firmada/${CID}/propio/naufrago.ec/v1.mp4` })
    expect(v1.capturas.map((c) => [c.segundo, c.etiquetada])).toEqual([['3', true], ['10', true], ['20', false]])
    expect(v1.de_que_trata).toBe('escena c1 · escena c2')
  })
  it('filtra por origen y por tipo; sin etiquetas «de qué trata» sale del pie; sin firma lo dice', async () => {
    const t = { client_videos: [vid('v1'), vid('v2', { owner_role: 'competidor', tipo: 'anuncio' })], client_social_images: [] }
    const o = await listarVideos(consultaDe(t) as never, { cliente: CID, origen: 'competencia' })
    const a = await listarVideos(consultaDe(t) as never, { cliente: CID, tipo: 'reel' })
    expect(o.ok && o.videos.map((v) => v.video_id)).toEqual(['v2'])
    expect(a.ok && a.videos.map((v) => v.video_id)).toEqual(['v1'])
    expect(o.ok && o.archivo_firmado).toBe(false)
    expect(o.ok && o.videos[0].archivo_url).toBeNull()
    expect(o.ok && o.videos[0].de_que_trata).toBe('la sopa')
    expect(deQueTrataElVideo([], null)).toBeNull()
  })
  it('🔴 un error de la base NO se lee como «no hay videos»; entradas inválidas se rechazan', async () => {
    const malo = async () => ({ filas: [], error: 'caída' })
    expect(await listarVideos(malo as never, { cliente: CID })).toMatchObject({ ok: false, error: 'error_de_lectura' })
    const soloVideos = async (p: { tabla: string }) => (p.tabla === 'client_videos' ? { filas: [], error: 'caída' } : { filas: [], error: null })
    const soloCapturas = async (p: { tabla: string }) => (p.tabla === 'client_social_images' ? { filas: [], error: 'caída' } : { filas: [], error: null })
    expect(await listarVideos(soloVideos as never, { cliente: CID })).toMatchObject({ ok: false, error: 'error_de_lectura' })
    expect(await listarVideos(soloCapturas as never, { cliente: CID })).toMatchObject({ ok: false, error: 'error_de_lectura' })
    expect(await listarVideos(malo as never, { cliente: '' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarVideos(malo as never, { cliente: CID, tipo: 'podcast' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarVideos(malo as never, { cliente: CID, origen: 'x' as never })).toMatchObject({ ok: false, error: 'entrada_invalida' })
  })
  it('el pedido libre con el hueco «videos» responde con el video, sus capturas y su transcripción; sin videos, lo dice', async () => {
    expect(esPedidoDeVideos({ objetivo: 'videos de la competencia' })).toBe(true)
    expect(esPedidoDeVideos({ tipo: 'videos' })).toBe(true)
    expect(esPedidoDeVideos({ objetivo: 'el menú con precios' })).toBe(false)
    const c = DIEZ_CLIENTES[0]
    const t = { client_videos: [vid('v1', { client_id: c.id })], client_social_images: [cap('c1', 'v1', 3, { client_id: c.id })] }
    const mk = (tablas: typeof t): DepsDePedido => ({ db: crearBaseFalsa(tablasDe(c) as never).db, interruptores: { ...ON, resumen_vivo: false, resumen_pulido: false }, activo: true, ahora: AHORA, nuevoId: () => '11111111-2222-4333-8444-555555555555', esperar: async () => {}, videos: { listar: (id) => listarVideos(consultaDe({ client_videos: tablas.client_videos.map((x) => ({ ...x, client_id: id })), client_social_images: tablas.client_social_images.map((x) => ({ ...x, client_id: id })) }) as never, { cliente: id }) } })
    const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
    const res = await rutaPedido(mk(t), { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear una pieza', huecos: [{ tipo: 'videos', objetivo: 'videos propios del cliente' }] })
    expect(res.status).toBe(200)
    const h = (res.body.huecos as Array<{ estado: string; videos?: Array<{ video_id: string; transcripcion: string; capturas: unknown[] }>; videos_resumen?: { total: number } }>)[0]
    expect(h.estado).toBe('ya_esta')
    expect(h.videos?.[0]).toMatchObject({ video_id: 'v1', transcripcion: 'Hola desde Olón' })
    expect(h.videos?.[0].capturas).toHaveLength(1)
    expect(h.videos_resumen?.total).toBe(1)
    const vacio = await rutaPedido(mk({ client_videos: [], client_social_images: [] }), { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear una pieza', huecos: [{ tipo: 'videos', objetivo: 'videos del cliente' }] })
    const hv = (vacio.body.huecos as Array<{ estado: string; nada_usable?: boolean }>)[0]
    expect(hv).toMatchObject({ estado: 'no_resuelto', nada_usable: true })
  })
})

describe('5 · PDF escaneados · OCR', () => {
  const ahora = new Date('2026-10-31T15:00:00Z')
  const pag = (url: string, docs: Array<{ url: string }>) => ({ url, text: 'x', _enlaces: { documentos: docs, videos: [] } })
  const fila = (id: string, fn: string, respuesta: unknown[], extra: Fila = {}) => ({ id, apify_function: fn, respuesta, ensayo: false, created_at: '2026-10-31T10:00:00Z', ...extra }) as never
  const PDF = Buffer.from('%PDF-1.4 falso')
  const traerPdf = async () => new Response(new Uint8Array(PDF), { status: 200 })
  const escaneado = (paginas?: number) => (async () => ({ estado: 'escaneado', texto: '', paginas, motivo: 'sin texto' })) as never
  const filas = [fila('f1', 'website_content_scraper', [pag('https://x.ec/', [{ url: 'https://x.ec/a.pdf' }, { url: 'https://x.ec/b.pdf' }, { url: 'https://x.ec/c.pdf' }])])]
  it('un PDF escaneado se lee con el modelo (OCR) y entra como página del sitio; el costo se suma', async () => {
    const vistos: string[] = []
    const r = await leerDocumentosDeLosSitios({ filas: [filas[0]], ahora, max: 1, fetchImpl: traerPdf as never, leer: escaneado(3), ocr: async (b, n) => { vistos.push(`${b.length}:${n}`); return { texto: '--- página 1 ---\nCeviche mixto US$ 12,50\nHorario: lunes a viernes 10:00 a 18:00', costo_usd: 0.07, tokens_entrada: 5000, tokens_salida: 300, cortado: false } } })
    expect(r).toMatchObject({ leidos: 1, del_sitio: 1, fallidos: [], ocr: { leidos: 1, costo_usd: 0.07 } })
    expect(vistos).toEqual([`${PDF.length}:a.pdf`])
    expect((r.filas[0].respuesta as Array<Fila>)[0]).toMatchObject({ url: 'https://x.ec/a.pdf' })
    expect(String((r.filas[0].respuesta as Array<Fila>)[0].text)).toContain('Ceviche mixto US$ 12,50')
  })
  it('🔴 sin lector de OCR (ensayo) el escaneado se declara y no se inventa nada', async () => {
    const r = await leerDocumentosDeLosSitios({ filas: [filas[0]], ahora, max: 1, fetchImpl: traerPdf as never, leer: escaneado(3) })
    expect(r.leidos).toBe(0)
    expect(r.fallidos[0].causa).toMatch(/^escaneado/)
    expect(r.ocr.leidos).toBe(0)
  })
  it('🔴 tope de lecturas por corrida y de páginas por documento: lo que no cabe se declara sin gastar', async () => {
    let llamadas = 0
    const ocr = async () => { llamadas++; return { texto: 'Menú del día\nSopa de pescado 4,50\nSegundo 6,00', costo_usd: 0.05, tokens_entrada: 1, tokens_salida: 1, cortado: false } }
    const r = await leerDocumentosDeLosSitios({ filas, ahora, fetchImpl: traerPdf as never, leer: escaneado(2), ocr })
    expect(llamadas).toBe(MAX_OCR_POR_CORRIDA)
    expect(r.leidos).toBe(MAX_OCR_POR_CORRIDA)
    expect(r.fallidos).toHaveLength(1)
    expect(r.fallidos[0].causa).toMatch(/tope de lecturas OCR/)
    let l2 = 0
    const largo = await leerDocumentosDeLosSitios({ filas: [filas[0]], ahora, max: 1, fetchImpl: traerPdf as never, leer: escaneado(40), ocr: async () => { l2++; return { texto: 'x', costo_usd: 1, tokens_entrada: 1, tokens_salida: 1, cortado: false } } })
    expect(l2).toBe(0)
    expect(largo.fallidos[0].causa).toMatch(/demasiado largo/)
  })
  it('si el modelo no encuentra texto legible, se declara (nunca se guarda una página vacía)', async () => {
    const r = await leerDocumentosDeLosSitios({ filas: [filas[0]], ahora, max: 1, fetchImpl: traerPdf as never, leer: escaneado(1), ocr: async () => ({ texto: '--- página 1 ---\n[ilegible]', costo_usd: 0.02, tokens_entrada: 1, tokens_salida: 1, cortado: false }) })
    expect(r.leidos).toBe(0)
    expect(r.fallidos[0].causa).toMatch(/no encontró texto legible/)
    expect(r.ocr.costo_usd).toBe(0.02)
    expect(textoUtilDelOcr('--- página 1 ---')).toBe('')
    expect(textoUtilDelOcr('Pollo asado con papas y ensalada 8,50')).toContain('Pollo asado')
  })
  it('el PDF con texto sigue sin llamar al modelo (US$ 0) y el de competidor escaneado se guarda COMO competidor', async () => {
    let llamadas = 0
    const ocr = async () => { llamadas++; return { texto: 'Catálogo rival\nExtintor PQS 10 libras 45,00', costo_usd: 0.04, tokens_entrada: 1, tokens_salida: 1, cortado: true } }
    const conTexto = await leerDocumentosDeLosSitios({ filas: [filas[0]], ahora, max: 1, fetchImpl: traerPdf as never, leer: (async () => ({ estado: 'ok', texto: 'Ceviche 12,00', paginas: 1 })) as never, ocr })
    expect(conTexto.leidos).toBe(1)
    expect(llamadas).toBe(0)
    const guardadas: Array<Fila> = []
    const comp = [fila('f2', 'competitor_website_scraper', [pag('https://rival.ec/', [{ url: 'https://rival.ec/cat.pdf' }])], { params: { competitor_id: 'c-1' } })]
    const r = await leerDocumentosDeLosSitios({ filas: comp, ahora, fetchImpl: traerPdf as never, leer: escaneado(2), ocr, guardarDePagina: async (p) => { guardadas.push(p as never); return true } })
    expect(r).toMatchObject({ leidos: 1, de_competidores: 1, del_sitio: 0 })
    expect(r.filas).toHaveLength(0)
    expect(guardadas[0]).toMatchObject({ url: 'https://rival.ec/cat.pdf', competitor_id: 'c-1' })
    expect(String(guardadas[0].texto)).toContain('Catálogo rival')
    expect(String(guardadas[0].texto)).toContain('se cortó')
  })
})
