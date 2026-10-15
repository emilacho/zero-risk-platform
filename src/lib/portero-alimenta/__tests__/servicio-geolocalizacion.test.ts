/**
 * El Servicio de Apify reenvía `customGeolocation` a `google_maps_scraper` (15-oct · competencia por sede). Aditivo: sin ese parámetro el cuerpo es EXACTAMENTE el de siempre.
 * Se prueba ejecutando el constructor REAL del flujo (ANTES y ARREGLADO) con parámetros buenos y malos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/3lyknrP3PoS2KzUf')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const ANTES = leer('servicio-apify-ANTES-geolocalizacion-2026-10-15.json')
const DESPUES = leer('servicio-apify-ARREGLADO-geolocalizacion-2026-10-15.json')
type Nodo = { name: string; parameters: { jsCode?: string } }
const NODO = 'Armar el cuerpo del raspador'

/** el constructor de una función, ejecutable: se recorta del código real del nodo */
function constructor(flujo: { nodes: Nodo[] }, funcion: string): (json: { params: Record<string, unknown> }) => Record<string, unknown> {
  const codigo = flujo.nodes.find((n) => n.name === NODO)!.parameters.jsCode!.split('\r\n').join('\n')
  const i = codigo.indexOf(`  ${funcion}: ($json) =>`)
  if (i < 0) throw new Error(`no hay el constructor de ${funcion}`)
  const fin = codigo.indexOf('}),\n', i) + 2
  const flecha = codigo.slice(i + `  ${funcion}: `.length, fin)
  return new Function(`return (${flecha})`)() as never
}
const geo = (o: Record<string, unknown> = {}) => ({ type: 'Point', coordinates: [-80.7595412, -1.7974316], radiusKm: 3, ...o })
const base = { searchStringsArray: ['ceviche', 'restaurante'], locationQuery: 'Olón', resultsLimit: 10, language: 'es' }

describe('el Servicio reenvía customGeolocation (solo si es válido)', () => {
  it('cambia UN nodo (el que arma el cuerpo): nada más; conexiones, nombre y estado iguales', () => {
    const A = new Map((ANTES.nodes as Nodo[]).map((n) => [n.name, JSON.stringify(n)]))
    expect((DESPUES.nodes as Nodo[]).filter((n) => A.get(n.name) !== JSON.stringify(n)).map((n) => n.name)).toEqual([NODO])
    expect(DESPUES.nodes).toHaveLength(ANTES.nodes.length)
    expect(JSON.stringify(DESPUES.connections)).toBe(JSON.stringify(ANTES.connections))
    expect([DESPUES.name, DESPUES.active]).toEqual([ANTES.name, ANTES.active])
  })
  it('con un punto válido el cuerpo lo lleva; locationQuery y lo demás siguen igual', () => {
    const f = constructor(DESPUES, 'google_maps_scraper')
    const b = f({ params: { ...base, customGeolocation: geo() } })
    expect(b).toMatchObject({ searchStringsArray: ['ceviche', 'restaurante'], locationQuery: 'Olón', maxCrawledPlacesPerSearch: 10, language: 'es', customGeolocation: { type: 'Point', coordinates: [-80.7595412, -1.7974316], radiusKm: 3 } })
  })
  it('sin el parámetro el cuerpo es EXACTAMENTE el de antes (varias formas de pedido)', () => {
    const a = constructor(ANTES, 'google_maps_scraper'), d = constructor(DESPUES, 'google_maps_scraper')
    for (const params of [base, { query: 'x' }, { searchStrings: ['a'], location: 'Quito' }, {}, { ...base, customGeolocation: null }]) {
      expect(d({ params })).toEqual(a({ params }))
    }
  })
  it.each([
    ['radio cero', geo({ radiusKm: 0 })], ['radio de 51 km', geo({ radiusKm: 51 })], ['radio como texto', geo({ radiusKm: '3' })], ['latitud fuera de rango', geo({ coordinates: [-80, 91] })],
    ['longitud fuera de rango', geo({ coordinates: [181, -1] })], ['coordenadas como texto', geo({ coordinates: ['-80', '-1'] })], ['tres coordenadas', geo({ coordinates: [1, 2, 3] })],
    ['tipo distinto de Point', geo({ type: 'Polygon' })], ['sin coordenadas', { type: 'Point', radiusKm: 3 }], ['un texto', 'Olón'], ['NaN', geo({ coordinates: [NaN, 1] })],
  ])('una forma inválida (%s) NO se reenvía', (_n, g) => {
    const b = constructor(DESPUES, 'google_maps_scraper')({ params: { ...base, customGeolocation: g } })
    expect(b).not.toHaveProperty('customGeolocation')
    expect(b.locationQuery).toBe('Olón')
  })
  it('solo se reenvían tipo, coordenadas y radio (ningún campo extra del pedido pasa)', () => {
    const b = constructor(DESPUES, 'google_maps_scraper')({ params: { ...base, customGeolocation: { ...geo(), extra: 'x', countryCode: 'zz' } } })
    expect(Object.keys(b.customGeolocation as object).sort()).toEqual(['coordinates', 'radiusKm', 'type'])
  })
  it('el constructor de la ficha PROPIA no cambió', () => {
    const p = { params: { ...base, customGeolocation: geo() } }
    expect(constructor(DESPUES, 'own_google_maps_profile')(p)).toEqual(constructor(ANTES, 'own_google_maps_profile')(p))
    expect(constructor(DESPUES, 'own_google_maps_profile')(p)).not.toHaveProperty('customGeolocation')
  })
  it('el esquema del Servicio acepta customGeolocation para google_maps_scraper', () => {
    const codigo = (DESPUES.nodes as Nodo[]).find((n) => n.name === 'Validar el cuerpo contra el esquema')!.parameters.jsCode!
    const i = codigo.indexOf('"google_maps_scraper":{')
    expect(i).toBeGreaterThan(0)
    expect(codigo.slice(i, codigo.indexOf('}', codigo.indexOf('obligatorios', i)) + 1)).toMatch(/customGeolocation/)
  })
})
