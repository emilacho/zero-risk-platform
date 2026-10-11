// TEXTO → DRIVE (PDF) · r73 · SIN BASURA EN LA RAÍZ DE DRIVE Y, SI ALGO FALLA, EL FLUJO LO DICE · CC#2 · 2026-10-11 · ronda 73
//
// LO QUE SE ENCONTRÓ (LISTO-CC1-paso-2 §5): tras subir el plan quedaban en la raíz «Plan de 90 dias · … (temporal)» y 2 archivos «Untitled» de 0 bytes.
//   ① «(temporal)»: «Borrar el documento intermedio» armaba la dirección con `($('Subir texto como documento').first().json.body || {}).id`, pero esa salida NO trae `body` (el `id` está arriba)
//      ⇒ DELETE …/files/undefined ⇒ 404 que `neverError` callaba, y «Verificar» solo miraba el PDF ⇒ «Salió bien» con el temporal vivo. (El mismo defecto del manual, arreglado en la ronda 71.)
//   ② «Untitled» de 0 bytes: «Crear carpeta si no existe» hacía POST /files con cuerpo `{}` CUANDO LA CARPETA YA EXISTÍA ⇒ Drive creaba un archivo sin nombre en la raíz en cada corrida
//      (creado 1 s antes del temporal, mime application/octet-stream, 0 bytes). Ahora, si la carpeta existe, esa llamada es un GET de la carpeta (no crea nada); solo crea si no existe.
// LO QUE SE CONSTRUYE (4 nodos · conexiones y ajustes idénticos):
//   «Crear carpeta si no existe» · «Borrar el documento intermedio» · «Verificar que el PDF esta» (ok = PDF con nombre Y temporal borrado, con `motivo`) · «Campana …» (dice cuál de las dos cosas falló).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const NODOS = { carpeta: 'Crear carpeta si no existe', borrar: 'Borrar el documento intermedio', verificar: 'Verificar que el PDF esta', campana: 'Campana el documento no llego a Drive' }

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
export const CUERPO_DE_CAMPANA = "={{ JSON.stringify({ text: ($json.pdf_ok ? ':page_facing_up: *El PDF quedo en Drive, pero el cierre no salio limpio* — ' : ':page_facing_up: *Un documento no llego a Drive* — ') + ($json.motivo || 'la subida fallo') + '\\n• cliente `' + ($json.client_name || '?') + '`\\n' + ($json.pdf_ok ? '• el PDF *si* esta en la carpeta del cliente · lo que falta es borrar el documento \"(temporal)\" de la raiz de Drive (a la papelera)' : '• el texto *si* lo tenemos · lo que falta es el PDF en Drive\\n• se reintenta disparando este flujo de nuevo con el client_id') }) }}"

// «Crear carpeta si no existe»: con carpeta ya hallada es un GET de esa carpeta (no crea nada); sin carpeta, el POST de siempre
export const CARPETA = {
  method: "={{ $json.folder_id ? 'GET' : 'POST' }}",
  url: "=https://www.googleapis.com/drive/v3/files{{ $json.folder_id ? '/' + $json.folder_id : '' }}?fields=id",
  sendBody: "={{ !$json.folder_id }}",
  jsonBody: "={{ JSON.stringify({ name: $json.client_name, mimeType: 'application/vnd.google-apps.folder', parents: ['1WRmkLvj5CMdbohf4T2INsG0hn5Ebl88d'] }) }}",
}

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const nodo = (nombre) => { const n = nodos.find((x) => x.name === nombre); if (!n) throw new Error('no está el nodo ' + nombre); return n }
  const c = nodo(NODOS.carpeta)
  if (!String(c.parameters.jsonBody).includes("$json.folder_id ? '{}'")) throw new Error('el nodo de la carpeta ya no es el de antes · rehacer desde el vivo')
  Object.assign(c.parameters, CARPETA)
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

export const construirFlujo = construir

if (process.argv[1] && process.argv[1].endsWith('construir-r73.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'texto-a-drive-r73-ANTES.json'), 'utf8'))
  writeFileSync(join(aqui, 'texto-a-drive-r73-ARREGLADO.json'), JSON.stringify(construir(antes), null, 2))
  console.log('escrito texto-a-drive-r73-ARREGLADO.json')
}
