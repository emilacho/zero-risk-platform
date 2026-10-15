// SECO REAL (US$ 0): los candidatos que el sistema descubriría para una sede, con una corrida REAL de Mapas ya guardada (ensayo del 15-oct). No llama a ningún modelo ni a Apify.
//   npx tsx scripts/ops/competencia-seco-real.ts <items.json> <lat> <lng> <ciudad> <clave> <nombre del cliente> <familia>
import fs from 'node:fs'
import { candidatosDeSede } from '../../src/lib/portero-alimenta/brazos/descubrir'
import { radioDe } from '../../src/lib/portero-alimenta/brazos/sedes'

const [archivo, lat, lng, ciudad, clave, nombre, familia] = process.argv.slice(2)
const items = JSON.parse(fs.readFileSync(archivo, 'utf8')) as Array<Record<string, unknown>>
const sede = { clave, ciudad, lat: Number(lat), lng: Number(lng), origen_del_punto: 'ficha_de_mapas' as const, tipo: 'local' as const, direccion: null }
const radio = radioDe([familia], 'local')
const r = candidatosDeSede({ sede, filas: [{ apify_function: 'google_maps_scraper', ensayo: false, created_at: new Date().toISOString(), params: { _brazo: `demanda:${clave}` }, respuesta: items }], nombreDelCliente: nombre, familias: [familia], radioKm: radio })
console.log(JSON.stringify({ lugares_leidos: items.length, radio_km: radio, candidatos: r.candidatos.map((c) => ({ nombre: c.nombre, km: c.distancia_km, puntaje: c.puntaje, resenas: c.resenas, categoria: c.categoria })), descartados_por_motivo: r.descartados.reduce<Record<string, number>>((a, d) => { const k = d.por_que.replace(/\d+[.,]?\d* km/, 'N km'); a[k] = (a[k] ?? 0) + 1; return a }, {}) }, null, 1))
