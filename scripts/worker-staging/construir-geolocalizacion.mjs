// GEOLOCALIZACIÓN POR SEDE · el Servicio de Apify (`3lyknrP3PoS2KzUf`) reenvía `customGeolocation` a `google_maps_scraper` (15-oct). ADITIVO: sin ese parámetro el cuerpo es el de siempre.
// Por qué: Mapas resuelve «Olón» a un punto que favorece a otra playa (medido); la competencia y la posición se miran alrededor del PUNTO de cada sede.
// El esquema del Servicio YA acepta `customGeolocation` (congelado del actor); lo único que faltaba era el constructor del cuerpo. Se valida la forma: Point, [lng, lat] y radio 0 < r ≤ 50 km.
//   node scripts/worker-staging/construir-geolocalizacion.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/')
const DIR = RAIZ + 'scripts/worker-staging/3lyknrP3PoS2KzUf/'
export const NODO = 'Armar el cuerpo del raspador'
export const GEO = "...((g) => (g && g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length === 2 && g.coordinates.every((n) => typeof n === 'number' && isFinite(n)) && Math.abs(g.coordinates[0]) <= 180 && Math.abs(g.coordinates[1]) <= 90 && typeof g.radiusKm === 'number' && g.radiusKm > 0 && g.radiusKm <= 50 ? { customGeolocation: { type: 'Point', coordinates: g.coordinates, radiusKm: g.radiusKm } } : {}))($json.params.customGeolocation), "
export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}
export function servicioConGeolocalizacion(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const n = f.nodes.filter((m) => m.name === NODO)
  if (n.length !== 1) throw new Error(`${n.length} nodos «${NODO}»`)
  if (JSON.stringify(f).includes('customGeolocation: { type')) throw new Error('el Servicio ya reenvía customGeolocation')
  n[0].parameters.jsCode = conFinDeLinea(n[0].parameters.jsCode, (c) => cambiar(c,
    "locationQuery: $json.params.locationQuery || $json.params.location || '', maxCrawledPlacesPerSearch: $json.params.resultsLimit || 10, language: $json.params.language || 'es' }),\n  similarweb_scraper:",
    "locationQuery: $json.params.locationQuery || $json.params.location || '', " + GEO + "maxCrawledPlacesPerSearch: $json.params.resultsLimit || 10, language: $json.params.language || 'es' }),\n  similarweb_scraper:", 'google_maps_scraper'))
  return f
}
export function soloCambiaLoPrevisto(antes, despues) {
  const A = new Map(antes.nodes.map((n) => [n.name, JSON.stringify(n)]))
  const cambian = despues.nodes.filter((n) => A.get(n.name) !== JSON.stringify(n)).map((n) => n.name)
  return { cambian, nuevos: despues.nodes.filter((n) => !A.has(n.name)).map((n) => n.name), conexionesIguales: JSON.stringify(antes.connections) === JSON.stringify(despues.connections), nombreIgual: antes.name === despues.name, activoIgual: antes.active === despues.active }
}
if (process.argv[1] && process.argv[1].endsWith('construir-geolocalizacion.mjs')) {
  const antes = JSON.parse(fs.readFileSync(DIR + 'servicio-apify-ANTES-geolocalizacion-2026-10-15.json', 'utf8'))
  const despues = servicioConGeolocalizacion(antes)
  const r = soloCambiaLoPrevisto(antes, despues)
  if (JSON.stringify(r.cambian) !== JSON.stringify([NODO]) || r.nuevos.length || !r.conexionesIguales || !r.nombreIgual || !r.activoIgual) throw new Error('cambió algo no previsto: ' + JSON.stringify(r))
  fs.writeFileSync(DIR + 'servicio-apify-ARREGLADO-geolocalizacion-2026-10-15.json', JSON.stringify(despues, null, 2))
  console.log('ok · cambia 1 nodo · activo =', despues.active)
}
