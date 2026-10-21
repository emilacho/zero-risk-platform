// «Copia de fotos y logo propios de TODAS las fuentes» en el Servicio de Apify (3lyknrP3PoS2KzUf) · CC#1 · 2026-10-21 · ENCARGO manual visual con todas las fuentes, T2.
// Cambia SOLO el código de dos nodos de la cadena `Fotos ·`: «Fotos · lista» (entrega también las filas de Mapas, sitio, Facebook y YouTube propios) y «Fotos · revisar» (la ruta del archivo
// se hace segura: el prefijo de la fuente lleva «:»). No agrega nodos ni toca conexiones; Instagram sigue su camino de siempre.
//
//   node construir-fuentes-nuevas.mjs <ANTES.json>   → lee el flujo vivo ya respaldado y escribe servicio-apify-ARREGLADO-fuentes-nuevas-2026-10-21.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDeNodo } from './construir-contexto-fotos.mjs'

export const NODOS = { lista: 'Fotos · lista', revisar: 'Fotos · revisar' }

/** devuelve una COPIA del flujo con el código de los dos nodos cambiado; conserva los fines de línea de cada nodo; falla si no hay nada que cambiar */
export function aplicarFuentesNuevas(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  let cambios = 0
  for (const [clave, nombre] of Object.entries(NODOS)) {
    const n = w.nodes.find((x) => x.name === nombre)
    if (!n) throw new Error('el flujo no trae el nodo «' + nombre + '»')
    const nuevo = codigoDeNodo(clave)
    if (n.parameters.jsCode.replace(/\r\n/g, '\n') === nuevo.replace(/\r\n/g, '\n')) continue
    n.parameters = { ...n.parameters, jsCode: n.parameters.jsCode.includes('\r\n') ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
    cambios++
  }
  if (!cambios) throw new Error('los dos nodos ya tienen este código')
  if (!w.nodes.find((x) => x.name === NODOS.lista).parameters.jsCode.includes('copiasDeLaLlamada(')) throw new Error('«Fotos · lista» no quedó con las fuentes nuevas')
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-fuentes-nuevas.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-fuentes-nuevas.mjs <ANTES.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(entrada, 'utf8'))
  fs.writeFileSync(join(aqui, 'servicio-apify-ARREGLADO-fuentes-nuevas-2026-10-21.json'), JSON.stringify(aplicarFuentesNuevas(antes), null, 2))
  console.log('escrito servicio-apify-ARREGLADO-fuentes-nuevas-2026-10-21.json')
}
