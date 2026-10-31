/**
 * LOS VIDEOS DEL CEREBRO · 31-oct (encargo «videos y PDF escaneados»)
 * El video se guarda COMO VIDEO (el archivo, en el almacén privado `client-videos`), no como foto. El enlace de Instagram caduca a los pocos días: se baja al raspar.
 *  · fuentes: Instagram propio y de competencia (`instagram_scraper`, `videos_instagram`), anuncios de Facebook (referencia) y videos enlazados en las webs que son archivo (mp4/webm/mov).
 *  · subcategorías: tipo (reel · video de feed · historia · anuncio · video de web), origen (propio · competidor · referencia), cuenta, fecha, duración, pie, métricas y transcripción.
 *  · EXTRA: 3 a 5 capturas de momentos clave (ffmpeg) como fotos `video_captura` enlazadas por `video_id`; entran al etiquetado como cualquier foto. Sin ffmpeg el video se guarda igual y se DECLARA.
 * Nunca tumba la corrida: devuelve el motivo de lo que no pudo. Lo que no baja queda como fila `no_bajo` con su causa.
 */
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MAX_VIDEOS_POR_CORRIDA = 4
export const MAX_BYTES_DE_VIDEO = 45 * 1024 * 1024
export const CAPTURAS_POR_VIDEO = 5
export const BUCKET_DE_VIDEOS = 'client-videos'
const BUCKET_DE_FOTOS = 'client-social-images'
const MS_DE_DESCARGA = 60_000
const TIPOS = ['reel', 'video_feed', 'historia', 'anuncio', 'video_web'] as const
export type TipoDeVideo = (typeof TIPOS)[number]
export type RolDeVideo = 'propio' | 'competidor' | 'referencia'

type Fila = Record<string, unknown>
type Traer = (url: string, init?: RequestInit) => Promise<Response>
const arr = (v: unknown): Fila[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Fila[]) : [])
const txt = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null }
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const slug = (t: string, n: number) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n) || 'video'
const manejo = (h: unknown) => txt(h).trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '')
const urlHttp = (v: unknown): string | null => { const u = txt(v).trim(); return /^https?:\/\/[^\s]+$/i.test(u) && u.length < 3000 ? u : null }
const hostDe = (u: string): string => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const esArchivoDeVideo = (u: string): boolean => /\.(mp4|webm|mov|m4v)$/i.test(u.split('?')[0].split('#')[0])

export interface VideoCandidato {
  rol: RolDeVideo
  handle: string
  post_id: string
  tipo: TipoDeVideo
  url: string
  fuente: string
  caption: string | null
  posted_at: string | null
  post_url: string | null
  duracion_s: number | null
  transcripcion: string | null
  metricas: Record<string, number>
}

/** reel / video de feed / historia según lo que trae el actor de Instagram */
export function tipoDeVideoDeInstagram(p: Fila): TipoDeVideo {
  const t = `${txt(p.productType)} ${txt(p.type)}`.toLowerCase()
  if (/story|historia/.test(t)) return 'historia'
  if (/clips|reel/.test(t)) return 'reel'
  return 'video_feed'
}

const METRICAS_IG = ['likesCount', 'commentsCount', 'videoPlayCount', 'videoViewCount'] as const
function metricasDe(p: Fila): Record<string, number> {
  const m: Record<string, number> = {}
  for (const k of METRICAS_IG) { const n = num(p[k]); if (n !== null && n >= 0) m[k] = n }
  return m
}

/** los videos que traen las filas crudas del raspado; el rol de una cuenta de Instagram sale de la ficha (la cuenta propia) y el resto es competencia */
export function videosDeLasFilas(filas: Fila[], a: { handlesPropios: string[] }): VideoCandidato[] {
  const propios = new Set(a.handlesPropios.map(manejo).filter(Boolean))
  const porClave = new Map<string, VideoCandidato>()
  const mete = (c: VideoCandidato) => {
    const k = `${c.rol}|${c.handle}|${c.post_id}`
    const previo = porClave.get(k)
    if (!previo) { porClave.set(k, c); return }
    // el mismo video por dos vías (revisión de perfil y descarga de videos): se queda con la dirección de la descarga y se completan los campos vacíos
    const mejor = c.fuente === 'videos_instagram' ? c : previo
    const otro = mejor === c ? previo : c
    porClave.set(k, { ...mejor, caption: mejor.caption ?? otro.caption, posted_at: mejor.posted_at ?? otro.posted_at, duracion_s: mejor.duracion_s ?? otro.duracion_s, transcripcion: mejor.transcripcion ?? otro.transcripcion, metricas: { ...otro.metricas, ...mejor.metricas } })
  }
  const deInstagram = (p: Fila, fuente: string, handleCrudo: unknown) => {
    const url = urlHttp(p.videoUrl)
    const handle = manejo(handleCrudo ?? p.ownerUsername)
    const post_id = txt(p.shortCode) || txt(p.id)
    if (!url || !handle || !post_id) return
    const tr = txt(p.transcript).trim()
    mete({ rol: propios.has(handle) ? 'propio' : 'competidor', handle, post_id, tipo: tipoDeVideoDeInstagram(p), url, fuente, caption: txt(p.caption).trim().slice(0, 500) || null, posted_at: txt(p.timestamp) || null, post_url: urlHttp(p.url), duracion_s: num(p.videoDuration), transcripcion: tr ? tr.slice(0, 20000) : null, metricas: metricasDe(p) })
  }
  for (const f of filas) {
    if (f.ensayo === true) continue
    const fn = txt(f.apify_function)
    const resp = arr(f.respuesta)
    if (fn === 'instagram_scraper') {
      for (const perfil of resp) for (const p of arr(perfil.latestPosts)) deInstagram(p, fn, perfil.username)
    } else if (fn === 'videos_instagram') {
      for (const p of resp) deInstagram(p, fn, p.ownerUsername)
    } else if (fn === 'facebook_ads_library_scraper') {
      for (const it of resp) {
        const sn = (it.snapshot && typeof it.snapshot === 'object' ? it.snapshot : {}) as Fila
        const aid = txt(it.ad_archive_id ?? it.adArchiveID).replace(/[^0-9a-z]/gi, '')
        const video = arr(sn.videos)[0]
        const url = video ? urlHttp(video.video_hd_url) ?? urlHttp(video.video_sd_url) : null
        if (!url || !aid) continue
        const cuerpo = sn.body && typeof sn.body === 'object' ? txt((sn.body as Fila).text) : txt(sn.body)
        mete({ rol: 'referencia', handle: slug(txt(sn.page_name ?? it.page_name), 40) || 'anuncio', post_id: `ad-${aid}`, tipo: 'anuncio', url, fuente: fn, caption: (cuerpo || txt(sn.title)).trim().slice(0, 500) || null, posted_at: null, post_url: urlHttp(sn.link_url), duracion_s: null, transcripcion: null, metricas: {} })
      }
    } else if (fn === 'website_content_scraper' || fn === 'competitor_website_scraper') {
      for (const pag of resp) {
        const pagina = txt(pag.url)
        for (const v of arr((pag as { _enlaces?: { videos?: unknown } })._enlaces?.videos)) {
          const u = urlHttp(v.url)
          if (!u || !esArchivoDeVideo(u) || !pagina) continue
          const mismo = hostDe(u).split('.').slice(-2).join('.') === hostDe(pagina).split('.').slice(-2).join('.')
          const rol: RolDeVideo = fn === 'competitor_website_scraper' ? 'competidor' : mismo ? 'propio' : 'referencia'
          mete({ rol, handle: hostDe(pagina) || 'sitio', post_id: `web-${sha256(Buffer.from(u)).slice(0, 12)}`, tipo: 'video_web', url: u, fuente: fn, caption: txt(v.texto).replace(/\s+/g, ' ').trim().slice(0, 300) || null, posted_at: null, post_url: pagina, duracion_s: null, transcripcion: null, metricas: {} })
        }
      }
    }
  }
  const orden: Record<RolDeVideo, number> = { propio: 0, competidor: 1, referencia: 2 }
  return [...porClave.values()].sort((x, y) => orden[x.rol] - orden[y.rol] || (y.posted_at ?? '').localeCompare(x.posted_at ?? ''))
}

/** ¿es de verdad un video? mp4/mov/m4v llevan «ftyp» en los bytes 4-8; webm/mkv empiezan por 1a45dfa3 */
export function firmaDeVideo(buf: Buffer): { ct: string; ext: string } | null {
  if (buf.length < 12) return null
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return buf.subarray(8, 12).toString('ascii').startsWith('qt') ? { ct: 'video/quicktime', ext: 'mov' } : { ct: 'video/mp4', ext: 'mp4' }
  if (buf.subarray(0, 4).toString('hex') === '1a45dfa3') return { ct: 'video/webm', ext: 'webm' }
  return null
}

/** instantes (s) de los momentos clave: repartidos entre el 10 % y el 90 % del video */
export function instantesDeCaptura(duracion: number, n = CAPTURAS_POR_VIDEO): number[] {
  if (!(duracion > 0)) return []
  const k = duracion < 6 ? 3 : n
  return Array.from({ length: k }, (_, i) => Math.round(duracion * (0.1 + (0.8 * i) / Math.max(1, k - 1)) * 100) / 100)
}

export function rutaDeFfmpeg(): string | null {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  // referencia ESTÁTICA a propósito: así el empaquetado de Vercel la ve y lleva el ejecutable (con createRequire dinámico no lo llevaba)
  try { return (require('@ffmpeg-installer/ffmpeg') as { path?: string }).path ?? null } catch { return null }
}

type Ejecutar = (cmd: string, args: string[], tiempoMs: number) => Promise<{ ok: boolean; salida: string }>
const ejecutarReal: Ejecutar = (cmd, args, tiempoMs) => new Promise((res) => {
  execFile(cmd, args, { timeout: tiempoMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => res({ ok: !err, salida: `${stdout}${stderr}` }))
})

export interface Captura { n: number; segundo: number; bytes: Buffer }
/** saca las capturas de un video ya bajado; devuelve la duración medida y lo que se pudo (nunca lanza) */
export async function capturarMomentos(a: { bytes: Buffer; ext: string; duracion?: number | null; ffmpeg?: string | null; ejecutar?: Ejecutar }): Promise<{ duracion_s: number | null; capturas: Captura[]; causa?: string }> {
  const ff = a.ffmpeg === undefined ? rutaDeFfmpeg() : a.ffmpeg
  if (!ff) return { duracion_s: a.duracion ?? null, capturas: [], causa: 'ffmpeg no está disponible en este servidor' }
  const correr = a.ejecutar ?? ejecutarReal
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'cv-'))
    const entrada = join(dir, `v.${a.ext}`)
    await writeFile(entrada, a.bytes)
    let duracion = a.duracion && a.duracion > 0 ? a.duracion : null
    if (!duracion) {
      const m = await correr(ff, ['-hide_banner', '-i', entrada], 20_000)
      const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(m.salida)
      if (d) duracion = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])
    }
    if (!duracion) return { duracion_s: null, capturas: [], causa: 'no se pudo medir la duración del video' }
    const capturas: Captura[] = []
    let i = 0
    for (const s of instantesDeCaptura(duracion)) {
      i++
      const salida = join(dir, `f${i}.jpg`)
      const r = await correr(ff, ['-v', 'error', '-ss', String(s), '-i', entrada, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', '-y', salida], 30_000)
      if (!r.ok) continue
      try { const b = await readFile(salida); if (b.length > 1000 && b.subarray(0, 3).toString('hex') === 'ffd8ff') capturas.push({ n: i, segundo: s, bytes: b }) } catch { /* ese instante no dio imagen */ }
    }
    return { duracion_s: duracion, capturas, ...(capturas.length ? {} : { causa: 'ffmpeg no sacó ninguna captura' }) }
  } catch (e) {
    return { duracion_s: a.duracion ?? null, capturas: [], causa: (e instanceof Error ? e.message : String(e)).slice(0, 120) }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export interface ResultadoDeVideos {
  candidatos: number
  ya_estaban: number
  /** ya fallaron antes con esta misma dirección: no se reintentan */
  ya_fallaron: number
  guardados: number
  capturas: number
  bytes: number
  por_tipo: Record<string, number>
  por_origen: Record<string, number>
  fallidos: Array<{ post_id: string; causa: string }>
  sin_capturas: Array<{ post_id: string; causa: string }>
  omitidos_por_tope: number
  estado: 'ok' | 'sin_candidatos' | 'sin_base'
}

export async function guardarVideos(a: {
  clientId: string
  candidatos: VideoCandidato[]
  urlDeLaBase: string
  llave: string
  fetchImpl?: Traer
  max?: number
  /** plazo total (ms): al agotarse, lo que falte queda para la siguiente corrida */
  plazoMs?: number
  ffmpeg?: string | null
  ejecutar?: Ejecutar
  ahora?: () => number
}): Promise<ResultadoDeVideos> {
  const res: ResultadoDeVideos = { candidatos: a.candidatos.length, ya_estaban: 0, ya_fallaron: 0, guardados: 0, capturas: 0, bytes: 0, por_tipo: {}, por_origen: {}, fallidos: [], sin_capturas: [], omitidos_por_tope: 0, estado: 'ok' }
  if (!a.candidatos.length) return { ...res, estado: 'sin_candidatos' }
  if (!a.llave || !a.urlDeLaBase) return { ...res, estado: 'sin_base' }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const reloj = a.ahora ?? (() => Date.now())
  const limite = reloj() + (a.plazoMs ?? 150_000)
  const base = a.urlDeLaBase.replace(/\/$/, '')
  const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
  const json = { ...auth, 'content-type': 'application/json' }

  const previas = await traer(`${base}/rest/v1/client_videos?client_id=eq.${encodeURIComponent(a.clientId)}&select=owner_role,handle,post_id,estado,hash_archivo,fuente_url&limit=2000`, { headers: auth })
  if (!previas.ok) return { ...res, estado: 'sin_base' }
  const filasPrevias = (await previas.json()) as Array<{ owner_role: string; handle: string; post_id: string; estado: string; hash_archivo: string | null; fuente_url: string | null }>
  const hechas = new Set(filasPrevias.filter((f) => f.estado === 'ok').map((f) => `${f.owner_role}|${f.handle}|${f.post_id}`))
  // un video que ya falló con ESTA misma dirección no se vuelve a intentar cada día (la dirección cambia cuando el actor la renueva)
  const fallidasConEstaUrl = new Set(filasPrevias.filter((f) => f.estado === 'no_bajo' && f.fuente_url).map((f) => `${f.owner_role}|${f.handle}|${f.post_id}|${f.fuente_url}`))
  const huellas = new Set(filasPrevias.filter((f) => f.estado === 'ok' && f.hash_archivo).map((f) => String(f.hash_archivo)))

  const max = a.max ?? MAX_VIDEOS_POR_CORRIDA
  let intentados = 0
  for (const c of a.candidatos) {
    const clave = `${c.rol}|${c.handle}|${c.post_id}`
    if (hechas.has(clave)) { res.ya_estaban++; continue }
    if (fallidasConEstaUrl.has(`${clave}|${c.url.slice(0, 1000)}`)) { res.ya_fallaron++; continue }
    if (intentados >= max || reloj() > limite) { res.omitidos_por_tope++; continue }
    intentados++
    const fila = (extra: Record<string, unknown>) => ({ client_id: a.clientId, owner_role: c.rol, handle: c.handle, post_id: c.post_id, tipo: c.tipo, caption: c.caption, posted_at: c.posted_at, post_url: c.post_url, fuente_url: c.url.slice(0, 1000), duracion_s: c.duracion_s, transcripcion: c.transcripcion, metricas: c.metricas, ...extra })
    const declarar = async (causa: string) => {
      res.fallidos.push({ post_id: c.post_id, causa })
      await traer(`${base}/rest/v1/client_videos?on_conflict=client_id,owner_role,handle,post_id`, { method: 'POST', headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(fila({ estado: 'no_bajo', causa: causa.slice(0, 300), path: null, bytes: null, hash_archivo: null })) }).catch(() => undefined)
    }
    try {
      const r = await traer(c.url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'video/*,*/*' }, signal: AbortSignal.timeout(MS_DE_DESCARGA) })
      if (!r.ok) { await declarar(`HTTP ${r.status}`); continue }
      const largo = Number(r.headers.get('content-length') ?? 0)
      if (largo > MAX_BYTES_DE_VIDEO) { await declarar(`demasiado grande · ${largo} B`); continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > MAX_BYTES_DE_VIDEO) { await declarar(`demasiado grande · ${buf.length} B`); continue }
      const firma = firmaDeVideo(buf)
      if (!firma) { await declarar(`no es un video (empieza con ${buf.subarray(0, 4).toString('hex')})`); continue }
      const hash = sha256(buf)
      if (huellas.has(hash)) { res.ya_estaban++; continue }
      huellas.add(hash)
      const ruta = `${a.clientId}/${c.rol}/${c.handle}/${c.post_id}.${firma.ext}`
      const sube = await traer(`${base}/storage/v1/object/${BUCKET_DE_VIDEOS}/${ruta}`, { method: 'POST', headers: { ...auth, 'content-type': firma.ct, 'x-upsert': 'true' }, body: new Uint8Array(buf) })
      if (!sube.ok) { await declarar(`subida rechazada · HTTP ${sube.status} ${(await sube.text().catch(() => '')).slice(0, 80)}`); continue }
      const cap = await capturarMomentos({ bytes: buf, ext: firma.ext, duracion: c.duracion_s, ffmpeg: a.ffmpeg, ejecutar: a.ejecutar })
      const id = randomUUID()
      const w = await traer(`${base}/rest/v1/client_videos?on_conflict=client_id,owner_role,handle,post_id`, { method: 'POST', headers: { ...json, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(fila({ id, estado: 'ok', causa: null, path: ruta, bytes: buf.length, hash_archivo: hash, duracion_s: cap.duracion_s ?? c.duracion_s })) })
      if (!w.ok) { res.fallidos.push({ post_id: c.post_id, causa: `la tabla de videos respondió HTTP ${w.status}` }); continue }
      const guardada = ((await w.json()) as Array<{ id: string }>)[0]
      const videoId = guardada?.id ?? id
      res.guardados++; res.bytes += buf.length
      res.por_tipo[c.tipo] = (res.por_tipo[c.tipo] ?? 0) + 1
      res.por_origen[c.rol] = (res.por_origen[c.rol] ?? 0) + 1
      if (!cap.capturas.length) res.sin_capturas.push({ post_id: c.post_id, causa: cap.causa ?? 'sin capturas' })
      const sub = await subirCapturas({ traer, base, auth, json, clientId: a.clientId, v: { rol: c.rol, handle: c.handle, post_id: c.post_id, caption: c.caption, posted_at: c.posted_at, post_url: c.post_url }, videoId, capturas: cap.capturas })
      res.capturas += sub.guardadas
      if (sub.error) res.sin_capturas.push({ post_id: c.post_id, causa: sub.error })
    } catch (e) {
      await declarar((e instanceof Error ? e.message : String(e)).slice(0, 120))
    }
  }
  return res
}

/** firma (1 hora) la dirección de un archivo del almacén privado; null si no se pudo */
export function firmarVideoDelEntorno(o?: { urlDeLaBase?: string; llave?: string; fetchImpl?: Traer; segundos?: number }): (path: string) => Promise<string | null> {
  const base = (o?.urlDeLaBase ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const llave = o?.llave ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const traer: Traer = o?.fetchImpl ?? ((u, i) => fetch(u, i))
  return async (path) => {
    if (!base || !llave) return null
    const r = await traer(`${base}/storage/v1/object/sign/${BUCKET_DE_VIDEOS}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: o?.segundos ?? 3600 }) })
    if (!r.ok) return null
    const j = (await r.json().catch(() => null)) as { signedURL?: string } | null
    return j?.signedURL ? `${base}/storage/v1${j.signedURL.startsWith('/') ? '' : '/'}${j.signedURL}` : null
  }
}

type Auth = Record<string, string>
/** sube las capturas de un video al almacén de fotos y las inscribe enlazadas por video_id */
async function subirCapturas(a: { traer: Traer; base: string; auth: Auth; json: Auth; clientId: string; v: { rol: string; handle: string; post_id: string; caption: string | null; posted_at: string | null; post_url: string | null }; videoId: string; capturas: Captura[] }): Promise<{ guardadas: number; error?: string }> {
  const filasFotos: Array<Record<string, unknown>> = []
  for (const k of a.capturas) {
    const rutaFoto = `${a.clientId}/${a.v.rol}/${a.v.handle}/${a.v.post_id}-f${k.n}.jpg`
    const f = await a.traer(`${a.base}/storage/v1/object/${BUCKET_DE_FOTOS}/${rutaFoto}`, { method: 'POST', headers: { ...a.auth, 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: new Uint8Array(k.bytes) })
    if (!f.ok) continue
    // la base solo admite posición «hijo-N» y medio «video» (restricciones csi_posicion_valida / csi_medio_valido)
    filasFotos.push({ client_id: a.clientId, owner_role: a.v.rol, handle: a.v.handle, post_id: `${a.v.post_id}-f${k.n}`, tipo: 'video_captura', url: `${a.base}/storage/v1/object/public/${BUCKET_DE_FOTOS}/${rutaFoto}`, estado: 'ok', causa: null, caption: a.v.caption, posted_at: a.v.posted_at, post_url: a.v.post_url, posicion: `hijo-${k.n}`, medio: 'video', hash_archivo: sha256(k.bytes), video_id: a.videoId })
  }
  if (!filasFotos.length) return { guardadas: 0, error: a.capturas.length ? 'no subió ninguna captura' : undefined }
  const fw = await a.traer(`${a.base}/rest/v1/client_social_images?on_conflict=client_id,owner_role,handle,post_id`, { method: 'POST', headers: { ...a.json, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(filasFotos) })
  return fw.ok ? { guardadas: filasFotos.length } : { guardadas: 0, error: `la tabla de fotos respondió HTTP ${fw.status}` }
}

/** videos ya guardados que no tienen capturas (el servidor no tenía ffmpeg, o una captura falló): se releen de nuestro almacén y se les sacan */
export async function completarCapturas(a: { clientId: string; urlDeLaBase: string; llave: string; fetchImpl?: Traer; max?: number; ffmpeg?: string | null; ejecutar?: Ejecutar }): Promise<{ revisados: number; completados: number; capturas: number; fallidos: Array<{ post_id: string; causa: string }> }> {
  const res = { revisados: 0, completados: 0, capturas: 0, fallidos: [] as Array<{ post_id: string; causa: string }> }
  if (!a.llave || !a.urlDeLaBase) return res
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const base = a.urlDeLaBase.replace(/\/$/, '')
  const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
  const json = { ...auth, 'content-type': 'application/json' }
  const cid = encodeURIComponent(a.clientId)
  const [vs, cs] = await Promise.all([
    traer(`${base}/rest/v1/client_videos?client_id=eq.${cid}&estado=eq.ok&select=id,owner_role,handle,post_id,path,duracion_s,caption,posted_at,post_url&limit=2000`, { headers: auth }),
    traer(`${base}/rest/v1/client_social_images?client_id=eq.${cid}&tipo=eq.video_captura&select=video_id&limit=5000`, { headers: auth }),
  ])
  if (!vs.ok || !cs.ok) return res
  const conCapturas = new Set(((await cs.json()) as Array<{ video_id: string | null }>).map((x) => x.video_id))
  const faltan = ((await vs.json()) as Array<{ id: string; owner_role: string; handle: string; post_id: string; path: string | null; duracion_s: number | null; caption: string | null; posted_at: string | null; post_url: string | null }>).filter((v) => v.path && !conCapturas.has(v.id)).slice(0, a.max ?? 3)
  for (const v of faltan) {
    res.revisados++
    try {
      const r = await traer(`${base}/storage/v1/object/${BUCKET_DE_VIDEOS}/${v.path!.split('/').map(encodeURIComponent).join('/')}`, { headers: auth })
      if (!r.ok) { res.fallidos.push({ post_id: v.post_id, causa: `HTTP ${r.status} al leer el archivo` }); continue }
      const bytes = Buffer.from(await r.arrayBuffer())
      const firma = firmaDeVideo(bytes)
      if (!firma) { res.fallidos.push({ post_id: v.post_id, causa: 'el archivo guardado no es un video' }); continue }
      const cap = await capturarMomentos({ bytes, ext: firma.ext, duracion: v.duracion_s, ffmpeg: a.ffmpeg, ejecutar: a.ejecutar })
      if (!cap.capturas.length) { res.fallidos.push({ post_id: v.post_id, causa: cap.causa ?? 'sin capturas' }); continue }
      const sub = await subirCapturas({ traer, base, auth, json, clientId: a.clientId, v: { rol: v.owner_role, handle: v.handle, post_id: v.post_id, caption: v.caption, posted_at: v.posted_at, post_url: v.post_url }, videoId: v.id, capturas: cap.capturas })
      if (sub.error) { res.fallidos.push({ post_id: v.post_id, causa: sub.error }); continue }
      res.completados++; res.capturas += sub.guardadas
    } catch (e) { res.fallidos.push({ post_id: v.post_id, causa: (e instanceof Error ? e.message : String(e)).slice(0, 100) }) }
  }
  return res
}
