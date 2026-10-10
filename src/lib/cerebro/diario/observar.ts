/**
 * OBSERVAR · de las filas crudas de `apify_raw` a «lo último visto de cada fuente PROPIA». PURO.
 *  · solo lo PROPIO (`esFilaPropia` de la revisión del manual: el sitio por dirección, las redes por usuario, Mapas por el nombre de la función); sin rótulo propio explícito, es ajeno y no entra;
 *  · filas de ensayo (`ensayo = true`) jamás;
 *  · la fila más NUEVA de cada (fuente, ref) manda;
 *  · reseñas y comentarios: SOLO señales agregadas; su texto no sale de aquí.
 */
import { esFilaPropia, type FilaDeRaspado, type Propios } from '../../manual/materia'
import { contenidoDeInstagram, contenidoDeMapas, contenidoDeSitio, huellaDeInstagram, huellaDeLineas, huellaDeMapas, lineasDeInstagram, lineasDeMapas, sha, type Fuente, type FichaDeMapas, type PerfilRaspado } from './huella'
import { frasePorComentarios, frasePorSenales, senalesDeComentarios, senalesDeResenas, type SenalesDeComentarios, type SenalesDeResenas } from './resenas'

export interface FilaCruda extends FilaDeRaspado { created_at: string }
export interface Observacion {
  fuente: Fuente
  ref: string
  huella: string
  contenido: Record<string, unknown>
  lineas: string[]
  raw_id: string
  observado_en: string
  senales?: SenalesDeResenas | SenalesDeComentarios
}
export interface ContextoDeObservacion { propios: Propios; hostsDeReparto?: string[]; publicacionesPropias?: string[] }

const arr = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

export function observar(filas: FilaCruda[], ctx: ContextoDeObservacion): Observacion[] {
  const out = new Map<string, Observacion>()
  const poner = (o: Observacion) => { const k = `${o.fuente}|${o.ref}`; if (!out.has(k)) out.set(k, o) } // la primera vista (la más nueva) manda
  const orden = [...filas].filter((f) => f.ensayo !== true).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  const reparto = new Set((ctx.hostsDeReparto ?? []).map((h) => h.toLowerCase()))
  const misCodigos = new Set(ctx.publicacionesPropias ?? [])
  for (const f of orden) {
    const base = { raw_id: String(f.id), observado_en: f.created_at }
    if (f.apify_function === 'website_content_scraper') {
      for (const p of arr(f.respuesta)) {
        const url = String(p.url ?? '')
        const host = hostDe(url)
        const fuente: Fuente | null = ctx.propios.sitio && host === hostDe(ctx.propios.sitio) ? 'sitio' : reparto.has(host) ? 'reparto' : null
        if (!fuente || !url) continue
        const c = contenidoDeSitio([{ url, text: p.text }])
        poner({ ...base, fuente, ref: url, huella: huellaDeLineas(c.lineas), contenido: { lineas: c.lineas, transitorias: c.transitorias }, lineas: c.lineas })
      }
    } else if (f.apify_function === 'instagram_scraper' && esFilaPropia(f, ctx.propios)) {
      for (const it of arr(f.respuesta)) {
        const c = contenidoDeInstagram(it as PerfilRaspado)
        if (!c.usuario) continue
        poner({ ...base, fuente: 'instagram', ref: `@${c.usuario}`, huella: huellaDeInstagram(c), contenido: { ...c }, lineas: lineasDeInstagram(c) })
      }
    } else if (f.apify_function === 'own_google_maps_profile') {
      const it = arr(f.respuesta)[0]
      if (!it) continue
      const c = contenidoDeMapas(it as FichaDeMapas)
      poner({ ...base, fuente: 'mapas', ref: 'mapas', huella: huellaDeMapas(c), contenido: { ...c }, lineas: lineasDeMapas(c) })
      if (Array.isArray(it.reviews) && it.reviews.length) {
        const s = senalesDeResenas(it.reviews as never[])
        poner({ ...base, fuente: 'resenas', ref: 'mapas', huella: sha(JSON.stringify(s)), contenido: { senales: s }, lineas: [frasePorSenales(s)], senales: s })
      }
    } else if (f.apify_function === 'instagram_post_comments_scraper') {
      // solo si TODAS las publicaciones pedidas son nuestras (si no, no se sabe de quién son los comentarios)
      const pedidas = JSON.stringify((f.params as { directUrls?: unknown } | undefined)?.directUrls ?? [])
      const codigos = [...pedidas.matchAll(/instagram\.com\/(?:p|reel)\/([^/?#"\\]+)/gi)].map((m) => m[1])
      if (!codigos.length || !codigos.every((c) => misCodigos.has(c))) continue
      const s = senalesDeComentarios(arr(f.respuesta).map((c) => c.text))
      poner({ ...base, fuente: 'comentarios', ref: 'publicaciones_propias', huella: sha(JSON.stringify(s)), contenido: { senales: s }, lineas: [frasePorComentarios(s)], senales: s })
    }
  }
  return [...out.values()]
}

/** códigos de las publicaciones propias vigiladas (de la última observación de Instagram) */
export function codigosDePublicaciones(instagram: Array<{ contenido: unknown }>): string[] {
  const out: string[] = []
  for (const o of instagram) for (const p of arr((o.contenido as { publicaciones?: unknown } | null)?.publicaciones)) if (typeof p.id === 'string' && p.id) out.push(p.id)
  return [...new Set(out)]
}
