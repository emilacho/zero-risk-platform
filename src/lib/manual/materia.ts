/**
 * R2 · NINGÚN RECORTE DE LA MATERIA PRIMA POR LA CABEZA NI EN SILENCIO. PURO.
 *
 * Convierte filas de raspado (`apify_raw`, solo `ensayo = false`) en (a) FUENTES completas para comprobar hechos y (b) la MATERIA ordenada y recortada POR BLOQUE
 * (con marcador visible) que ve el escritor. Lo propio se distingue de lo de competidores por los parámetros de la llamada y la ficha del cliente.
 */
import type { CanalDeFuente, Fuente, RolDeFuente } from './procedencia'
import { normalizar } from './texto'

export interface FilaDeRaspado { id: string; apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null }
export interface Propios { sitio?: string | null; handles: string[]; /** perfiles propios de otras redes (opcional) */ otros?: string[] }

const txt = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return normalizar(u) } }

/** ¿esta fila de raspado es del PROPIO cliente? (sitio por dirección; redes por usuario; mapas por el nombre de la función) */
export function esFilaPropia(f: Pick<FilaDeRaspado, 'apify_function' | 'params'>, propios: Propios): boolean {
  if (f.apify_function.startsWith('own_')) return true
  if (f.apify_function === 'website_content_scraper') {
    const url = txt((f.params as { url?: unknown } | undefined)?.url)
    return !!propios.sitio && !!url && hostDe(url) === hostDe(propios.sitio)
  }
  // M1-a · IGUALDAD EXACTA del usuario (nunca «contiene»): la fila es propia solo si TODOS sus objetivos reconocibles son del cliente
  const mios = misUsuarios(propios)
  const objetivos = objetivosDeLaFila(f.params)
  return objetivos.length > 0 && objetivos.every((o) => mios.has(o))
}

const misUsuarios = (propios: Propios): Set<string> => new Set([...propios.handles, ...(propios.otros ?? [])].map(usuarioDe).filter(Boolean))
/** usuario en minúsculas, sin arroba, desde un usuario suelto o desde una dirección de perfil; '' si es una publicación u otra cosa que no es un perfil */
function usuarioDe(x: unknown): string {
  const s = txt(x).trim()
  if (!s) return ''
  if (/^[a-z]+:\/\//i.test(s) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) {
    try {
      const partes = new URL(s.includes('://') ? s : `https://${s}`).pathname.split('/').filter(Boolean)
      if (!partes.length || ['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'hashtag'].includes(partes[0].toLowerCase())) return ''
      return partes[0].replace(/^@/, '').toLowerCase()
    } catch { return '' }
  }
  return s.replace(/^@/, '').toLowerCase()
}
function objetivosDeLaFila(params: unknown): string[] {
  const p = (params ?? {}) as Record<string, unknown>
  const crudos: unknown[] = []
  for (const k of ['usernames', 'username', 'directUrls', 'urls', 'profiles']) { const v = p[k]; if (Array.isArray(v)) crudos.push(...v); else if (v != null) crudos.push(v) }
  for (const s of arr<{ url?: unknown }>(p.startUrls)) crudos.push(typeof s === 'string' ? s : s?.url)
  const ya = crudos.map(usuarioDe)
  return crudos.length && ya.every(Boolean) ? ya : [] // un objetivo que no es un perfil (p. ej. una publicación) vuelve la fila «no propia»
}

function primerTitular(markdown: string): string {
  const m = /^#{1,2}[ \t]+(.+)$/m.exec(markdown) // la misma línea: un «# » vacío no se traga el texto que sigue
  return m ? m[1].trim() : ''
}

/** resumen en líneas de un bloque de datos estructurados (JSON-LD): solo lo que dice el sitio de sí mismo, sin volcar el JSON */
export function resumirEstructurado(jsonLd: unknown): string {
  const lineas: string[] = []
  const visitar = (n: unknown, d = 0): void => {
    if (d > 3 || n == null) return
    if (Array.isArray(n)) { n.forEach((x) => visitar(x, d + 1)); return }
    if (typeof n === 'string') { const t = n.trim(); if (t.startsWith('{') || t.startsWith('[')) { try { visitar(JSON.parse(t), d + 1) } catch { /* no es JSON */ } } return }
    if (typeof n !== 'object') return
    const o = n as Record<string, unknown>
    const tipo = txt(o['@type'])
    for (const k of ['name', 'description', 'telephone', 'servesCuisine', 'priceRange', 'slogan', 'foundingDate']) if (typeof o[k] === 'string' && o[k]) lineas.push(`${tipo ? tipo + ' · ' : ''}${k}: ${(o[k] as string).trim()}`)
    const dir = o.address as Record<string, unknown> | string | undefined
    if (dir) lineas.push(`dirección: ${typeof dir === 'string' ? dir : [dir.streetAddress, dir.addressLocality, dir.addressRegion, dir.addressCountry].filter(Boolean).join(', ')}`)
    const horas = o.openingHoursSpecification ?? o.openingHours
    if (horas) lineas.push(`horario: ${typeof horas === 'string' ? horas : JSON.stringify(horas).slice(0, 300)}`)
    for (const v of Object.values(o)) if (v && typeof v === 'object') visitar(v, d + 1)
  }
  visitar(jsonLd)
  return [...new Set(lineas)].join('\n')
}

/** FUENTES completas (sin recortar) para comprobar hechos: una por bloque lógico. Filas de ensayo y de terceros NO se mezclan con lo propio. */
export function fuentesDeRaspado(filas: FilaDeRaspado[], propios: Propios): Fuente[] {
  const out: Fuente[] = []
  const vistos = new Set<string>()
  const meter = (f: Omit<Fuente, 'id'> & { clave: string }) => {
    const clave = `${f.tipo}|${f.canal}|${f.rol}|${normalizar(f.url ?? '')}|${normalizar(f.texto)}`
    if (!f.texto.trim() || vistos.has(clave)) return
    vistos.add(clave)
    const { clave: _c, ...resto } = f
    void _c
    out.push({ ...resto, id: `raspado:${f.clave}:${out.length}` })
  }
  for (const fila of filas) {
    if (fila.ensayo === true) continue // datos sintéticos: jamás
    const filaPropia = esFilaPropia(fila, propios)
    const mios = misUsuarios(propios)
    for (const it of arr<Record<string, unknown>>(fila.respuesta)) {
      // a nivel de ítem: en una fila mixta, la cuenta del cliente es propia y la del otro es de terceros
      const propia = filaPropia || (fila.apify_function === 'instagram_scraper' && mios.has(usuarioDe(it.username)))
      const tipo = propia ? 'primaria_propia' : 'tercero'
      const mio = propia ? 'propio' : 'de terceros'
      if (fila.apify_function === 'website_content_scraper') {
        const url = txt(it.url)
        const meta = (it.metadata ?? {}) as Record<string, unknown>
        const canal: CanalDeFuente = 'sitio'
        meter({ clave: fila.id, tipo, canal, rol: 'titulo', rotulo: `sitio ${mio} · título · ${url}`, url, texto: [txt(meta.title), primerTitular(txt(it.markdown))].filter(Boolean).join('\n') })
        meter({ clave: fila.id, tipo, canal, rol: 'meta', rotulo: `sitio ${mio} · descripción · ${url}`, url, texto: txt(meta.description) })
        meter({ clave: fila.id, tipo, canal, rol: 'cuerpo', rotulo: `sitio ${mio} · ${url}`, url, texto: txt(it.text) })
        meter({ clave: fila.id, tipo, canal, rol: 'estructurado', rotulo: `sitio ${mio} · datos estructurados · ${url}`, url, texto: resumirEstructurado(meta.jsonLd) })
      } else if (fila.apify_function === 'instagram_scraper') {
        const u = txt(it.username)
        const canal: CanalDeFuente = 'instagram'
        meter({ clave: fila.id, tipo, canal, rol: 'biografia', rotulo: `Instagram ${mio} · biografía · @${u}`, url: u ? `https://instagram.com/${u}` : undefined, texto: [txt(it.biography), txt(it.fullName)].filter(Boolean).join('\n') })
        // solo las publicaciones de la propia cuenta (las que otros etiquetan no son del cliente)
        const propias = arr<{ caption?: unknown; ownerUsername?: unknown }>(it.latestPosts).filter((p) => !p.ownerUsername || txt(p.ownerUsername).toLowerCase() === u.toLowerCase())
        meter({ clave: fila.id, tipo, canal, rol: 'leyenda', rotulo: `Instagram ${mio} · publicaciones · @${u}`, texto: propias.map((p) => txt(p.caption)).filter(Boolean).join('\n\n') })
      } else if (fila.apify_function.includes('google_maps')) {
        const canal: CanalDeFuente = 'mapas'
        const partes = [it.title, it.categoryName, it.address, it.city, it.phone, it.website, typeof it.openingHours === 'string' ? it.openingHours : it.openingHours ? JSON.stringify(it.openingHours) : ''].map(txt).filter(Boolean)
        meter({ clave: fila.id, tipo, canal, rol: 'perfil', rotulo: `mapas ${mio} · perfil`, texto: partes.join('\n') })
      }
    }
  }
  return out
}

/** una fuente humana (campo del trato / ficha firmada): `texto` ya viene en prosa */
export const fuenteHumana = (id: string, rotulo: string, texto: string, canal: CanalDeFuente = 'alta'): Fuente => ({ id: `humana:${id}`, tipo: 'humana', canal, rol: 'dato', rotulo, texto })
/** una síntesis de agente (resumen del descubrimiento, documento de ICP…): sirve para DETECTAR dudas y para marcar `solo_sintesis`, jamás como respaldo */
export const fuenteDeSintesis = (id: string, rotulo: string, texto: string): Fuente => ({ id: `sintesis:${id}`, tipo: 'sintesis', canal: 'otro', rol: 'cuerpo', rotulo, texto })

// ───────────────────────── la MATERIA que ve el escritor
export const TOPES_POR_BLOQUE = { titulo_meta: 1500, portada: 4000, preguntas: 4000, nosotros: 3000, carta_servicios: 3000, otras_paginas: 3000, estructurado: 3000, instagram_propio: 4000, mapas_propios: 2000 } as const
export type NombreDeBloque = keyof typeof TOPES_POR_BLOQUE
const ORDEN: NombreDeBloque[] = ['titulo_meta', 'portada', 'preguntas', 'nosotros', 'carta_servicios', 'otras_paginas', 'estructurado', 'instagram_propio', 'mapas_propios']
const ROTULOS: Record<NombreDeBloque, string> = { titulo_meta: 'Título y descripción del sitio propio', portada: 'Portada del sitio propio', preguntas: 'Preguntas frecuentes del sitio propio', nosotros: 'Quiénes somos (sitio propio)', carta_servicios: 'Carta, productos o servicios (sitio propio)', otras_paginas: 'Otras páginas del sitio propio', estructurado: 'Datos estructurados del sitio propio (resumidos)', instagram_propio: 'Instagram propio', mapas_propios: 'Perfil propio en mapas' }

function bloqueDePagina(f: Fuente): NombreDeBloque {
  const p = (() => { try { return new URL(f.url ?? '').pathname.toLowerCase() } catch { return '' } })()
  if (p === '' || p === '/') return 'portada'
  if (/faq|pregunta|ayuda|dudas/.test(p)) return 'preguntas'
  if (/nosotros|quienes|about|historia|equipo|conoce/.test(p)) return 'nosotros'
  if (/carta|menu|servicio|producto|tienda|catalog|precio/.test(p)) return 'carta_servicios'
  return 'otras_paginas'
}

export interface Recorte { bloque: NombreDeBloque; leidos: number; total: number }
export interface BloqueDeMateria { bloque: NombreDeBloque; rotulo: string; texto: string; leidos: number; total: number; recortado: boolean }
export interface Materia { bloques: BloqueDeMateria[]; texto: string; recortes: Recorte[]; total_original: number; total_leido: number }

/** ordena POR CÓDIGO (no por posición), recorta POR BLOQUE y deja un marcador visible donde recorta. Solo entra lo propio. */
export function ordenarMateria(fuentes: Fuente[], topes: Partial<Record<NombreDeBloque, number>> = {}): Materia {
  const buckets = new Map<NombreDeBloque, string[]>()
  const poner = (b: NombreDeBloque, t: string) => { if (!t.trim()) return; (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(t.trim()) }
  for (const f of fuentes) {
    if (f.tipo !== 'primaria_propia') continue
    if (f.canal === 'sitio') {
      if (f.rol === 'titulo' || f.rol === 'meta') poner('titulo_meta', f.texto)
      else if (f.rol === 'estructurado') poner('estructurado', f.texto)
      else poner(bloqueDePagina(f), f.texto)
    } else if (f.canal === 'instagram') poner('instagram_propio', f.rol === 'biografia' ? `Biografía:\n${f.texto}` : `Publicaciones:\n${f.texto}`)
    else if (f.canal === 'mapas') poner('mapas_propios', f.texto)
  }
  const bloques: BloqueDeMateria[] = []
  const recortes: Recorte[] = []
  for (const b of ORDEN) {
    const partes = buckets.get(b)
    if (!partes?.length) continue
    const completo = partes.join('\n\n')
    const tope = topes[b] ?? TOPES_POR_BLOQUE[b]
    const recortado = completo.length > tope
    const texto = recortado ? `${completo.slice(0, tope)}\n[bloque recortado: se leyeron ${tope} de ${completo.length} caracteres]` : completo
    bloques.push({ bloque: b, rotulo: ROTULOS[b], texto, leidos: Math.min(tope, completo.length), total: completo.length, recortado })
    if (recortado) recortes.push({ bloque: b, leidos: tope, total: completo.length })
  }
  const total_original = bloques.reduce((a, x) => a + x.total, 0)
  const total_leido = bloques.reduce((a, x) => a + x.leidos, 0)
  return { bloques, texto: bloques.map((x) => `### ${x.rotulo}\n${x.texto}`).join('\n\n'), recortes, total_original, total_leido }
}
