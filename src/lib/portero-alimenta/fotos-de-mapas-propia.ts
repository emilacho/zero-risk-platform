/**
 * LAS FOTOS DE LA FICHA PROPIA DE MAPAS · 31-oct (guardar todo, parte 2)
 * Una búsqueda por nombre devuelve VARIAS fichas y casi siempre homónimos. Solo se copian las fotos de la ficha que `fichaPropiaDeMapas` confirma
 * como del cliente (nombre exacto en una de sus sedes, o confirmada por sí sola); si hay más de una candidata (ambigua) o ninguna, NO se copia nada.
 * Cada foto se guarda en nuestro almacén como `propio` / `maps_foto` y entra al etiquetado como cualquier otra. Nunca falla la corrida del portero: devuelve el motivo.
 */
import { createHash } from 'node:crypto'
import { fichaPropiaDeMapas, type FichaCruda } from './mapas-propia'
import type { ContextoDelCliente } from './filtro'

export const MAX_FOTOS_DE_LA_FICHA = 10
const BUCKET = 'client-social-images'

export interface ResultadoDeFotosDeMapas {
  estado: 'copiadas' | 'sin_ficha' | 'ambigua' | 'sin_fotos' | 'sin_base' | 'ya_estaban'
  detalle: string
  candidatas: number
  copiadas: number
  ya_estaban: number
  fallidas: Array<{ url: string; causa: string }>
}

type Traer = (url: string, init?: RequestInit) => Promise<Response>
const slug = (t: string, n: number) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n) || 'ficha'
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** las direcciones de foto de UNA ficha (la portada y la lista), sin repetidos y solo http(s) */
export function urlsDeFotosDeLaFicha(ficha: FichaCruda, max = MAX_FOTOS_DE_LA_FICHA): string[] {
  const out: string[] = []
  const vistas = new Set<string>()
  const mete = (v: unknown) => {
    if (typeof v !== 'string') return
    const u = v.trim()
    if (!/^https?:\/\/[^\s]+$/i.test(u) || u.length > 1500 || vistas.has(u)) return
    vistas.add(u)
    out.push(u)
  }
  mete(ficha.imageUrl)
  if (Array.isArray(ficha.imageUrls)) for (const v of ficha.imageUrls) mete(typeof v === 'object' && v ? (v as Record<string, unknown>).imageUrl : v)
  return out.slice(0, max)
}

/** tipo real por los primeros bytes (como el paso «revisar» del Servicio); null = no es una imagen que aceptemos */
export function tipoPorFirma(buf: Buffer): { ct: string; ext: string } | null {
  const h = buf.subarray(0, 4).toString('hex')
  if (h.startsWith('ffd8ff')) return { ct: 'image/jpeg', ext: 'jpg' }
  if (h === '89504e47') return { ct: 'image/png', ext: 'png' }
  if (h === '47494638') return { ct: 'image/gif', ext: 'gif' }
  if (h === '52494646' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ct: 'image/webp', ext: 'webp' }
  return null
}

export async function copiarFotosDeMapasPropia(a: {
  clientId: string
  fichasCrudas: FichaCruda[]
  ctx: ContextoDelCliente
  urlDeLaBase: string
  llave: string
  fetchImpl?: Traer
  max?: number
}): Promise<ResultadoDeFotosDeMapas> {
  const vacio = (estado: ResultadoDeFotosDeMapas['estado'], detalle: string, candidatas = 0): ResultadoDeFotosDeMapas => ({ estado, detalle, candidatas, copiadas: 0, ya_estaban: 0, fallidas: [] })
  const sel = fichaPropiaDeMapas(a.fichasCrudas, a.ctx)
  if (sel.ambigua) return vacio('ambigua', `hay ${sel.candidatas} fichas de Mapas que podrían ser del cliente: ambiguo, no se copian fotos (posible homónimo)`, sel.candidatas)
  if (!sel.ficha) return vacio('sin_ficha', 'ninguna ficha de Mapas se confirmó como del cliente: no se copian fotos ajenas')
  if (!a.llave || !a.urlDeLaBase) return vacio('sin_base', 'la base no está configurada en el servidor', 1)
  const ficha = sel.ficha
  const urls = urlsDeFotosDeLaFicha(ficha, a.max ?? MAX_FOTOS_DE_LA_FICHA)
  if (!urls.length) return vacio('sin_fotos', 'la ficha propia no trae fotos', 1)

  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const base = a.urlDeLaBase.replace(/\/$/, '')
  const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
  const titulo = String(ficha.title ?? 'ficha').slice(0, 120)
  const handle = `mapas-${slug(titulo, 40)}`
  const postUrl = typeof ficha.url === 'string' && /^https?:\/\//i.test(ficha.url) ? ficha.url : null
  const ref = slug(String(ficha.placeId ?? ficha.cid ?? titulo), 40)
  const res: ResultadoDeFotosDeMapas = { ...vacio('copiadas', '', 1) }

  // lo que ya se copió (por dirección de origen) no se vuelve a bajar cada día
  const idDe = (u: string) => `maps-${ref}-${sha256(Buffer.from(u)).slice(0, 12)}`
  const previas = await traer(`${base}/rest/v1/client_social_images?client_id=eq.${encodeURIComponent(a.clientId)}&owner_role=eq.propio&handle=eq.${encodeURIComponent(handle)}&tipo=eq.maps_foto&select=post_id,estado`, { headers: auth })
  const hechas = new Set<string>()
  if (previas.ok) for (const f of (await previas.json()) as Array<{ post_id?: string; estado?: string }>) if (f.estado === 'ok' && f.post_id) hechas.add(f.post_id)

  const filas: Array<Record<string, unknown>> = []
  let n = 0
  for (const u of urls) {
    n++
    const post_id = idDe(u)
    if (hechas.has(post_id)) { res.ya_estaban++; continue }
    try {
      const r = await traer(u, { headers: { 'user-agent': 'Mozilla/5.0' } })
      if (!r.ok) { res.fallidas.push({ url: u, causa: `HTTP ${r.status}` }); continue }
      const buf = Buffer.from(await r.arrayBuffer())
      const t = tipoPorFirma(buf)
      if (!t) { res.fallidas.push({ url: u, causa: 'no es una imagen' }); continue }
      if (buf.length > 10 * 1024 * 1024) { res.fallidas.push({ url: u, causa: `demasiado grande · ${buf.length} B` }); continue }
      const ruta = `${a.clientId}/propio/${handle}/${post_id}.${t.ext}`
      const sube = await traer(`${base}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'POST', headers: { ...auth, 'content-type': t.ct, 'x-upsert': 'true' }, body: new Uint8Array(buf) })
      if (!sube.ok) { res.fallidas.push({ url: u, causa: `subida rechazada · HTTP ${sube.status}` }); continue }
      filas.push({ client_id: a.clientId, owner_role: 'propio', handle, post_id, tipo: 'maps_foto', url: `${base}/storage/v1/object/public/${BUCKET}/${ruta}`, estado: 'ok', causa: null, caption: `Foto de la ficha de Google Maps · ${titulo}`.slice(0, 300), post_url: postUrl, posicion: n === 1 ? 'portada' : 'unica', medio: 'imagen', hash_archivo: sha256(buf) })
    } catch (e) {
      res.fallidas.push({ url: u, causa: (e instanceof Error ? e.message : String(e)).slice(0, 100) })
    }
  }
  if (filas.length) {
    const w = await traer(`${base}/rest/v1/client_social_images?on_conflict=client_id,owner_role,handle,post_id`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(filas) })
    if (!w.ok) return { ...res, estado: 'sin_base', detalle: `la tabla respondió HTTP ${w.status}` }
  }
  res.copiadas = filas.length
  res.estado = filas.length ? 'copiadas' : res.ya_estaban ? 'ya_estaban' : 'sin_fotos'
  res.detalle = `ficha «${titulo}» · ${urls.length} fotos: ${filas.length} copiadas, ${res.ya_estaban} ya estaban, ${res.fallidas.length} fallidas`
  return res
}
