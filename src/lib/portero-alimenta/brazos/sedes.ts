/**
 * LAS SEDES DEL CLIENTE, CON SUS COORDENADAS · PURO · agnóstico (N sedes, 1 sede o ninguna).
 * La demanda y la competencia se miran POR SEDE y alrededor de su punto, no por el nombre de la ciudad (Mapas resuelve «Olón» a un punto que favorece a otra playa: sesgo medido el 15-oct).
 *
 * De dónde sale el punto, en orden (nunca se inventa):
 *   1. `config.apify.sedes_coordenadas[<clave>] = { lat, lng }` (lo que el dueño o un empleado fijó);
 *   2. la ficha PROPIA de Google Maps de esa sede (título = nombre del cliente y ciudad = la de la sede): `location` de la corrida de Mapas;
 *   3. una ubicación APROXIMADA por dirección (una búsqueda de Mapas con la dirección de la sede): se rotula «aproximada»;
 *   4. nada: la sede queda sin punto y se mira por el nombre de la ciudad, DECLARANDO el sesgo.
 * Tipo de sede: «local» (atiende en un local) o «solo domicilio» (cocina sin local: compite por la entrega, no por quien pasa por la calle).
 */
import { normalizar } from '../../manual/texto'
import { MARCA_DE_BRAZO, slugDe } from './tipos'

export interface SedeConPunto {
  clave: string
  ciudad: string
  lat: number | null
  lng: number | null
  origen_del_punto: 'config' | 'ficha_de_mapas' | 'direccion_aproximada' | null
  tipo: 'local' | 'solo_domicilio' | 'desconocido'
  direccion: string | null
}
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const punto = (v: unknown): { lat: number; lng: number } | null => {
  const o = obj(v)
  const lat = typeof o.lat === 'number' ? o.lat : typeof o.lat === 'string' ? Number(o.lat) : NaN
  const lng = typeof o.lng === 'number' ? o.lng : typeof o.lng === 'string' ? Number(o.lng) : NaN
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null
}

/** kilómetros entre dos puntos (haversine) */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** radio de competencia por familia de rubro (km; DATO): `null` = el rubro no compite por cercanía (no aplica por sede) */
export const RADIO_POR_FAMILIA_KM: Record<string, { local: number | null; domicilio: number | null }> = {
  comida: { local: 3, domicilio: 6 }, alojamiento: { local: 10, domicilio: null }, turismo: { local: 15, domicilio: null }, comercio: { local: 5, domicilio: 8 }, salud: { local: 8, domicilio: null },
  belleza_bienestar: { local: 4, domicilio: null }, automotriz: { local: 6, domicilio: null }, inmobiliaria: { local: 15, domicilio: null }, educacion: { local: 8, domicilio: null },
  servicios_hogar: { local: 10, domicilio: 10 }, servicios_profesionales: { local: 10, domicilio: null }, software: { local: null, domicilio: null }, finanzas: { local: null, domicilio: null },
  apps_moviles: { local: null, domicilio: null }, general: { local: 5, domicilio: null },
}
export function radioDe(familias: string[], tipo: SedeConPunto['tipo']): number | null {
  const radios = (familias.length ? familias : ['general']).map((f) => RADIO_POR_FAMILIA_KM[f] ?? RADIO_POR_FAMILIA_KM.general)
  const clave = tipo === 'solo_domicilio' ? 'domicilio' : 'local'
  const validos = radios.map((r) => r[clave]).filter((r): r is number => typeof r === 'number')
  return validos.length ? Math.max(...validos) : null
}

export interface FilaDeMapas { apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null; created_at: string }
export interface EntradaDeSedes {
  nombreDelCliente: string
  sedes: Array<{ id?: string; clave: string; ciudad: string }>
  /** `client_sede_datos`: campo y valor por sede (`tipo_de_atencion`, `direccion`…) */
  datos: Array<{ sede_id?: string | null; campo: string; valor_texto: string | null }>
  config: unknown
  filas: FilaDeMapas[]
}

export const marcaDeUbicar = (clave: string): string => `sede:${slugDe(clave)}:ubicar`

export function sedesConPunto(e: EntradaDeSedes): SedeConPunto[] {
  const cfg = obj(obj(obj(e.config).apify).sedes_coordenadas)
  const nuestro = normalizar(e.nombreDelCliente)
  const filas = [...e.filas].filter((f) => f.ensayo !== true).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return e.sedes.map((s): SedeConPunto => {
    const ciudadN = normalizar(s.ciudad)
    const datos = e.datos.filter((d) => d.sede_id && s.id && d.sede_id === s.id)
    const dato = (c: string) => txt(datos.find((d) => d.campo === c)?.valor_texto)
    const tipoT = normalizar(dato('tipo_de_atencion'))
    const tipo: SedeConPunto['tipo'] = /solo domicilio|sin local/.test(tipoT) ? 'solo_domicilio' : /local|restaurante|tienda|oficina|consultorio/.test(tipoT) ? 'local' : 'desconocido'
    const base = { clave: s.clave, ciudad: s.ciudad, tipo, direccion: dato('direccion') || null }
    const c = punto(cfg[s.clave])
    if (c) return { ...base, ...c, origen_del_punto: 'config' }
    // la ficha PROPIA: título = el nombre del cliente y ciudad = la de la sede (un homónimo de otra ciudad no vale)
    for (const f of filas.filter((x) => x.apify_function === 'own_google_maps_profile')) {
      for (const it of lista(f.respuesta)) {
        const p = punto(it.location)
        const ciudadItem = normalizar(txt(it.city))
        // el título es EXACTAMENTE el nombre del cliente (o «nombre + ciudad»): «Picantería El Náufrago» de Guayaquil es un homónimo, no el cliente
        if (p && nuestro && (normalizar(txt(it.title)) === nuestro || normalizar(txt(it.title)) === `${nuestro} ${ciudadN}`) && ciudadItem && (ciudadItem === ciudadN || ciudadItem.includes(ciudadN) || ciudadN.includes(ciudadItem))) return { ...base, ...p, origen_del_punto: 'ficha_de_mapas' }
      }
    }
    // aproximada: la búsqueda de la dirección de la sede
    const marca = marcaDeUbicar(s.clave)
    const u = filas.find((x) => x.apify_function === 'google_maps_scraper' && obj(x.params)[MARCA_DE_BRAZO] === marca)
    const pu = u ? lista(u.respuesta).map((it) => punto(it.location)).find(Boolean) : null
    if (pu) return { ...base, ...pu, origen_del_punto: 'direccion_aproximada' }
    return { ...base, lat: null, lng: null, origen_del_punto: null }
  })
}
