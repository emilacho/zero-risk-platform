// MANUAL → DRIVE (PDF) · r73 · el mismo «Untitled» de 0 bytes que el flujo del plan: «Crear carpeta si no existe» hacía POST /files con `{}` cuando la carpeta ya existía.
// Un SOLO nodo cambia (el del plan y este comparten el nodo): con carpeta hallada es un GET de la carpeta (no crea nada); sin carpeta, el POST de siempre.
import { CARPETA, NODOS } from '../rXR5GmnrGF6Dkwgq/construir-r73.mjs'
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const c = copia.nodes.find((x) => x.name === NODOS.carpeta)
  if (!c) throw new Error('no está el nodo ' + NODOS.carpeta)
  if (!String(c.parameters.jsonBody).includes("$json.folder_id ? '{}'")) throw new Error('el nodo de la carpeta ya no es el de antes · rehacer desde el vivo')
  Object.assign(c.parameters, CARPETA)
  return copia
}
