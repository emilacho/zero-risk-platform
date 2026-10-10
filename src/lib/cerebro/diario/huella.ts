/**
 * LA HUELLA · qué campos de lo raspado CUENTAN para decir «cambió» (C1 de CC#3). PURO, agnóstico (ni clientes, ni ciudades, ni rubros).
 *
 *  · Instagram: SOLO el texto (biografía y leyenda de cada publicación). Me gusta, comentarios, vistas y seguidores cambian todos los días y NO cuentan.
 *  · Sitio: SOLO las líneas de texto DURADERAS de cada página. Los avisos de estado («cerrado, vuelve hoy…») son TRANSITORIOS y no cuentan.
 *  · Mapas: SOLO los campos de la ficha (nombre, categoría, dirección, teléfono, sitio, horario). Puntaje y conteo de reseñas no cuentan.
 *  · Reparto: como el sitio.
 * La lista de transitorios es un DATO por idioma (se amplía sin tocar la lógica).
 */
import crypto from 'node:crypto'
import { normalizar } from '../../manual/texto'

/** líneas de estado que cambian solas (sobre texto NORMALIZADO: minúsculas, sin tildes) */
export const TRANSITORIOS_ES: RegExp[] = [
  /^(abierto|cerrado)\b/,
  /\bvuelve (hoy|manana|pasado manana|el \w+)\b/,
  /\b(abre|abrimos|cierra|cerramos) (hoy|manana|ahora|a las)\b/,
  /\b(abierto|cerrado) (ahora|hoy)\b/,
  /\bultima actualizacion\b/,
  /\bproximo (turno|horario)\b/,
]
const MIN_LARGO_DE_LINEA = 9

export type Fuente = 'sitio' | 'instagram' | 'mapas' | 'reparto' | 'resenas' | 'comentarios'
export interface LineasDePagina { duraderas: string[]; transitorias: string[] }

export const esTransitoria = (lineaNormalizada: string, patrones: RegExp[] = TRANSITORIOS_ES): boolean => patrones.some((r) => r.test(lineaNormalizada))

/** las líneas de un texto, normalizadas, sin repetir, separadas en duraderas y transitorias */
export function lineasDeTexto(texto: string, patrones: RegExp[] = TRANSITORIOS_ES): LineasDePagina {
  const vistas = new Set<string>()
  const out: LineasDePagina = { duraderas: [], transitorias: [] }
  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const n = normalizar(cruda)
    if (n.length < MIN_LARGO_DE_LINEA || vistas.has(n)) continue
    vistas.add(n)
    ;(esTransitoria(n, patrones) ? out.transitorias : out.duraderas).push(n)
  }
  return out
}

export const sha = (t: string): string => crypto.createHash('sha256').update(t).digest('hex').slice(0, 24)

/** huella de un conjunto de líneas duraderas: no depende del orden */
export const huellaDeLineas = (duraderas: string[]): string => sha([...new Set(duraderas)].sort().join('\n'))

// ───────────────────────── sitio
export interface PaginaRaspada { url: string; text?: unknown }
export interface ContenidoDeSitio { lineas: string[]; transitorias: string[] }
export function contenidoDeSitio(paginas: PaginaRaspada[], patrones: RegExp[] = TRANSITORIOS_ES): ContenidoDeSitio {
  const l = lineasDeTexto(paginas.map((p) => String(p.text ?? '')).join('\n'), patrones)
  return { lineas: l.duraderas, transitorias: l.transitorias }
}

// ───────────────────────── Instagram (solo texto)
export interface PublicacionRaspada { shortCode?: unknown; id?: unknown; caption?: unknown; ownerUsername?: unknown; [otro: string]: unknown }
export interface PerfilRaspado { username?: unknown; biography?: unknown; latestPosts?: PublicacionRaspada[]; [otro: string]: unknown }
export interface ContenidoDeInstagram { usuario: string; biografia: string; publicaciones: Array<{ id: string; texto: string }> }
const txt = (x: unknown): string => (typeof x === 'string' ? x : '')
/** solo la biografía y las leyendas de las publicaciones DE LA PROPIA cuenta; nada numérico entra */
export function contenidoDeInstagram(perfil: PerfilRaspado): ContenidoDeInstagram {
  const u = txt(perfil.username).toLowerCase()
  const pubs = (Array.isArray(perfil.latestPosts) ? perfil.latestPosts : [])
    .filter((p) => !txt(p.ownerUsername) || txt(p.ownerUsername).toLowerCase() === u)
    .map((p) => ({ id: txt(p.shortCode) || txt(p.id), texto: normalizar(txt(p.caption)) }))
    .filter((p) => p.id && p.texto)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { usuario: u, biografia: normalizar(txt(perfil.biography)), publicaciones: pubs }
}
export const huellaDeInstagram = (c: ContenidoDeInstagram): string => sha(JSON.stringify([c.biografia, c.publicaciones.map((p) => [p.id, p.texto])]))
/** líneas comparables de un perfil: la biografía y cada leyenda como una línea (prefijadas para saber de dónde salen) */
export const lineasDeInstagram = (c: ContenidoDeInstagram): string[] => [...(c.biografia ? [`bio ${c.biografia}`] : []), ...c.publicaciones.map((p) => `${p.id} ${p.texto}`)]

// ───────────────────────── Mapas (solo la ficha)
export interface FichaDeMapas { title?: unknown; categoryName?: unknown; address?: unknown; city?: unknown; phone?: unknown; website?: unknown; openingHours?: unknown; [otro: string]: unknown }
export interface ContenidoDeMapas { campos: Record<string, string> }
export function contenidoDeMapas(item: FichaDeMapas): ContenidoDeMapas {
  const campos: Record<string, string> = {}
  const poner = (k: string, v: unknown) => { const t = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v); const n = normalizar(t); if (n) campos[k] = n }
  poner('nombre', item.title); poner('categoria', item.categoryName); poner('direccion', item.address); poner('ciudad', item.city); poner('telefono', item.phone); poner('sitio', item.website)
  poner('horario', item.openingHours)
  return { campos }
}
export const huellaDeMapas = (c: ContenidoDeMapas): string => sha(JSON.stringify(Object.entries(c.campos).sort(([a], [b]) => (a < b ? -1 : 1))))
export const lineasDeMapas = (c: ContenidoDeMapas): string[] => Object.entries(c.campos).map(([k, v]) => `${k} ${v}`)
