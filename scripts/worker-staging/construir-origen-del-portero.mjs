// EL PORTERO FIRMA SU GASTO (15-oct · encargo «umbral y resumen vivo» §4) · el Servicio de Apify ya guarda `origen` en cada fila de la libreta (plan v3 V8 aplicado por CC#3).
// Hasta hoy el portero no lo mandaba: sus filas salían `sin_origen` y el vigilante las reconocía por emparejamiento con el crudo (heurística que, ante la duda, cuenta de más).
// Este cambio, ADITIVO, manda `origen` en las cinco llamadas al Servicio del flujo del portero: la fila dice quién la pidió y el emparejamiento queda solo para las filas viejas.
//   ② Ampliar (3 tandas) → 'portero' · ② bis (artículos) → 'portero_articulo' · ② ter (reseñas y videos) → 'portero_tanda2'  (la forma que acepta el Servicio: ^[a-z][a-z0-9_]{0,31}$)
// Se apila SOBRE «una ejecución por cliente»: su ANTES es ese ARREGLADO (ya aplicado, o se aplica primero).
//   node scripts/worker-staging/construir-origen-del-portero.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/')
export const DIR = RAIZ + 'scripts/worker-staging/ogfq56oIEoHufFPM/'
export const BASE = DIR + 'portero-ARREGLADO-un-cliente-por-ejecucion-2026-10-15.json'
export const ANTES = DIR + 'portero-ANTES-origen-del-portero-2026-10-15.json'
export const ARREGLADO = DIR + 'portero-ARREGLADO-origen-del-portero-2026-10-15.json'
export const ORIGEN_AMPLIAR = 'portero'
export const ORIGEN_ARTICULOS = 'portero_articulo'
export const ORIGEN_TANDA2 = 'portero_tanda2'
export const NODOS = [
  ['② Ampliar (Servicio de Apify)', ORIGEN_AMPLIAR],
  ['② Ampliar (tanda 1)', ORIGEN_AMPLIAR],
  ['② Ampliar (tanda 2)', ORIGEN_AMPLIAR],
  ['② bis Leer artículos (Servicio de Apify)', ORIGEN_ARTICULOS],
  ['② ter Leer reseñas y videos (Servicio de Apify)', ORIGEN_TANDA2],
]
const CUERPO = "body: { client_id: e.cliente, apify_function: a.funcion, params: a.params, destination: 'respuesta', dry_run: false, metadata:"

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

export function conOrigen(codigo, origen, nodo) {
  return conFinDeLinea(codigo, (c) => cambiar(c, CUERPO, CUERPO.replace("dry_run: false, metadata:", `dry_run: false, origen: '${origen}', metadata:`), `cuerpo de «${nodo}»`))
}

export function portero(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  if (JSON.stringify(f).includes("origen: 'portero")) throw new Error('el flujo ya manda su origen')
  for (const [nombre, origen] of NODOS) {
    const m = f.nodes.filter((x) => x.name === nombre)
    if (m.length !== 1) throw new Error(`${m.length} nodos «${nombre}»`)
    m[0].parameters.jsCode = conOrigen(m[0].parameters.jsCode, origen, nombre)
  }
  return f
}

if (process.argv[1] && /construir-origen-del-portero\.mjs$/.test(process.argv[1])) {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'))
  fs.writeFileSync(ANTES, JSON.stringify(base, null, 1))
  const despues = portero(base)
  fs.writeFileSync(ARREGLADO, JSON.stringify(despues, null, 1))
  console.log('ANTES y ARREGLADO escritos · nodos', base.nodes.length, '→', despues.nodes.length)
}
