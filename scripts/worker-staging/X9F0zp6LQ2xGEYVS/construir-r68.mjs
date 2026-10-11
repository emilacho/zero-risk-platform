// PLANEACIÓN · r68 · EL REGISTRO DEL PLAN, REVISADO POR CÓDIGO · CC#2 · 2026-10-11 · ronda 68 (repetición del tramo 1: el plan salió con «Pedí por WhatsApp» en un texto de ejemplo, en un manual y un plan en tuteo)
//
// LO QUE SE ENCONTRÓ: el registro (tuteo/voseo/usted) ya llega al redactor (r62/r63), pero NADA comprueba el texto que vuelve: un «Pedí» suelto pasó tal cual al plan guardado y al PDF.
// LO QUE SE CONSTRUYE (1 nodo, lista cerrada · conexiones y ajustes idénticos): «¿Llegó la vuelta?» recibe `registro-del-plan.js` y, con el registro final del propio redactor
//   (`$('Redactor (B4)').registro_usado.registro`), CORRIGE las formas de voseo cuando el registro es tuteo (tabla del barrido; lo citado entre «…» o `…` no se toca) y MARCA lo que no pudo arreglar
//   en un bloque corto al final del plan («Revisión del registro (la hace el sistema)»). Con voseo o usted no reescribe: deja la cuenta en la salida. Todo queda en `registro_revisado` (conteos y formas).
//
//   node construir-r68.mjs   → lee `planeacion-ANTES-r68-2026-10-11.json` (el vivo antes del cambio) y escribe `planeacion-construida-r68-2026-10-11.json` (NO toca n8n)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODO = '¿Llegó la vuelta?'
export const BIBLIOTECA_PLAN = readFileSync(join(aqui, 'registro-del-plan.js'), 'utf8')
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

function cambiar(codigo, ancla, nuevo, donde) {
  const hay = codigo.split(ancla).length - 1
  if (hay !== 1) throw new Error(`${donde}: el ancla aparece ${hay} veces (debe ser 1) · ${ancla.slice(0, 70)}`)
  return codigo.replace(ancla, () => nuevo)
}

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const n = nodos.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  const eraCRLF = n.parameters.jsCode.includes('\r\n')
  let c = n.parameters.jsCode.replace(/\r\n/g, '\n')
  if (c.includes('corregirRegistroDelPlan')) throw new Error('el nodo ya trae r68 · no construir dos veces')
  c = cambiar(c, 'const e = $input.first().json || {};', `${BIBLIOTECA_PLAN}\nconst e = $input.first().json || {};`, 'biblioteca')
  c = cambiar(c, "const texto = llego ? textoDelRedactor.replace(/\\s+$/, '') + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;",
`// r68 · el registro del plan se REVISA por código: con tuteo se corrige el voseo suelto («Pedí» → «Pide»); lo que no se puede arreglar solo se marca al final
let registroDelPlan = null;
try { registroDelPlan = $('Redactor (B4)').first().json.registro_usado.registro; } catch (x) { registroDelPlan = null; }
const revisionDeRegistro = llego ? corregirRegistroDelPlan(textoDelRedactor, registroDelPlan) : null;
const textoRevisado = revisionDeRegistro ? revisionDeRegistro.texto : textoDelRedactor;
const bloqueRevision = revisionDeRegistro ? bloqueDeRevisionDeRegistro(revisionDeRegistro, registroDelPlan) : '';
const texto = llego ? textoRevisado.replace(/\\s+$/, '') + bloqueRevision + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;`, 'texto')
  c = cambiar(c, '  descartados_declarados:', `  registro_revisado: revisionDeRegistro ? { registro: registroDelPlan, corregidas: revisionDeRegistro.corregidas.length, formas_corregidas: revisionDeRegistro.corregidas.map((x) => x.antes + ' → ' + x.despues).slice(0, 40), restantes: revisionDeRegistro.restantes } : null,\n  descartados_declarados:`, 'salida')
  n.parameters.jsCode = eraCRLF ? c.replace(/\n/g, '\r\n') : c
  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { name: antes.name, nodes: nodos, connections: antes.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-r68.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'planeacion-ANTES-r68-2026-10-11.json'), 'utf8'))
  const nuevo = construir(antes)
  writeFileSync(join(aqui, 'planeacion-construida-r68-2026-10-11.json'), JSON.stringify(nuevo))
  console.log('escrito planeacion-construida-r68-2026-10-11.json · nodos', nuevo.nodes.length)
}
