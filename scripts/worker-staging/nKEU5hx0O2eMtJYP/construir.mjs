// E63 · construye el reconciliador desde el retrato VIVO · sin red.
// node scripts/worker-staging/nKEU5hx0O2eMtJYP/construir.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'reconciliador-VIVO-2026-09-16.json'), 'utf8'))
const codigo = (f) => readFileSync(join(aqui, f), 'utf8')

const porNombre = Object.fromEntries(vivo.nodes.map((n) => [n.name, n]))
const reloj = porNombre['Every 15 min']
const consulta = structuredClone(porNombre['Query waiting execs'])
const decide = structuredClone(porNombre['Find stuck (>20min)'])

// la consulta · respuesta completa (se ve el código HTTP) y un fallo de red NO rompe
// antes de decidir: entra al decisor como `{error}` y se lee como «no sé»
consulta.parameters.options.response = { response: { neverError: true, fullResponse: true } }
consulta.onError = 'continueRegularOutput'

decide.parameters.jsCode = codigo('decide.js')

const puerta = {
  id: 'e63-puerta-0001-0000-000000000001',
  name: 'Puerta · preguntar a pedido',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [400, 500],
  webhookId: 'e63-reconciliador-colgados',
  parameters: { httpMethod: 'POST', path: 'zero-risk/reconciliador-colgados', options: {} },
}

const grita = {
  id: 'e63-grita-00001-0000-000000000002',
  name: '¿Grita?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [1060, 300],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [
        { id: 'grita', leftValue: '={{ $json.grita }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
      ],
      combinator: 'and',
    },
    options: {},
  },
}

// mismo canal y mismo transporte que el vigía del silencio (0WRWM0cChdiAxfTY)
const aviso = {
  id: 'e63-aviso-00001-0000-000000000003',
  name: 'AVISO · #alertas',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1280, 220],
  parameters: {
    method: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' },
        { name: 'Content-Type', value: 'application/json; charset=utf-8' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody:
      '={{ JSON.stringify({ channel: "C0B7XUUEBHA", text: "🔴 RECONCILIADOR · " + $json.titulo, blocks: [ { type: "section", text: { type: "mrkdwn", text: "*🔴 RECONCILIADOR DE COLGADOS · " + $json.titulo + "*" } }, { type: "section", text: { type: "mrkdwn", text: $json.detalle || "(sin detalle)" } }, { type: "section", text: { type: "mrkdwn", text: "*QUÉ HACER:* " + ($json.que_hacer || "revisar") } }, { type: "context", elements: [ { type: "mrkdwn", text: "estado `" + $json.estado + "` · " + $json.por_que_grita + " · " + $json.medido_en + " · reconciliador nKEU5hx0O2eMtJYP (E63)" } ] } ] }) }}',
    options: { timeout: 30000, response: { response: { neverError: true } } },
  },
}

const cierre = {
  id: 'e63-cierre-0001-0000-000000000004',
  name: 'Cierre · no saber no es verde',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1500, 300],
  parameters: { jsCode: codigo('cierre.js'), mode: 'runOnceForAllItems' },
}

const construido = {
  name: vivo.name,
  nodes: [reloj, puerta, consulta, decide, grita, aviso, cierre],
  connections: {
    'Every 15 min': { main: [[{ node: 'Query waiting execs', type: 'main', index: 0 }]] },
    'Puerta · preguntar a pedido': { main: [[{ node: 'Query waiting execs', type: 'main', index: 0 }]] },
    'Query waiting execs': { main: [[{ node: 'Find stuck (>20min)', type: 'main', index: 0 }]] },
    'Find stuck (>20min)': { main: [[{ node: '¿Grita?', type: 'main', index: 0 }]] },
    '¿Grita?': {
      main: [
        [{ node: 'AVISO · #alertas', type: 'main', index: 0 }],
        [{ node: 'Cierre · no saber no es verde', type: 'main', index: 0 }],
      ],
    },
    'AVISO · #alertas': { main: [[{ node: 'Cierre · no saber no es verde', type: 'main', index: 0 }]] },
  },
  settings: vivo.settings,
}

writeFileSync(join(aqui, 'reconciliador-construido.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', construido.nodes.length, 'nodos')
