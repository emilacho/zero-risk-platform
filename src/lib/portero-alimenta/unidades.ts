/**
 * UNIDADES · de las filas crudas de `apify_raw` a «cosas sueltas» que se pueden juzgar una por una. PURO, agnóstico.
 * Una unidad es la parte más chica que tiene sentido archivar con su fecha y su fuente:
 *   · de un SITIO / página de reparto: cada línea duradera (y cada línea de la carta/precio que está en `metadata`);
 *   · de una ficha de MAPAS: cada campo (dirección, teléfono, horario canónico…);
 *   · de Instagram: la biografía (atributo) y cada publicación (acumula);
 *   · de reseñas, comentarios, artículos y menciones: cada elemento (acumula; dato de un TERCERO);
 * `clase_dato` dice cómo se trata un cambio: `atributo` (precio, horario, dirección…: un dato nuevo puede REEMPLAZAR al vigente del mismo atributo)
 * o `acumula` (publicaciones, reseñas, menciones…: se SUMAN con fecha). La decisión final la razona el modelo; esto solo propone la clave.
 */
import { createHash } from 'node:crypto'
import { normalizar } from '../manual/texto'
import { MONEDAS } from './datos'
import { contenidoDeInstagram, contenidoDeMapas, contenidoDeSitio, esTransitoria, type FichaDeMapas, type PerfilRaspado } from '../cerebro/diario/huella'
import { clasificarLinea, type ClaseDeLinea } from '../cerebro/diario/comparar'
import { textosDeResenas } from '../manual/materia'

export type FuenteDeUnidad = 'sitio' | 'reparto' | 'instagram' | 'mapas' | 'resenas' | 'comentarios' | 'articulo' | 'mencion' | 'publicaciones_facebook' | 'videos'
export type ClaseDeDato = 'atributo' | 'acumula'
/** de quién es lo que se leyó: propio (su sitio, su cuenta, su ficha) o de un tercero (reseñas, comentarios, artículos, menciones) */
export type Autoria = 'propia' | 'tercero'

export interface Unidad {
  fuente: FuenteDeUnidad
  /** dirección de la página, usuario o ficha de donde sale */
  ref: string
  /** identificador estable de la unidad DENTRO de la fuente (línea normalizada, código de publicación, id de reseña…) */
  unidad_ref: string
  texto: string
  clase_dato: ClaseDeDato
  /** clave del atributo (p. ej. «precio:limpieza dental», «mapas:horario»); null si acumula */
  atributo: string | null
  clase_de_linea?: ClaseDeLinea
  autoria: Autoria
  huella: string
  fecha_fuente: string | null
  apify_raw_id: string
  observado_en: string
  url?: string | null
  /** la unidad sale de la ficha, la cuenta o la publicación PROPIA del cliente (reseñas de su ficha de Mapas, comentarios de sus publicaciones): es de un tercero, pero es SOBRE el cliente por construcción */
  de_ficha_propia?: boolean
}

export interface FilaCruda { id: string; apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null; created_at: string; metadata?: unknown }

export const huellaDeTexto = (t: string): string => createHash('sha256').update(normalizar(t)).digest('hex').slice(0, 24)
const arr = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const MONEDAS_SET = new Set(MONEDAS)

/** la clave de atributo de una línea normalizada: sus palabras que NO son cifras ni monedas ni «precio» (el producto o el concepto) */
export function claveDeAtributo(lineaNormalizada: string, clase: ClaseDeLinea): string | null {
  if (clase !== 'precio' && clase !== 'horario') return null
  const palabras = lineaNormalizada.split(' ').filter((p) => p && !/\d/.test(p) && !MONEDAS_SET.has(p) && !['precio', 'costo', 'valor', 'tarifa', 'desde', 'por', 'mes', 'de', 'a', 'y', 'el', 'la'].includes(p) && !p.startsWith('$'))
  const nucleo = palabras.slice(0, 6).join(' ')
  return nucleo ? `${clase}:${nucleo}` : null
}

export interface OpcionesDeUnidades { propios: { sitio?: string | null; handles: string[] }; hostsDeReparto?: string[]; transitorios?: RegExp[] }
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

/** la fila más NUEVA de cada (función, objetivo) manda; los ensayos jamás */
export function unidadesDeRaspados(filas: FilaCruda[], o: OpcionesDeUnidades): Unidad[] {
  const out = new Map<string, Unidad>()
  const poner = (u: Unidad) => { const k = `${u.fuente}|${u.ref}|${u.unidad_ref}`; if (!out.has(k)) out.set(k, u) }
  const orden = [...filas].filter((f) => f.ensayo !== true).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  const reparto = new Set((o.hostsDeReparto ?? []).map((h) => h.toLowerCase()))
  const base = (f: FilaCruda) => ({ apify_raw_id: String(f.id), observado_en: f.created_at })
  const llamadoPor = (f: FilaCruda): string => txt((f.metadata as { llamado_por?: unknown } | undefined)?.llamado_por)
  const misHandles = new Set(o.propios.handles.map((h) => h.toLowerCase().replace(/^@/, '')))

  for (const f of orden) {
    if (f.apify_function === 'website_content_scraper') {
      // el Servicio guarda SOLO `calling_workflow_id` como `llamado_por`: el flujo marca la segunda tanda con el sufijo «#articulo»
      const esArticulo = llamadoPor(f).includes('#articulo')
      for (const p of arr(f.respuesta)) {
        const url = txt(p.url)
        const host = hostDe(url)
        if (!url) continue
        if (esArticulo) {
          const t = normalizar(txt(p.text)).slice(0, 4000)
          if (t.length >= 120) poner({ ...base(f), fuente: 'articulo', ref: url, unidad_ref: huellaDeTexto(url), texto: t, clase_dato: 'acumula', atributo: null, autoria: 'tercero', huella: huellaDeTexto(t), fecha_fuente: null, url })
          continue
        }
        const fuente: FuenteDeUnidad | null = o.propios.sitio && host === hostDe(o.propios.sitio) ? 'sitio' : reparto.has(host) ? 'reparto' : null
        if (!fuente) continue
        const c = contenidoDeSitio([{ url, text: p.text }], o.transitorios, p.metadata)
        for (const l of c.lineas) {
          const clase = clasificarLinea(l, o.transitorios)
          if (clase === 'transitorio') continue
          const atributo = claveDeAtributo(l, clase)
          poner({ ...base(f), fuente, ref: url, unidad_ref: l, texto: l, clase_dato: atributo ? 'atributo' : 'acumula', atributo, clase_de_linea: clase, autoria: 'propia', huella: huellaDeTexto(l), fecha_fuente: null, url })
        }
      }
    } else if (f.apify_function === 'own_google_maps_profile') {
      const it = arr(f.respuesta)[0]
      if (!it) continue
      for (const [campo, valor] of Object.entries(contenidoDeMapas(it as FichaDeMapas).campos)) {
        poner({ ...base(f), fuente: 'mapas', ref: 'mapas', unidad_ref: campo, texto: `${campo} ${valor}`, clase_dato: 'atributo', atributo: `mapas:${campo}`, autoria: 'propia', huella: huellaDeTexto(valor), fecha_fuente: null })
      }
      // reseñas que trae la misma ficha (D-2: sin datos personales)
      for (const r of arr(it.reviews)) {
        for (const t of textosDeResenas(r)) {
          const id = txt(r.reviewId) || txt(r.id) || huellaDeTexto(t)
          poner({ ...base(f), fuente: 'resenas', ref: 'mapas', unidad_ref: id, texto: normalizar(t).slice(0, 1500), clase_dato: 'acumula', atributo: null, autoria: 'tercero', de_ficha_propia: true, huella: huellaDeTexto(t), fecha_fuente: txt(r.publishedAtDate) || null })
        }
      }
    } else if (f.apify_function === 'instagram_scraper') {
      for (const it of arr(f.respuesta)) {
        const c = contenidoDeInstagram(it as PerfilRaspado)
        if (!c.usuario || !misHandles.has(c.usuario)) continue
        if (c.biografia) poner({ ...base(f), fuente: 'instagram', ref: `@${c.usuario}`, unidad_ref: 'bio', texto: c.biografia, clase_dato: 'atributo', atributo: 'instagram:bio', autoria: 'propia', huella: huellaDeTexto(c.biografia), fecha_fuente: null })
        for (const p of c.publicaciones) poner({ ...base(f), fuente: 'instagram', ref: `@${c.usuario}`, unidad_ref: p.id, texto: p.texto, clase_dato: 'acumula', atributo: null, autoria: 'propia', huella: huellaDeTexto(p.texto), fecha_fuente: null, url: `https://www.instagram.com/p/${p.id}/` })
      }
    } else if (/^resenas_/.test(f.apify_function)) {
      for (const it of arr(f.respuesta)) {
        for (const t of textosDeResenas(it)) {
          const id = txt(it.reviewId) || txt(it.id) || huellaDeTexto(t)
          poner({ ...base(f), fuente: 'resenas', ref: f.apify_function, unidad_ref: id, texto: normalizar(t).slice(0, 1500), clase_dato: 'acumula', atributo: null, autoria: 'tercero', de_ficha_propia: true, huella: huellaDeTexto(t), fecha_fuente: txt(it.publishedAtDate) || txt(it.date) || null })
        }
      }
    } else if (f.apify_function === 'instagram_post_comments_scraper' || f.apify_function === 'youtube_comments_scraper') {
      for (const it of arr(f.respuesta)) {
        const t = normalizar(txt(it.text) || txt(it.comment)).slice(0, 800)
        if (t.length >= 9) poner({ ...base(f), fuente: 'comentarios', ref: f.apify_function, unidad_ref: txt(it.id) || huellaDeTexto(t), texto: t, clase_dato: 'acumula', atributo: null, autoria: 'tercero', de_ficha_propia: true, huella: huellaDeTexto(t), fecha_fuente: txt(it.timestamp) || null })
      }
    } else if (f.apify_function === 'publicaciones_facebook') {
      for (const it of arr(f.respuesta)) {
        const t = normalizar(txt(it.text) || txt(it.message)).slice(0, 1500)
        if (t.length >= 9) poner({ ...base(f), fuente: 'publicaciones_facebook', ref: 'facebook', unidad_ref: txt(it.postId) || huellaDeTexto(t), texto: t, clase_dato: 'acumula', atributo: null, autoria: 'propia', huella: huellaDeTexto(t), fecha_fuente: txt(it.time) || null, url: txt(it.url) || null })
      }
    } else if (/^videos_/.test(f.apify_function)) {
      for (const it of arr(f.respuesta)) {
        const t = normalizar(txt(it.transcript) || txt(it.caption) || txt(it.text)).slice(0, 2500)
        if (t.length >= 20) poner({ ...base(f), fuente: 'videos', ref: f.apify_function, unidad_ref: txt(it.id) || txt(it.shortCode) || huellaDeTexto(t), texto: t, clase_dato: 'acumula', atributo: null, autoria: 'propia', huella: huellaDeTexto(t), fecha_fuente: txt(it.timestamp) || null, url: txt(it.url) || null })
      }
    } else if (f.apify_function === 'menciones_en_redes') {
      for (const it of arr(f.respuesta)) {
        const t = normalizar(txt(it.caption) || txt(it.text)).slice(0, 1500)
        if (t.length >= 9) poner({ ...base(f), fuente: 'mencion', ref: 'redes', unidad_ref: txt(it.id) || txt(it.shortCode) || huellaDeTexto(t), texto: t, clase_dato: 'acumula', atributo: null, autoria: 'tercero', huella: huellaDeTexto(t), fecha_fuente: txt(it.timestamp) || null, url: txt(it.url) || null })
      }
    }
  }
  return [...out.values()]
}
export { esTransitoria }
