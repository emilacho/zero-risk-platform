// TEXTO → DRIVE y MANUAL → DRIVE · r74 · «Crear carpeta si no existe» NO CREABA UNA CARPETA (hallazgo de CC#3 en la prueba real del 20-oct, `LISTO-CC3-drive-sin-caducar`).
// Medido con un eco propio (sin Drive): n8n NO envía el cuerpo de un httpRequest 4.2 cuando `sendBody` es una EXPRESIÓN (`"={{ !$json.folder_id }}"`): llega `{}` sin Content-Type, y Drive
// contesta con un archivo «Untitled» `application/octet-stream` (no una carpeta). Luego el PATCH del PDF pide `addParents=<ese id>` y Drive responde 403 `parentNotAFolder`. Las pruebas de r73 evaluaban
// la expresión como JavaScript (daba true) y por eso el defecto pasó: aquí la regla es que `sendBody` sea un booleano LITERAL.
// Cambios (los dos flujos reciben EXACTAMENTE lo mismo): (1) «Crear carpeta si no existe» pasa a un POST fijo con `sendBody: true` y pide `fields=id,mimeType`; (2) un IF «¿Ya hay carpeta?» decide
// si se crea (así una carpeta hallada ya no dispara ninguna llamada); (3) «La carpeta es una carpeta» PARA con error propio si Drive no devolvió `mimeType` de carpeta, antes de subir nada.
import { readFileSync } from 'node:fs'

export const NODOS = { buscar: 'Carpeta usar o crear', crear: 'Crear carpeta si no existe', definitiva: 'Carpeta definitiva', hay: '¿Ya hay carpeta?', verificar: 'La carpeta es una carpeta' }
export const MIME_CARPETA = 'application/vnd.google-apps.folder'
export const PADRE = '1WRmkLvj5CMdbohf4T2INsG0hn5Ebl88d'

export const CREAR = {
  method: 'POST',
  url: 'https://www.googleapis.com/drive/v3/files?fields=id,mimeType',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googleOAuth2Api',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ name: $json.client_name, mimeType: '" + MIME_CARPETA + "', parents: ['" + PADRE + "'] }) }}",
  options: { response: { response: { neverError: true } }, timeout: 30000 },
}

export const HAY = {
  conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ !!$json.folder_id }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] },
}

export const CODIGO_DE_VERIFICAR = `// r74 · Drive tiene que devolver una CARPETA. Un archivo «Untitled» (application/octet-stream) NO es carpeta: se PARA aquí, antes de subir nada.
const prev = $('${NODOS.buscar}').first().json;
const r = $json.body || $json;
if (!r || !r.id || r.mimeType !== '${MIME_CARPETA}') {
  throw new Error('DRIVE_NO_CREO_CARPETA · Drive devolvió ' + JSON.stringify(r || null).slice(0, 200) + ' (se esperaba mimeType ${MIME_CARPETA}) · se DETIENE antes de subir nada');
}
return [{ json: Object.assign({}, prev, { folder_id: r.id, id: r.id, folder_creada: true }) }];`

const SENTINELA = (c) => typeof c.parameters.sendBody === 'string' && c.parameters.sendBody.startsWith('={{')

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => copia.nodes.find((x) => x.name === n)
  const crear = nodo(NODOS.crear), buscar = nodo(NODOS.buscar), definitiva = nodo(NODOS.definitiva)
  if (!crear || !buscar || !definitiva) throw new Error('faltan nodos de la carpeta: rehacer desde el vivo')
  if (copia.nodes.some((x) => x.name === NODOS.hay || x.name === NODOS.verificar)) throw new Error('el flujo ya tiene el arreglo r74')
  if (!SENTINELA(crear)) throw new Error('el nodo de la carpeta ya no es el de antes (sendBody ya no es una expresión) · rehacer desde el vivo')
  crear.parameters = JSON.parse(JSON.stringify(CREAR))
  const [x, y] = crear.position
  crear.position = [x, y + 120]
  copia.nodes.push(
    { id: 'cc3-r74-hay', name: NODOS.hay, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x - 110, y], parameters: JSON.parse(JSON.stringify(HAY)) },
    { id: 'cc3-r74-verifica', name: NODOS.verificar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 110, y + 120], parameters: { jsCode: CODIGO_DE_VERIFICAR } },
  )
  const c = copia.connections
  const main = (n) => [[{ node: n, type: 'main', index: 0 }]]
  c[NODOS.buscar] = { main: main(NODOS.hay) }
  c[NODOS.hay] = { main: [[{ node: NODOS.definitiva, type: 'main', index: 0 }], [{ node: NODOS.crear, type: 'main', index: 0 }]] }
  c[NODOS.crear] = { main: main(NODOS.verificar) }
  c[NODOS.verificar] = { main: main(NODOS.definitiva) }
  return copia
}

export const leer = (p) => JSON.parse(readFileSync(p, 'utf8'))
