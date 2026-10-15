/**
 * DESCUBRIR COMPETIDORES POR SEDE (código, sin modelo) · PURO.
 * De la corrida semanal de posición sin marca de CADA sede (Mapas alrededor de su punto) salen los candidatos: mismo rubro, cerca de la sede (radio del catálogo de rubro) y con reseñas suficientes;
 * se suman los del análisis del alta (`competitor_list`). Lo que sale de aquí NO es todavía un competidor: lo juzga el agente (`juez-competencia.ts`).
 * Reglas de código (nunca del modelo): no es el propio cliente, no está cerrado, no está a más del radio, tiene un mínimo de reseñas, pertenece a la familia de rubro del cliente.
 * Declarado: las menciones y listas del cerebro NO se leen todavía como fuente de candidatos.
 */
import { createHash } from 'node:crypto'
import { FAMILIAS } from '../../fuentes-publicas/catalogo'
import { normalizar } from '../../manual/texto'
import { coincidePorPalabra } from '../../texto/coincidencia'
import { MARCA_DE_BRAZO, slugDe } from './tipos'
import { distanciaKm, type SedeConPunto } from './sedes'

export const MIN_RESENAS_PARA_SER_CANDIDATO = 5
export const MAX_CANDIDATOS_POR_SEDE = 10
export interface Candidato {
  nombre: string
  slug: string
  sede: string
  origen: 'mapas' | 'alta'
  categoria: string | null
  puntaje: number | null
  resenas: number | null
  distancia_km: number | null
  direccion: string | null
  web: string | null
  url: string | null
  place_id: string | null
  tipo_del_alta: string | null
  /** el texto de HECHOS que se le muestra al agente: la cita tiene que salir de aquí, literal */
  hechos: string
  puesto: number | null
  termino: string | null
}
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const coma = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',')

/** ¿alguna categoría de Mapas del lugar cae en una familia de rubro del cliente (palabras enteras)? */
export function categoriaDeLaFamilia(categorias: string[], familias: string[]): boolean {
  const claves = familias.flatMap((f) => (FAMILIAS as Record<string, string[]>)[f] ?? [])
  return categorias.some((c) => claves.some((k) => coincidePorPalabra(c, k)))
}

export interface FilaDeDemanda { apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null; created_at: string }
export interface EntradaDeCandidatos {
  sede: SedeConPunto
  filas: FilaDeDemanda[]
  nombreDelCliente: string
  familias: string[]
  radioKm: number | null
  /** títulos de las fichas propias del cliente en Mapas (para no confundirse con uno mismo) */
  propios?: string[]
  listaDelAlta?: Array<{ name?: unknown; competitor_type?: unknown; website?: unknown }>
  minResenas?: number
}
export interface ResultadoDeCandidatos { candidatos: Candidato[]; descartados: Array<{ nombre: string; por_que: string }>; corrida: string | null }

export function candidatosDeSede(e: EntradaDeCandidatos): ResultadoDeCandidatos {
  const min = e.minResenas ?? MIN_RESENAS_PARA_SER_CANDIDATO
  const fila = [...e.filas].filter((f) => f.apify_function === 'google_maps_scraper' && f.ensayo !== true && obj(f.params)[MARCA_DE_BRAZO] === `demanda:${e.sede.clave}`).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  const nuestro = normalizar(e.nombreDelCliente)
  const propios = new Set((e.propios ?? []).map((p) => normalizar(p)))
  const descartados: ResultadoDeCandidatos['descartados'] = []
  const por = new Map<string, Candidato & { puntuacion: number }>()
  const centro = e.sede.lat !== null && e.sede.lng !== null ? { lat: e.sede.lat, lng: e.sede.lng } : null
  for (const it of lista(fila?.respuesta)) {
    const nombre = txt(it.title)
    if (!nombre) continue
    const n = normalizar(nombre)
    // solo el propio cliente EXACTO: un homónimo («Puerto del Náufrago») es otro negocio y lo juzga el agente por su rubro y su zona
    if (n === nuestro || propios.has(n)) { descartados.push({ nombre, por_que: 'es el propio cliente' }); continue }
    if (it.permanentlyClosed === true || it.temporarilyClosed === true) { descartados.push({ nombre, por_que: 'cerrado' }); continue }
    const categorias = [txt(it.categoryName), ...((Array.isArray(it.categories) ? it.categories : []) as unknown[]).map(txt)].filter(Boolean)
    if (e.familias.length && !categoriaDeLaFamilia(categorias, e.familias)) { descartados.push({ nombre, por_que: `su categoría (${categorias[0] ?? 'sin categoría'}) no es del rubro` }); continue }
    const resenas = num(it.reviewsCount) ?? 0
    if (resenas < min) { descartados.push({ nombre, por_que: `menos de ${min} reseñas` }); continue }
    const loc = obj(it.location)
    const p = typeof loc.lat === 'number' && typeof loc.lng === 'number' ? { lat: loc.lat, lng: loc.lng } : null
    const dist = centro && p ? Math.round(distanciaKm(centro, p) * 10) / 10 : null
    if (e.radioKm !== null && dist !== null && dist > e.radioKm) { descartados.push({ nombre, por_que: `a ${coma(dist)} km, fuera del radio de ${e.radioKm} km` }); continue }
    const puntaje = num(it.totalScore)
    const hechos = `categoría ${categorias[0] ?? 'sin categoría'}; ${puntaje !== null ? `puntaje ${coma(puntaje)}` : 'sin puntaje'} con ${resenas} reseñas; ${dist !== null ? `a ${coma(dist)} km de la sede` : 'distancia desconocida'}${txt(it.address) ? `; dirección ${txt(it.address)}` : ''}`
    const cand: Candidato & { puntuacion: number } = {
      nombre, slug: slugDe(nombre), sede: e.sede.clave, origen: 'mapas', categoria: categorias[0] ?? null, puntaje, resenas, distancia_km: dist, direccion: txt(it.address) || null,
      web: txt(it.website) || null, url: txt(it.url) || null, place_id: txt(it.placeId) || null, tipo_del_alta: null, hechos, puesto: num(it.rank), termino: txt(it.searchString) || null,
      puntuacion: ((puntaje ?? 3) * Math.log(1 + resenas)) / (1 + (dist ?? (e.radioKm ?? 5) / 2) / Math.max(1, e.radioKm ?? 5)),
    }
    const k = cand.place_id || n
    const previo = por.get(k)
    if (!previo || cand.puntuacion > previo.puntuacion) por.set(k, cand)
  }
  const mapas = [...por.values()].sort((a, b) => b.puntuacion - a.puntuacion).slice(0, MAX_CANDIDATOS_POR_SEDE)
  const vistos = new Set(mapas.map((c) => normalizar(c.nombre)))
  const alta: Candidato[] = []
  for (const a of e.listaDelAlta ?? []) {
    const nombre = txt(a.name)
    const n = normalizar(nombre)
    if (!n || vistos.has(n) || n === nuestro) continue
    vistos.add(n)
    const tipo = txt(a.competitor_type) || null
    alta.push({ nombre, slug: slugDe(nombre), sede: e.sede.clave, origen: 'alta', categoria: null, puntaje: null, resenas: null, distancia_km: null, direccion: null, web: txt(a.website) || null, url: null, place_id: null,
      tipo_del_alta: tipo, hechos: `lo nombró el análisis del alta como competidor${tipo ? ` de tipo ${tipo}` : ''}; sin datos de Mapas en esta corrida`, puesto: null, termino: null })
  }
  return { candidatos: [...mapas.map(({ puntuacion: _p, ...c }) => c), ...alta].slice(0, MAX_CANDIDATOS_POR_SEDE + 4), descartados, corrida: fila ? fila.created_at : null }
}

/** huella estable de un candidato (para no volver a juzgar lo mismo si no cambió) */
export const huellaDeCandidato = (c: Candidato): string => createHash('sha256').update(`${c.slug}|${c.sede}|${c.hechos}`).digest('hex').slice(0, 16)
