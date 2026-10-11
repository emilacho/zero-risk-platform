// CIMIENTO + LAZO A · r68 · LA FUENTE VA EN LOS METADATOS, NO EN LA PROSA · CC#2 · 2026-10-11 · ronda 68
//
// LO QUE SE ENCONTRÓ (repetición del tramo 1): la regla (1) de las REGLAS DE EVIDENCIA decía «cada afirmación lleva su cita literal y de dónde salió» y las lentes escribieron la procedencia DENTRO de la prosa:
// «(discovery_summary)» ×2 en `positioning`, «(icp_signals)» ×16 en `icp_summary`. Son etiquetas del sistema; el manual no las puede mostrar y el flujo «Manual → Drive» se negó a hacer el PDF.
// LO QUE SE CONSTRUYE: la regla (1) pasa a decir que la fuente se anota en los metadatos del campo (`_field_meta.<campo>.fuente`) y NUNCA en el texto; sin paréntesis de fuente, sin nombres de campos internos,
// sin etiquetas «ICP …». El código (limpieza.ts, ronda 68) lo quita de todos modos si el modelo igual lo escribe: esto evita que lo escriba. Solo cambia ESE texto en los dos nodos que lo traen.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REGLAS_EVIDENCIA } from './construir-r62.mjs'
const aqui = dirname(fileURLToPath(import.meta.url))
export const REGLA_1_ANTES = '(1) Cada afirmación sobre el cliente lleva su cita literal y de dónde salió; si no hay cita, NO la escribas.'
export const REGLA_1_NUEVA = '(1) Cada afirmación sobre el cliente se apoya en una cita literal; si no hay cita, NO la escribas. La FUENTE de cada campo se anota en sus metadatos (`_field_meta.<campo>.fuente`), NUNCA dentro del texto: nada de paréntesis o corchetes de fuente, ni nombres de campos internos (palabras unidas con guion bajo), ni etiquetas como «ICP …».'
export const REGLAS_EVIDENCIA_R68 = REGLAS_EVIDENCIA.replace(REGLA_1_ANTES, REGLA_1_NUEVA)
if (REGLAS_EVIDENCIA_R68 === REGLAS_EVIDENCIA) throw new Error('la regla (1) ya no dice lo esperado')
export const NODOS = ['[BB] Fan-out prep', '[BBA] Re-síntesis prep']
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

/** cambia el texto de las reglas dentro del código del nodo que lo traiga (una vez por nodo) */
export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const tocados = []
  for (const n of nodos) {
    if (!NODOS.includes(n.name)) continue
    const eraCRLF = n.parameters.jsCode.includes('\r\n')
    const c = n.parameters.jsCode.replace(/\r\n/g, '\n')
    const viejo = JSON.stringify(REGLAS_EVIDENCIA), nuevo = JSON.stringify(REGLAS_EVIDENCIA_R68)
    const hay = c.split(viejo).length - 1
    if (hay !== 1) throw new Error(`${n.name}: el texto de las reglas aparece ${hay} veces (debe ser 1)`)
    n.parameters.jsCode = (eraCRLF ? c.replace(viejo, () => nuevo).replace(/\n/g, '\r\n') : c.replace(viejo, () => nuevo))
    tocados.push(n.name)
  }
  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { flujo: { name: antes.name, nodes: nodos, connections: antes.connections, settings }, tocados }
}

if (process.argv[1] && process.argv[1].endsWith('construir-r68.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'cimiento-ANTES-2026-10-11-r68.json'), 'utf8'))
  const { flujo, tocados } = construir(antes)
  writeFileSync(join(aqui, 'cimiento-ARREGLADO-2026-10-11-r68.json'), JSON.stringify(flujo))
  console.log('cimiento · nodo tocado:', tocados.join(', '))
  const antesL = JSON.parse(readFileSync(join(aqui, 'lazoA-ANTES-2026-10-11-r68.json'), 'utf8'))
  const r = construir(antesL)
  writeFileSync(join(aqui, 'lazoA-ARREGLADO-2026-10-11-r68.json'), JSON.stringify(r.flujo))
  console.log('lazo A · nodo tocado:', r.tocados.join(', '))
}
