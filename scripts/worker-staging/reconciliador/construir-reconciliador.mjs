// Constructor del flujo «Reconciliador de despachos huérfanos» (un reloj aparte) · CC#1 · 2026-09-30.
//
//   node construir-reconciliador.mjs --salida=rec.json     → solo escribe el JSON · NO toca n8n
//   node construir-reconciliador.mjs --crear               → crea el flujo REAL en n8n, INACTIVO (no se publica)
//   node construir-reconciliador.mjs --prueba              → crea una COPIA temporal de SOLO LECTURA (webhook · no escribe ni avisa) INACTIVA
//
// No toca el camino crítico: ni run-sdk, ni el corredor, ni ningún flujo. Solo LEE agent_dispatches / agent_invocations /
// agent_callback_attempts y escribe su propia tabla (agent_dispatch_reconciliations) y un aviso a #alertas.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

export const N = {
  reloj: 'Reloj · cada 5 minutos',
  webhook: 'Webhook · prueba de solo lectura',
  reconciliar: 'Reconciliar',
  hayAvisos: '¿Hay hallazgos nuevos?',
  armar: 'Armar el aviso',
  slack: 'AVISO · #alertas',
  marcar: 'Marcar avisados',
}
const CANAL_ALERTAS = 'C0B7XUUEBHA' // el mismo #alertas del aviso de error E73

function sinExports(js) {
  const i = js.indexOf("if (typeof module !== 'undefined' && module.exports)")
  return i === -1 ? js : js.slice(0, i)
}
export function codigoDeNodo(clave, soloLectura = false) {
  switch (clave) {
    case 'reconciliar': return `const SOLO_LECTURA = ${soloLectura ? 'true' : 'false'}\n` + sinExports(leer('clasificar.js')) + '\n' + leer('n-reconciliar.js')
    case 'armar': return leer('n-avisar.js')
    case 'marcar': return leer('n-marcar.js')
    default: throw new Error('nodo sin código: ' + clave)
  }
}
const code = (nombre, clave, pos, soloLectura) => ({ parameters: { jsCode: codigoDeNodo(clave, soloLectura) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })

export function construirFlujo({ prueba = false, nombre } = {}) {
  const nodes = []
  const links = []
  if (prueba) {
    nodes.push({ parameters: { path: 'zero-risk/reconciliador-prueba-cc1', httpMethod: 'POST', responseMode: 'lastNode', options: {} }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'reconciliador-prueba-cc1-0001' })
    nodes.push(code(N.reconciliar, 'reconciliar', [260, 0], true))
    links.push([N.webhook, N.reconciliar])
  } else {
    nodes.push({ parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, name: N.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0] })
    nodes.push(code(N.reconciliar, 'reconciliar', [260, 0], false))
    nodes.push({
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.avisos.length > 0 }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
      name: N.hayAvisos, type: 'n8n-nodes-base.if', typeVersion: 2, position: [520, 0],
    })
    nodes.push(code(N.armar, 'armar', [780, -100]))
    nodes.push({
      parameters: {
        method: 'POST', url: 'https://slack.com/api/chat.postMessage', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ channel: '${CANAL_ALERTAS}', text: '🔴 ' + $json.titulo, blocks: [ { type: 'section', text: { type: 'mrkdwn', text: '*🔴 ' + $json.titulo + '*' } }, { type: 'section', text: { type: 'mrkdwn', text: $json.texto } }, { type: 'context', elements: [ { type: 'mrkdwn', text: 'reconciliador de despachos huérfanos · CC#1 · un aviso por hallazgo (se marca avisado solo si Slack confirma)' } ] } ] }) }}`,
        options: { timeout: 30000, response: { response: { neverError: true } } },
      },
      name: N.slack, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1040, -100], onError: 'continueRegularOutput',
    })
    nodes.push(code(N.marcar, 'marcar', [1300, -100]))
    links.push([N.reloj, N.reconciliar], [N.reconciliar, N.hayAvisos], [N.hayAvisos, N.armar, 0], [N.armar, N.slack], [N.slack, N.marcar])
  }
  const connections = {}
  for (const [de, a, salida = 0] of links) {
    connections[de] = connections[de] || { main: [] }
    while (connections[de].main.length <= salida) connections[de].main.push([])
    connections[de].main[salida].push({ node: a, type: 'main', index: 0 })
  }
  return { name: nombre || (prueba ? 'CC1 · prueba del reconciliador TEMPORAL (se borra)' : 'Zero Risk — Reconciliador de despachos huérfanos (reloj · cada 5 min · CC#1)'), nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-reconciliador.mjs')) {
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  if (process.argv.includes('--prueba') || process.argv.includes('--crear')) {
    const prueba = process.argv.includes('--prueba')
    const f = construirFlujo({ prueba })
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log(prueba ? 'COPIA DE PRUEBA (solo lectura) creada, inactiva:' : 'FLUJO REAL creado, INACTIVO (no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', f.nodes.length)
  } else {
    const f = construirFlujo()
    fs.writeFileSync(arg('--salida=') || 'reconciliador.json', JSON.stringify(f))
    console.log('escrito · nodos', f.nodes.length)
  }
}
