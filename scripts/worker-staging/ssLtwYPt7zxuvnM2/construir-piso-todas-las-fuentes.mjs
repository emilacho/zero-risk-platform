// «El piso visual trabaja con TODAS las fuentes propias» en el cimiento (ssLtwYPt7zxuvnM2) · CC#1 · 2026-10-21 · ENCARGO manual visual con todas las fuentes, T3.
// Cambia SOLO el código del nodo «[BB] Piso visual (antes del Promote · CC#1)»: la lógica nueva (`derivarPisoVisualTodasLasFuentes`) y el pegamento que lee las copias propias de cualquier cuenta,
// declara el estado (completo | parcial | ausente + motivo) y deja `primary_colors`/`typography` coherentes en el borrador (solo si venían vacíos). No agrega nodos ni toca conexiones.
//
//   node construir-piso-todas-las-fuentes.mjs <ANTES.json>   → lee el cimiento vivo ya respaldado y escribe cimiento-ARREGLADO-piso-todas-las-fuentes-2026-10-21.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDelNodo, NODO } from './construir-nodo-visual.mjs'

export { NODO }

/** devuelve una COPIA del flujo con el código del nodo cambiado; conserva los fines de línea del nodo que reemplaza */
export function aplicarPisoTodasLasFuentes(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  const n = w.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('el flujo no trae el nodo «' + NODO + '»')
  const nuevo = codigoDelNodo()
  if (!nuevo.includes('derivarPisoVisualTodasLasFuentes(')) throw new Error('el código nuevo no usa la lógica de todas las fuentes')
  if (n.parameters.jsCode.includes('derivarPisoVisualTodasLasFuentes(')) throw new Error('el nodo ya trabaja con todas las fuentes')
  n.parameters = { ...n.parameters, jsCode: n.parameters.jsCode.includes('\r\n') ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
  return w
}

/** Cuando el nodo YA trabaja con todas las fuentes y solo cambia su código (ajustes posteriores a la instalación): devuelve la copia con el código nuevo; falla si no hay nada que cambiar. */
export function actualizarPisoTodasLasFuentes(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  const n = w.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('el flujo no trae el nodo «' + NODO + '»')
  if (!n.parameters.jsCode.includes('derivarPisoVisualTodasLasFuentes(')) throw new Error('el nodo aún no trabaja con todas las fuentes: usa aplicarPisoTodasLasFuentes')
  const nuevo = codigoDelNodo()
  const crlf = n.parameters.jsCode.includes('\r\n')
  const viejo = n.parameters.jsCode.replace(/\r\n/g, '\n')
  if (viejo === nuevo.replace(/\r\n/g, '\n')) throw new Error('el nodo ya tiene este código')
  n.parameters = { ...n.parameters, jsCode: crlf ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-piso-todas-las-fuentes.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-piso-todas-las-fuentes.mjs <ANTES.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(entrada, 'utf8'))
  if (process.argv[3] === '--actualizar') {
    fs.writeFileSync(join(aqui, 'cimiento-ARREGLADO-piso-columnas-2026-10-21.json'), JSON.stringify(actualizarPisoTodasLasFuentes(antes), null, 2))
    console.log('escrito cimiento-ARREGLADO-piso-columnas-2026-10-21.json')
  } else {
    fs.writeFileSync(join(aqui, 'cimiento-ARREGLADO-piso-todas-las-fuentes-2026-10-21.json'), JSON.stringify(aplicarPisoTodasLasFuentes(antes), null, 2))
    console.log('escrito cimiento-ARREGLADO-piso-todas-las-fuentes-2026-10-21.json')
  }
}
