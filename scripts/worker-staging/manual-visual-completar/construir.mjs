// «Manual · completar lo visual» · flujo NUEVO de n8n (nace INACTIVO) · CC#1 · 2026-10-21 · ENCARGO manual visual con todas las fuentes, T4.
// Cuando las copias de fotos (o los colores de la ficha) llegan DESPUÉS de promovido el manual, vuelve a correr el piso visual (el MISMO código del cimiento) y promueve una versión nueva
// del manual por la ruta canónica (POST /api/brand-book/[clientId]) SOLO si el visual mejora. Autorizados: cadena_config.manual_visual_clientes (vacía ⇒ no hace nada).
//
//   node construir.mjs      → escribe flujo-manual-visual-completar.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDelNodo } from '../ssLtwYPt7zxuvnM2/construir-nodo-visual.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const src = (f) => fs.readFileSync(join(aqui, f), 'utf8')
const sinExports = (js) => { const i = js.indexOf("if (typeof module !== 'undefined' && module.exports)"); return i === -1 ? js : js.slice(0, i) }
const LOGICA = sinExports(src('barrido-logica.js'))

export const NOMBRE = 'Zero Risk — Manual · completar lo visual (CC#1 · T4)'
export const NODOS = {
  reloj: 'Cada 30 min', webhook: 'Webhook · un cliente', elegir: 'Elegir el cliente', hay: '¿Hay trabajo?', pasar: 'Validate Deal Data', piso: 'Piso visual · todas las fuentes',
  decidir: 'Decidir y armar', promover_if: '¿Promover?', promover: 'Promover el manual (versión nueva)', cierre: 'Cierre · guardado de verdad', sin_mejora: 'Sin mejora · queda como está',
}
export const codigos = () => ({
  elegir: LOGICA + '\n' + src('elegir.js'),
  pasar: src('pasar.js'),
  piso: codigoDelNodo(),
  decidir: LOGICA + '\n' + src('decidir.js'),
  cierre: src('cierre.js'),
})

export function construirFlujo() {
  const c = codigos()
  const code = (id, name, jsCode, pos) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { language: 'javaScript', jsCode } })
  const si = (id, name, campo, pos) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.' + campo + ' }}', rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } })
  const nodes = [
    { id: 'reloj', name: NODOS.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/30 * * * *' }] } } },
    { id: 'webhook', name: NODOS.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 200], webhookId: 'manual-visual-completar', parameters: { httpMethod: 'POST', path: 'manual-visual-completar', responseMode: 'lastNode', options: {} } },
    code('elegir', NODOS.elegir, c.elegir, [260, 100]),
    si('hay', NODOS.hay, 'correr', [520, 100]),
    code('pasar', NODOS.pasar, c.pasar, [780, 0]),
    { ...code('piso', NODOS.piso, c.piso, [1040, 0]), onError: 'continueRegularOutput' },
    code('decidir', NODOS.decidir, c.decidir, [1300, 0]),
    si('promover_if', NODOS.promover_if, 'promover', [1560, 0]),
    {
      id: 'promover', name: NODOS.promover, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1820, -100],
      parameters: {
        method: 'POST', url: "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/brand-book/' + $json.client_id }}", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}', options: { timeout: 60000, response: { response: { neverError: true } } },
      },
    },
    code('cierre', NODOS.cierre, c.cierre, [2080, -100]),
    code('sin_mejora', NODOS.sin_mejora, '// el intento ya quedó anotado (huella + día): sin entradas nuevas no se repite\nreturn [{ json: $input.first().json }]\n', [1820, 100]),
  ]
  const enlaces = [
    [NODOS.reloj, NODOS.elegir], [NODOS.webhook, NODOS.elegir], [NODOS.elegir, NODOS.hay],
    [NODOS.hay, NODOS.pasar, 0], [NODOS.pasar, NODOS.piso], [NODOS.piso, NODOS.decidir], [NODOS.decidir, NODOS.promover_if],
    [NODOS.promover_if, NODOS.promover, 0], [NODOS.promover_if, NODOS.sin_mejora, 1], [NODOS.promover, NODOS.cierre],
  ]
  const connections = {}
  for (const [a, b, salida = 0] of enlaces) {
    connections[a] = connections[a] || { main: [] }
    connections[a].main[salida] = connections[a].main[salida] || []
    connections[a].main[salida].push({ node: b, type: 'main', index: 0 })
  }
  return { name: NOMBRE, nodes, connections, settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', errorWorkflow: '5fkPLbZvQsQa1bcd' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir.mjs')) {
  fs.writeFileSync(join(aqui, 'flujo-manual-visual-completar.json'), JSON.stringify(construirFlujo(), null, 2))
  console.log('escrito flujo-manual-visual-completar.json')
}
