/**
 * BRAZO · DEMANDA Y POSICIÓN · PURO.
 * Mide DÓNDE SALE el cliente en Google Maps para búsquedas SIN su marca («ceviche», «restaurante»…) y QUIÉN sale primero. Una corrida semanal (miércoles, UTC) de la función
 * `google_maps_scraper` del Servicio (la misma de Mapas, otro texto de búsqueda); NO usa Trends: el actor de Google Trends del ensayo del 15-oct gastó US$ 0,10 en 6 min y no devolvió filas.
 *
 * Medido el 15-oct sobre Náufrago: 3 búsquedas × 15 lugares = 45 fichas, US$ 0,135 (US$ 0,003 por lugar), 30 s. Los resultados se SESGAN al punto que Mapas resuelve para la ciudad (varios eran de otra
 * playa cercana): por eso la ficha dice «posición para quien busca desde <ciudad>» y no «en el barrio del cliente».
 *
 * Quien sale primero entra como competidor SUGERIDO: es una ficha con alcance `competidor` que dice «sugerido, NO se vigila hasta que el dueño lo confirme». Nunca entra solo a la lista vigilada.
 */
import { coincidePorPalabra } from '../../texto/coincidencia'
import { normalizar } from '../../manual/texto'
import { FAMILIAS } from '../../fuentes-publicas/catalogo'
import { DIA_EN_MS, MARCA_DE_BRAZO, slugDe, type AccionDeBrazo, type FichaDeBrazo, type ResultadoDeUnBrazo } from './tipos'
import { marcaDeUbicar, radioDeSede, type SedeConPunto } from './sedes'

export const DIA_DE_DEMANDA = 3 // miércoles (0 = domingo, UTC)
export const MAX_TERMINOS_DE_DEMANDA = 3
export const LUGARES_POR_BUSQUEDA = 15
export const MAX_SUGERIDOS = 5
/** medido el 15-oct: 45 lugares = US$ 0,135 */
export const USD_MAX_DE_DEMANDA = 0.15
const VIGENCIA_DIAS = 14

/** término genérico por familia de rubro (dato): se usa cuando el dueño no declaró los suyos y el rubro no da uno limpio */
export const TERMINO_GENERICO_POR_FAMILIA: Record<string, string> = {
  comida: 'restaurante', alojamiento: 'hotel', turismo: 'tours', software: 'software', comercio: 'tienda', salud: 'clínica', belleza_bienestar: 'peluquería', automotriz: 'taller mecánico',
  inmobiliaria: 'inmobiliaria', educacion: 'academia', servicios_hogar: 'servicio técnico', servicios_profesionales: 'consultoría', finanzas: 'cooperativa', industria_b2b: 'proveedor industrial',
}
const RELLENOS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'con', 'costero', 'costera', 'ecuatoriano', 'ecuatoriana', 'peruano', 'peruana', 'colombiano', 'colombiana', 'mexicano', 'mexicana', 'argentino', 'argentina', 'chileno', 'chilena', 'uruguayo', 'uruguaya', 'paraguayo', 'paraguaya', 'boliviano', 'boliviana', 'espanol', 'espanola', 'artesanal', 'tradicional', 'local'])

/** la palabra del rubro (tal como la escribió el cliente) que cae en una clave de la familia; `null` si ninguna */
function palabraDeLaFamilia(palabras: string[], familia: string): string | null {
  const claves = (FAMILIAS as Record<string, string[]>)[familia]
  if (!claves) return null
  for (const p of palabras) { const w = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); if (w && claves.some((k) => coincidePorPalabra(w, k))) return w }
  return null
}

export interface EntradaDeTerminos { rubro?: string | null; config?: unknown; familias?: string[] }
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** hasta 3 búsquedas sin marca: las que el dueño declaró (`config.apify.terminos_de_demanda`), luego el rubro limpio (≤ 4 palabras) y el genérico de su familia */
export function terminosDeDemanda(e: EntradaDeTerminos): string[] {
  const salida: string[] = []
  // un término que ya está dentro de otro (como palabra entera) no se repite: «abogados» dentro de «estudio abogados»
  const poner = (t: unknown) => { const s = typeof t === 'string' ? t.trim() : ''; const n = normalizar(s); if (s && s.length <= 60 && !salida.some((x) => normalizar(x) === n || (` ${normalizar(x)} `).includes(` ${n} `))) salida.push(s) }
  const declarados = obj(obj(e.config).apify).terminos_de_demanda
  if (Array.isArray(declarados)) for (const t of declarados) poner(t)
  const palabras = String(e.rubro ?? '').trim().split(/\s+/).filter(Boolean)
  const limpio = palabras.filter((p) => !RELLENOS.has(normalizar(p))).slice(0, 4).join(' ')
  const crudo = palabras.slice(0, 4).join(' ')
  // «restaurante de mariscos costero ecuatoriano» → «restaurante mariscos» (sin rellenos); si queda una sola palabra se usa el rubro tal cual (hasta 4 palabras)
  poner(limpio.split(' ').length >= 2 ? limpio : crudo)
  // por familia: la PALABRA del rubro del cliente que la define («farmacia», «gimnasio», «abogados»); solo si no hay, el término genérico de la familia (un gimnasio no se busca como «peluquería»)
  for (const f of e.familias ?? []) poner(palabraDeLaFamilia(palabras, f) ?? TERMINO_GENERICO_POR_FAMILIA[f])
  return salida.slice(0, MAX_TERMINOS_DE_DEMANDA)
}

export interface EntradaDeAccionDeDemanda { /** idioma de la búsqueda (por país; por omisión español) */ idioma?: string; ahora: Date; terminos: string[]; ciudad?: string | null; mercado?: string | null; forzar?: boolean }
export function accionDeDemanda(e: EntradaDeAccionDeDemanda): { accion: AccionDeBrazo | null; no_cubierta: string | null } {
  const donde = String(e.ciudad ?? '').trim() || String(e.mercado ?? '').trim()
  if (!donde) return { accion: null, no_cubierta: 'demanda: sin ciudad ni mercado en la ficha no se busca «sin marca» (saldría un ranking de cualquier lugar)' }
  if (!e.terminos.length) return { accion: null, no_cubierta: 'demanda: no hay términos de búsqueda (ni declarados ni del rubro)' }
  if (!e.forzar && e.ahora.getUTCDay() !== DIA_DE_DEMANDA) return { accion: null, no_cubierta: null }
  return {
    accion: {
      fuente: 'demanda', funcion: 'google_maps_scraper',
      params: { searchStringsArray: e.terminos, locationQuery: donde, resultsLimit: LUGARES_POR_BUSQUEDA, language: e.idioma ?? 'es', [MARCA_DE_BRAZO]: 'demanda' },
      metadata: { target_kind: 'third_party', llamado_por: 'portero-alimentar' }, usd_max: USD_MAX_DE_DEMANDA, medido: true, objetivo: `${e.terminos.join(' | ')} · ${donde}`,
    },
    no_cubierta: null,
  }
}

/** por SEDE: una corrida semanal alrededor del punto de cada sede (con coordenadas, o por ciudad DECLARANDO el sesgo) + la ubicación aproximada por dirección cuando falta el punto */
export const TERMINOS_POR_SEDE = 2
export const LUGARES_POR_BUSQUEDA_Y_SEDE = 10
export const USD_POR_LUGAR = 0.003
export const USD_DE_UBICAR = 0.01
export interface EntradaDeDemandaPorSede { /** idioma de la búsqueda (por país; por omisión español) */ idioma?: string; ahora: Date; terminos: string[]; sedes: SedeConPunto[]; familias: string[]; forzar?: boolean; ubicadasEnLosUltimos7Dias?: ReadonlySet<string> }
export function accionesDeDemandaPorSede(e: EntradaDeDemandaPorSede): { acciones: AccionDeBrazo[]; no_cubiertas: Array<{ fuente: string; por_que: string }> } {
  const acciones: AccionDeBrazo[] = []
  const no_cubiertas: Array<{ fuente: string; por_que: string }> = []
  if (!e.sedes.length) return { acciones, no_cubiertas: [{ fuente: 'demanda', por_que: 'el cliente no tiene sedes declaradas: la posición por sede no aplica' }] }
  const terminos = e.terminos.slice(0, TERMINOS_POR_SEDE)
  if (!terminos.length) return { acciones, no_cubiertas: [{ fuente: 'demanda', por_que: 'no hay términos de búsqueda (ni declarados ni del rubro)' }] }
  const meta = { target_kind: 'third_party' as const, llamado_por: 'portero-alimentar' }
  for (const s of e.sedes) {
    const radio = radioDeSede(e.familias, s)
    if (radio === null) { no_cubiertas.push({ fuente: `demanda · ${s.clave}`, por_que: 'el rubro no compite por cercanía en esta sede: no aplica por sede' }); continue }
    if (s.lat === null || s.lng === null) {
      if (s.direccion && !e.ubicadasEnLosUltimos7Dias?.has(s.clave)) {
        acciones.push({ fuente: 'demanda', funcion: 'google_maps_scraper', params: { searchStringsArray: [`${s.direccion}, ${s.ciudad}`], locationQuery: s.ciudad, resultsLimit: 1, language: e.idioma ?? 'es', [MARCA_DE_BRAZO]: marcaDeUbicar(s.clave) },
          metadata: meta, usd_max: USD_DE_UBICAR, medido: false, objetivo: `ubicar la sede ${s.clave} · ${s.direccion}` })
      }
      no_cubiertas.push({ fuente: `demanda · ${s.clave}`, por_que: 'la sede no tiene punto (ni ficha de Mapas ni coordenadas): se mira por el nombre de la ciudad, con el sesgo conocido' })
    }
    if (!e.forzar && e.ahora.getUTCDay() !== DIA_DE_DEMANDA) continue
    const geo = s.lat !== null && s.lng !== null ? { customGeolocation: { type: 'Point', coordinates: [s.lng, s.lat], radiusKm: radio } } : {}
    acciones.push({
      fuente: 'demanda', funcion: 'google_maps_scraper',
      params: { searchStringsArray: terminos, locationQuery: s.ciudad, ...geo, resultsLimit: LUGARES_POR_BUSQUEDA_Y_SEDE, language: e.idioma ?? 'es', [MARCA_DE_BRAZO]: `demanda:${s.clave}` },
      metadata: meta, usd_max: Math.round(terminos.length * LUGARES_POR_BUSQUEDA_Y_SEDE * USD_POR_LUGAR * 1e6) / 1e6, medido: true, objetivo: `${terminos.join(' | ')} · sede ${s.clave}${geo.customGeolocation ? ` · radio ${radio} km` : ' · por ciudad'}`,
    })
  }
  return { acciones, no_cubiertas }
}

export interface FilaCrudaDeBrazo { id: string; apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null; created_at: string }
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const coma = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',')
export const esFilaDeBrazo = (f: FilaCrudaDeBrazo, prefijo: string): boolean => f.ensayo !== true && typeof obj(f.params)[MARCA_DE_BRAZO] === 'string' && String(obj(f.params)[MARCA_DE_BRAZO]).startsWith(prefijo)

export interface EntradaDeFichasDeDemanda {
  client_id: string
  nombreDelCliente: string
  filas: FilaCrudaDeBrazo[]
  ahora: Date
  /** nombres que ya están en la lista vigilada o ya son del cliente: no se sugieren */
  yaConocidos?: string[]
  ciudad?: string | null
  /** la clave de la sede: mira solo la corrida `demanda:<clave>`, rotula con ella y NO sugiere competidores (los descubre y juzga el módulo de competencia por sede) */
  sede?: string
}

/** de la corrida más nueva de la demanda: una ficha de posición por búsqueda y hasta 5 competidores sugeridos */
export function fichasDeDemanda(e: EntradaDeFichasDeDemanda): ResultadoDeUnBrazo {
  const filas = e.filas.filter((f) => f.apify_function === 'google_maps_scraper' && (e.sede ? obj(f.params)[MARCA_DE_BRAZO] === `demanda:${e.sede}` && f.ensayo !== true : esFilaDeBrazo(f, 'demanda'))).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const f = filas[0]
  if (!f) return { brazo: 'demanda', estado: 'sin_material', detalle: 'todavía no hay una corrida de demanda', fichas: [], declarado: [] }
  const items = lista(f.respuesta)
  if (!items.length) return { brazo: 'demanda', estado: 'sin_material', detalle: 'la corrida no trajo lugares', fichas: [], declarado: ['demanda: la corrida más nueva no trajo lugares (se dice, no se lee como «no aparece»)'] }
  const nuestro = normalizar(e.nombreDelCliente)
  const conocidos = new Set((e.yaConocidos ?? []).map((n) => normalizar(n)).filter(Boolean))
  const porTermino = new Map<string, Array<Record<string, unknown>>>()
  for (const it of items) {
    const t = txt(it.searchString) || '(sin término)'
    porTermino.set(t, [...(porTermino.get(t) ?? []), it])
  }
  const iso = f.created_at
  const hasta = new Date(new Date(iso).getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  const fichas: FichaDeBrazo[] = []
  const sugeridos = new Map<string, { nombre: string; mejor: number; termino: string; puntaje: number | null; resenas: number | null; url: string | null }>()
  const donde = txt(e.ciudad) || 'la ciudad'
  const sedeSlug = e.sede ? `${slugDe(e.sede)}:` : ''
  for (const [termino, its] of porTermino) {
    const ordenados = [...its].sort((a, b) => (num(a.rank) ?? 999) - (num(b.rank) ?? 999))
    const idx = ordenados.findIndex((x) => { const t = txt(x.title); return !!t && !!nuestro && (normalizar(t) === nuestro || coincidePorPalabra(t, e.nombreDelCliente)) })
    const primeros = ordenados.filter((_, i) => i !== idx).slice(0, 3).map((x) => `«${txt(x.title)}» (${num(x.totalScore) !== null ? coma(num(x.totalScore) as number) : 's/p'} · ${num(x.reviewsCount) ?? 0} reseñas)`)
    const lugar = idx >= 0 ? `${e.nombreDelCliente} aparece en el puesto ${num(ordenados[idx].rank) ?? idx + 1} según Maps (se leyeron ${ordenados.length} resultados)` : `${e.nombreDelCliente} NO aparece entre los ${ordenados.length} resultados leídos`
    const primero = ordenados[0] && idx !== 0 ? `; primero: «${txt(ordenados[0].title)}»` : ''
    const contenido = `Posición en Google Maps para la búsqueda «${termino}» (sin marca) desde ${donde}: ${lugar}${primero}. Otros que salen arriba: ${primeros.length ? primeros.join(', ') : 'ninguno'}. `
      + `El ranking depende del punto desde el que Maps resuelve la ciudad; no es el barrio del cliente. Observado ${iso.slice(0, 10)}.`
    fichas.push({
      brazo: 'demanda', alcance: 'mercado', client_id: e.client_id, ref: `brazo:demanda:posicion:${sedeSlug}${slugDe(termino)}:${iso.slice(0, 10)}`, atributo: `mercado:posicion:${sedeSlug}${slugDe(termino)}`, clase: 'mercado_posicion',
      titulo: `Posición en Mapas · «${termino}»${e.sede ? ` · sede ${e.sede}` : ''}`, contenido, origen: 'tercero', fuente_url: null, fecha_fuente: iso.slice(0, 10), observado_en: iso, vigente_hasta: hasta, decision: 'reemplaza', sobre: termino,
    })
    for (const x of ordenados.slice(0, 5)) {
      const t = txt(x.title)
      const k = normalizar(t)
      if (!k || k === nuestro || conocidos.has(k) || (nuestro && coincidePorPalabra(t, e.nombreDelCliente))) continue
      const rank = num(x.rank) ?? 99
      const previo = sugeridos.get(k)
      if (!previo || rank < previo.mejor) sugeridos.set(k, { nombre: t, mejor: rank, termino, puntaje: num(x.totalScore), resenas: num(x.reviewsCount), url: txt(x.url) || null })
    }
  }
  const dichos = e.sede ? [] : [...sugeridos.values()].sort((a, b) => a.mejor - b.mejor).slice(0, MAX_SUGERIDOS)
  for (const s of dichos) {
    fichas.push({
      brazo: 'demanda', alcance: 'competidor', client_id: e.client_id, ref: `brazo:demanda:sugerido:${slugDe(s.nombre)}:${iso.slice(0, 10)}`, atributo: `competidor:${slugDe(s.nombre)}:sugerido`, clase: 'competidor_sugerido',
      titulo: `Competidor sugerido · ${s.nombre}`,
      contenido: `«${s.nombre}» (COMPETIDOR SUGERIDO, no es del cliente) sale arriba para «${s.termino}» en ${donde}: puesto ${s.mejor}, ${s.puntaje !== null ? coma(s.puntaje) : 's/p'} de puntaje con ${s.resenas ?? 0} reseñas en Google Maps. `
        + `NO se vigila hasta que el dueño lo confirme en la ficha del cliente. Observado ${iso.slice(0, 10)}.`,
      origen: 'tercero', fuente_url: s.url, fecha_fuente: iso.slice(0, 10), observado_en: iso, vigente_hasta: hasta, decision: 'reemplaza', sobre: s.nombre,
    })
  }
  return { brazo: 'demanda', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado: ['posición medida desde el punto que Maps resuelve para la ciudad', 'los competidores sugeridos NO se vigilan sin confirmación del dueño'] }
}
