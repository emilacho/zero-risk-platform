// PLANEACIÓN · r62 · EL REGISTRO DEL PLAN SALE DEL MANUAL DEL CLIENTE · CC#2 · 2026-10-10 · relevo 62 (hallazgo de la prueba desde cero: el plan salió con voseo, «Pedí por WhatsApp», en un cliente cuya regla es tuteo).
//
// LO QUE SE ENCONTRÓ (medido en el flujo vivo):
//   · «① Cargar el manual de marca» pedía SOLO `id, client_id, gate_outcome, created_at` y «① GUARDA» devolvía SOLO la marca (id + aprobado): el redactor NUNCA veía el contenido del manual
//     (su pedido lo dice: «manual: es solo la MARCA del manual, no su contenido»). Ningún registro (tuteo / voseo / usted) llegaba al redactor: lo ponía él.
//
// LO QUE SE CONSTRUYE (lista cerrada · 3 nodos · conexiones, ajustes y los otros 42 nodos IDÉNTICOS):
//   ① «① Cargar el manual de marca» pide además las columnas de voz del manual (voice_description, tone_guidelines, writing_style, tagline, positioning, required_terminology, content_text).
//   ② «① GUARDA» calcula `registro_del_manual` (declarado → inferido de sus textos → sin dato) y lo agrega a lo que devuelve. Mismas guardas de siempre, mismos errores.
//   ③ «Redactor (B4)» resuelve el registro FINAL (manual primero; si no dice nada, el país de la ficha por omisión, DECLARADO como omisión; si no hay, sin dato) y mete en el pedido el bloque
//      «EL REGISTRO DE LA VOZ», justo después del manual. También deja `registro_usado` en su salida para forense.
//
//   node construir-r62.mjs [--salida=<carpeta>]   → escribe `planeacion-construida-r62-2026-10-10.json` (NO toca n8n) · el PUT lo hace quien aplica, con la foto ANTES al lado.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODOS = { cargar: '① Cargar el manual de marca', guarda: '① GUARDA · sin manual aprobado se DETIENE', redactor: 'Redactor (B4)' }
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const BIBLIOTECA = readFileSync(join(aqui, 'registro-del-cliente.js'), 'utf8')
export const COLUMNAS_NUEVAS = 'voice_description,tone_guidelines,writing_style,tagline,positioning,required_terminology,content_text'
const IDENTIFICADORES = ['REGISTRO_POR_PAIS', 'registroDelManual', 'registroFinal', 'bloqueDeRegistro', 'marcasDeRegistro', 'declaraRegistro']

/** reemplaza UNA vez (tolera CRLF) y falla si no encuentra el ancla o la encuentra más de una vez */
function cambiar(codigo, ancla, nuevo, donde) {
  const re = new RegExp(ancla.split(/\r?\n/).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'), 'g')
  const n = (codigo.match(re) || []).length
  if (n !== 1) throw new Error(`${donde}: el ancla aparece ${n} veces (debe ser 1) · ${ancla.slice(0, 70)}`)
  return codigo.replace(re, () => nuevo)
}

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const nodo = (nombre) => { const n = nodos.find((x) => x.name === nombre); if (!n) throw new Error('no está el nodo ' + nombre); return n }

  // ① las columnas del manual
  const cargar = nodo(NODOS.cargar)
  cargar.parameters.url = cambiar(cargar.parameters.url, 'select=id,client_id,gate_outcome,created_at&', `select=id,client_id,gate_outcome,created_at,${COLUMNAS_NUEVAS}&`, 'cargar')

  // ② la guarda calcula el registro del manual
  const guarda = nodo(NODOS.guarda)
  for (const id of IDENTIFICADORES) if (guarda.parameters.jsCode.includes(id)) throw new Error('la guarda ya contiene ' + id)
  guarda.parameters.jsCode = cambiar(guarda.parameters.jsCode,
    'return [{ json: { client_id: cid, manual_id: m.id, manual_aprobado: true } }];',
    `${BIBLIOTECA}\n// r62 · el registro (tuteo / voseo / usted) que fija el manual · el redactor lo recibe en \`manual.registro_del_manual\`\nconst registro_del_manual = registroDelManual(m);\nreturn [{ json: { client_id: cid, manual_id: m.id, manual_aprobado: true, registro_del_manual: registro_del_manual } }];`, 'guarda')

  // ③ el redactor resuelve el final y lo mete en el pedido
  const red = nodo(NODOS.redactor)
  for (const id of IDENTIFICADORES) if (red.parameters.jsCode.includes(id)) throw new Error('el redactor ya contiene ' + id)
  let c = red.parameters.jsCode
  c = cambiar(c, 'const ent = $input.first().json || {};', `${BIBLIOTECA}\nconst ent = $input.first().json || {};`, 'redactor/ent')
  c = cambiar(c, 'const ficha = ent.ficha || {};', `const ficha = ent.ficha || {};\n// r62 · el registro de la voz sale del MANUAL del cliente (declarado o inferido de sus textos); sin dato, el país de la ficha por omisión, declarado; si no, sin dato\nconst registroDelCliente = registroFinal(manual.registro_del_manual, ficha.country);`, 'redactor/ficha')
  c = cambiar(c, "'══════ LO QUE SE FUE A BUSCAR Y SI VINO ══════',", "...bloqueDeRegistro(registroDelCliente),\n'══════ LO QUE SE FUE A BUSCAR Y SI VINO ══════',", 'redactor/ancla')
  c = cambiar(c, 'resumen_del_paquete: {', 'registro_usado: registroDelCliente,\n    resumen_del_paquete: {', 'redactor/salida')
  red.parameters.jsCode = c

  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { name: antes.name, nodes: nodos, connections: antes.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-r62.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'planeacion-antes-r62-2026-10-10.json'), 'utf8'))
  const nuevo = construir(antes)
  const dir = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9) || aqui
  writeFileSync(join(dir, 'planeacion-construida-r62-2026-10-10.json'), JSON.stringify(nuevo))
  console.log('escrito planeacion-construida-r62-2026-10-10.json · nodos', nuevo.nodes.length)
}
