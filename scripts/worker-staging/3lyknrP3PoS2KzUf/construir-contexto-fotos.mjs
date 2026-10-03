// «Cada foto viaja con todo su contexto» en el Servicio de Apify (3lyknrP3PoS2KzUf) · CC#1 · 2026-10-03.
// Cambia SOLO el código de tres nodos de la cadena de copia de fotos (lista · revisar · anotar); no agrega nodos, no toca conexiones ni el resto del flujo.
//
//   node construir-contexto-fotos.mjs                 → trae el flujo vivo, cambia esos 3 nodos y escribe el JSON (--salida=) · NO toca n8n
//   node construir-contexto-fotos.mjs --publicar      → PUT al flujo vivo · SOLO con la migración 202610030100 ya aplicada, 0 ejecuciones en vuelo y GO de Emilio
//
// 🔴 ORDEN OBLIGATORIO al publicar: (1) migración `202610030100_client_social_images_contexto.sql` + `NOTIFY pgrst, 'reload schema'` → (2) este flujo. Con el flujo nuevo y la tabla vieja, `Fotos · anotar` falla
// ALTO (HTTP 400 de PostgREST por columna inexistente → COPIA_FOTOS_SIN_ANOTAR): nunca en silencio.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const src = (f) => fs.readFileSync(join(aqui, f), 'utf8')
const LOGICA = fs.readFileSync(join(aqui, '..', '..', '..', 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'), 'utf8')
const sinExports = (js) => { const i = js.indexOf("if (typeof module !== 'undefined' && module.exports)"); return i === -1 ? js : js.slice(0, i) }

export const NODOS = { lista: 'Fotos · lista', revisar: 'Fotos · revisar', anotar: 'Fotos · anotar' }
export function codigoDeNodo(clave) {
  switch (clave) {
    case 'lista': return sinExports(LOGICA) + '\n' + src('fotos-lista.js')
    case 'revisar': return sinExports(LOGICA) + '\n' + src('fotos-revisar.js')
    case 'anotar': return src('fotos-anotar.js')
    default: throw new Error('nodo sin código: ' + clave)
  }
}
/** devuelve una COPIA del flujo con el código de los tres nodos cambiado · falla si falta alguno (no inventa nodos) */
export function aplicarContexto(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  for (const [clave, nombre] of Object.entries(NODOS)) {
    const n = w.nodes.find((x) => x.name === nombre)
    if (!n) throw new Error('el flujo no trae el nodo «' + nombre + '» · la cadena de copia de fotos no está instalada')
    n.parameters = { ...n.parameters, jsCode: codigoDeNodo(clave) }
  }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-contexto-fotos.mjs')) {
  const publicar = process.argv.includes('--publicar')
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY, ID = '3lyknrP3PoS2KzUf'
  const w = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: { 'X-N8N-API-KEY': key } })).json()
  const nuevo = aplicarContexto(w)
  const cambiados = Object.values(NODOS).filter((nombre) => w.nodes.find((x) => x.name === nombre).parameters.jsCode !== nuevo.nodes.find((x) => x.name === nombre).parameters.jsCode)
  const salida = process.argv.find((a) => a.startsWith('--salida='))?.slice(9) || 'apify-con-contexto-de-fotos.json'
  fs.writeFileSync(salida, JSON.stringify({ name: nuevo.name, nodes: nuevo.nodes, connections: nuevo.connections, settings: nuevo.settings }))
  console.log('nodos', nuevo.nodes.length, '· cambiados:', cambiados.join(' | ') || '(ninguno)', '· escrito', salida)
  if (publicar) {
    const r = await fetch(`${base}/api/v1/workflows/${ID}`, { method: 'PUT', headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nuevo.name, nodes: nuevo.nodes, connections: nuevo.connections, settings: nuevo.settings }) })
    console.log('PUT', r.status)
  }
}
