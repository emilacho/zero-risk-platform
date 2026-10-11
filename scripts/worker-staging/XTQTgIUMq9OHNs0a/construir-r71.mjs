// MANUAL → DRIVE (PDF) · r71 · EL BORRADO DEL DOCUMENTO TEMPORAL FUNCIONA Y, SI FALLA, EL FLUJO LO DICE · CC#2 · 2026-10-11 · ronda 71
//
// LO QUE SE ENCONTRÓ (certificación CC#3 r70 §A.4): «Borrar el documento intermedio» armaba la dirección con `($('Subir texto como documento').first().json.body || {}).id`, pero la salida de la subida
// NO trae `body` (el `id` está arriba) ⇒ DELETE …/files/undefined ⇒ 404 (HTML) ⇒ el nodo, con `neverError`, lo callaba y «Verificar» solo miraba el PDF ⇒ el flujo decía «Salió bien»
// mientras en la raíz de Drive se acumulaba «Manual de Marca · … (temporal)».
// LO QUE SE CONSTRUYE (3 nodos · conexiones y ajustes idénticos):
//   ① «Borrar el documento intermedio»: toma el id donde esté (`body.id` o `id`) y pide la respuesta COMPLETA (código de estado) para poder saber si borró.
//   ② «Verificar que el PDF esta»: `ok` = PDF con nombre Y documento temporal borrado (200/204 de Drive). Si algo falla, `motivo` dice qué, y `pdf_ok` / `intermedio_borrado` lo separan.
//   ③ «Campana …»: si el PDF sí está pero el temporal no se borró, el aviso lo dice así (no «el manual no llegó a Drive»).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const NODOS = { borrar: 'Borrar el documento intermedio', verificar: 'Verificar que el PDF esta', campana: 'Campana el manual no llego a Drive' }

export const URL_DE_BORRADO = "=https://www.googleapis.com/drive/v3/files/{{ (($('Subir texto como documento').first().json.body || {}).id) || $('Subir texto como documento').first().json.id }}"
export const CODIGO_DE_VERIFICAR = `// El recibo dice lo que la RESPUESTA de Drive contesto, no lo que se pidio.
const patch = $('Nombre y carpeta del PDF').first().json;
const r = patch.body || patch;
const pdfOk = !!(r && r.id && r.name);
const prev = $('Carpeta definitiva').first().json;
// el documento temporal: Drive contesta 204 (o 200) cuando lo borra · cualquier otra cosa = NO se borro (antes se callaba)
let codigo = null, borrado = false;
try { const b = $('Borrar el documento intermedio').first().json; codigo = Number(b.statusCode); borrado = codigo === 204 || codigo === 200; } catch (e) { borrado = false; }
const ok = pdfOk && borrado;
const motivo = !pdfOk ? 'Drive no devolvio el archivo con nombre'
  : !borrado ? 'el PDF quedo en Drive pero el documento temporal NO se borro (respuesta de Drive: ' + (codigo === null || isNaN(codigo) ? 'sin codigo' : codigo) + ')'
  : null;
return [{ json: { ok, pdf_ok: pdfOk, intermedio_borrado: borrado, codigo_borrado: (codigo === null || isNaN(codigo)) ? null : codigo,
  file_id: r && r.id || null, nombre: r && r.name || null,
  url: r && r.webViewLink || null, folder_id: prev.folder_id,
  folder_reusada: !!prev.folder_reusada, client_name: prev.client_name,
  motivo } }];`
export const CUERPO_DE_CAMPANA = "={{ JSON.stringify({ text: ($json.pdf_ok ? ':page_facing_up: *El PDF del manual quedo en Drive, pero el cierre no salio limpio* — ' : ':page_facing_up: *El manual no llego a Drive* — ') + ($json.motivo || 'la subida fallo') + '\\n• cliente `' + ($json.client_name || '?') + '`\\n' + ($json.pdf_ok ? '• el PDF *si* esta en la carpeta del cliente · lo que falta es borrar el documento \"(temporal)\" de la raiz de Drive (a la papelera)' : '• el manual *si* quedo guardado en la base · lo que falta es el PDF en Drive\\n• se reintenta disparando este flujo de nuevo con el client_id') }) }}"

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const nodo = (nombre) => { const n = nodos.find((x) => x.name === nombre); if (!n) throw new Error('no está el nodo ' + nombre); return n }
  const b = nodo(NODOS.borrar)
  if (!b.parameters.url.includes("json.body || {}).id }}")) throw new Error('el nodo de borrado ya no es el de antes · rehacer desde el vivo')
  b.parameters.url = URL_DE_BORRADO
  b.parameters.options = { ...b.parameters.options, response: { response: { fullResponse: true, neverError: true } } }
  nodo(NODOS.verificar).parameters.jsCode = CODIGO_DE_VERIFICAR
  nodo(NODOS.campana).parameters.jsonBody = CUERPO_DE_CAMPANA
  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { name: antes.name, nodes: nodos, connections: antes.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-r71.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'manual-a-drive-ANTES-r71.json'), 'utf8'))
  writeFileSync(join(aqui, 'manual-a-drive-ARREGLADO-r71.json'), JSON.stringify(construir(antes)))
  console.log('escrito manual-a-drive-ARREGLADO-r71.json')
}
