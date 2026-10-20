/**
 * r80 · D4 · copia por filas (BNXqlaX1oHSfZIpF) · el KIT DE HISTORIAS sale del calendario, por código.
 *  · «④ Chequeos»: antepone `kit-de-historias.js` (lógica pura), agrupa las filas de familia `kit_historias` del lote en UN brief de kit (cada fila = un elemento con SU fecha y hora),
 *    cuenta esas filas como briefeadas, escribe `- ELEMENTOS:` en el parte y deja el kit en `familias_por_brief` (familia kit_historias) y en `provenance_tag.kit`.
 *  · «③ Armar el cuerpo del redactor»: el pedido ahora le dice a qué filas NO briefear una por una (solo lo macro de la semana); la fila lleva su `familia`.
 * Reversa: republicar `copia-r80-ANTES.json` (= el estado de la r79).
 * 🔴 SIGUE (20-oct): la guarda «① sin manual aprobado se DETIENE» (y ④/⑤ Seco) se mantienen desde `BNXqlaX1oHSfZIpF/construir-ensayo-sin-manual-2026-10-20.mjs` (el ensayo sin manual del tramo 8).
 *    Reconstruir la copia de la cadena = este constructor Y LUEGO ese: si no, la guarda vuelve a la de antes. La prueba `brief-ensayo-sin-manual` exige que su ANTES sea el estado r80.
 * Uso: import { construirFlujo } y pasarle el flujo ({ name, nodes, connections, settings }).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const N3 = '③ Armar el cuerpo del redactor'
const N4 = '④ Chequeos'

const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
const sinExports = (js) => js.replace(/\r\n/g, '\n').replace(/\nif \(typeof module !== 'undefined' && module\.exports\)[^\n]*\n?/, '\n')

export function cambiarChequeos(codigo, modulo) {
  const crlf = codigo.includes('\r\n')
  let s = codigo.replace(/\r\n/g, '\n')
  if (s.includes('agruparKit(')) throw new Error('«④ Chequeos» ya trae el kit (r80) · no construir dos veces')
  s = unaVez(s, "var TIPOS_SIN_VIDEO = ['imagen', 'texto', 'listado', 'configuracion', 'carrusel', 'documento', 'otro']", "var TIPOS_SIN_VIDEO = ['imagen', 'texto', 'listado', 'configuracion', 'carrusel', 'documento', 'otro', 'kit']", 'tipos')
  // cada fila del lote cuenta como briefeada también cuando el entregable es un kit con `fila_ids`
  s = unaVez(s, "  ents.forEach(function (e) { var k = e && e.fila_id; if (k) cuenta[k] = (cuenta[k] || 0) + 1 })\n", "  var filasDe = function (e) { return e && Array.isArray(e.fila_ids) && e.fila_ids.length ? e.fila_ids : (e && e.fila_id ? [e.fila_id] : []) }\n  ents.forEach(function (e) { filasDe(e).forEach(function (k) { cuenta[k] = (cuenta[k] || 0) + 1 }) })\n", 'conteo de filas')
  s = unaVez(s, "  ents.forEach(function (e) { if (e && e.fila_id && esperadas.indexOf(e.fila_id) === -1) falla('fila_ajena', e.fila_id, 'el entregable ' + (e.id || '?') + ' trae un fila_id que NO es del lote') })\n", "  ents.forEach(function (e) { filasDe(e).forEach(function (k) { if (esperadas.indexOf(k) === -1) falla('fila_ajena', k, 'el entregable ' + (e.id || '?') + ' trae un fila_id que NO es del lote') }) })\n", 'fila ajena')
  s = unaVez(s, '// ④ CHEQUEOS · cuerpo del nodo', sinExports(modulo).trim() + '\n\n// ④ CHEQUEOS · cuerpo del nodo', 'módulo del kit')
  s = unaVez(s, "const parte = ext.legible ? ext.parte : { entregables: [], pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [] }\n", "// r80 · D4 · las filas de familia `kit_historias` del lote se agrupan por código en UN brief de kit (cada fila = un elemento con su fecha y hora)\nconst kitAgrupado = ext.legible ? agruparKit(ext.parte, c.filas_lote) : { parte: null, kit: null }\nconst parte = ext.legible ? kitAgrupado.parte : { entregables: [], pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [] }\n", 'agrupar')
  s = unaVez(s, "  p('### ' + (e.id || '(sin id)') + ' · ' + (e.plataforma || '?') + ' · ' + (e.tipo_de_pieza || '?'))\n", "  p('### ' + (e.id || '(sin id)') + ' · ' + (e.plataforma || '?') + ' · ' + (e.es_kit ? 'kit de historias' : (e.tipo_de_pieza || '?')))\n", 'encabezado')
  s = unaVez(s, "  p('- NEGATIVOS:\\n' + lista(e.negativos))\n", "  p('- NEGATIVOS:\\n' + lista(e.negativos))\n  if (e.es_kit) p('- ELEMENTOS:\\n' + lista(e.elementos))\n", 'elementos')
  s = unaVez(s, "  return { brief_id: e && e.id ? String(e.id) : null, fila_id: e && e.fila_id ? String(e.fila_id) : null, familia: (e && e.fila_id && familiaPorFila[e.fila_id]) || null }\n", "  if (e && e.es_kit) return { brief_id: String(e.id), fila_id: e.fila_ids && e.fila_ids[0] ? String(e.fila_ids[0]) : null, fila_ids: e.fila_ids, familia: FAMILIA_DEL_KIT }\n  return { brief_id: e && e.id ? String(e.id) : null, fila_id: e && e.fila_id ? String(e.fila_id) : null, familia: (e && e.fila_id && familiaPorFila[e.fila_id]) || null }\n", 'familias por brief')
  s = unaVez(s, "    legible: ext.legible,\n", "    legible: ext.legible,\n    kit: kitAgrupado.kit ? { brief_id: kitAgrupado.kit.brief_id, filas: kitAgrupado.kit.fila_ids.length, absorbidos: kitAgrupado.kit.absorbidos } : null,\n", 'provenance_tag')
  return crlf ? s.replace(/\n/g, '\r\n') : s
}

export function cambiarPedido(codigo) {
  const crlf = codigo.includes('\r\n')
  let s = codigo.replace(/\r\n/g, '\n')
  if (s.includes('kit_historias')) throw new Error('«③» ya trae la regla del kit (r80) · no construir dos veces')
  s = unaVez(s, "sede: f.sede, datos: f.datos, pendientes: f.pendientes } })),", "sede: f.sede, datos: f.datos, pendientes: f.pendientes, familia: f.familia || null } })),", 'fila con familia')
  s = unaVez(s, "La fecha y la hora de cada pieza son las de su fila: no las cambies.',", "La fecha y la hora de cada pieza son las de su fila: no las cambies. EXCEPCIÓN: las filas cuya `familia` es «kit_historias» (historias y estados) NO se briefean una por una: entrega para todas ellas UN solo entregable MACRO de la semana (qué se cuenta, objetivo, UN mensaje, segmento, tono) con `fila_ids` (la lista de esas filas) en lugar de `fila_id`, y SIN lista de elementos: el código arma cada historia con la fecha y la hora de su fila.',", 'regla del kit')
  return crlf ? s.replace(/\n/g, '\r\n') : s
}

export function construirFlujo(flujo, modulo = fs.readFileSync(path.join(AQUI, 'kit-de-historias.js'), 'utf8')) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n4 = copia.nodes.find((x) => x.name === N4), n3 = copia.nodes.find((x) => x.name === N3)
  if (!n4 || !n3) throw new Error('faltan los nodos ③ o ④')
  n4.parameters.jsCode = cambiarChequeos(n4.parameters.jsCode, modulo)
  n3.parameters.jsCode = cambiarPedido(n3.parameters.jsCode)
  return copia
}
