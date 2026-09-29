// Constructor del flujo `zero-risk/brief` (el parte de trabajo · campaign brief) · CC#1 · 2026-09-29 · v2 POR TANDAS.
//
//   node construir-brief.mjs --salida=brief.json               → solo escribe el JSON · NO toca n8n
//   node construir-brief.mjs --crear                            → crea el flujo REAL en n8n, INACTIVO (no se publica)
//   node construir-brief.mjs --prueba                           → crea una COPIA temporal de prueba (otro path) INACTIVA
//   node construir-brief.mjs --actualizar=<id> [--como-prueba]  → PUT del JSON a un flujo existente
//
// v2 (29-sep · a raíz de la corrida 157555): el redactor tardó 32 min y la función de Vercel que sostiene el callback muere a los 800 s.
// Por eso el parte va EN TANDAS: 1 llamada por la LISTA cerrada + 1 llamada por cada tanda de ≤ `tanda` (1-3, defecto 2) briefs; cada una cabe
// en el tope. Además: SIN VUELTA NO SE GUARDA NADA, y la guardia de «repetido» ignora partes ilegibles.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

export const N = {
  webhook: 'Webhook · brief',
  sobre: '⓪ Sobre · llave · modo seco',
  manual: '① Cargar manual vigente',
  guardaManual: '① GUARDA · sin manual aprobado se DETIENE',
  plan: '② Cargar plan vigente',
  guardaPlan: '② GUARDA · sin plan se DETIENE',
  repetido: '② ¿Ya hay parte de este plan?',
  guardaRepetido: '② ¿Ya hay parte de este plan? · guarda',
  ficha: '② Ficha del cliente',
  listaPedido: '③a Armar el pedido de la lista',
  listaRedactor: '③a Lista (run-sdk)',
  listaEspera: '③a Esperar la lista',
  listaVuelta: '③a ¿Llegó la lista?',
  hayLista: '③a ¿Hay lista?',
  armarTandas: '③b Armar las tandas',
  recorrer: '③b Recorrer las tandas',
  tandaPedido: '③b Armar el pedido de la tanda',
  tandaRedactor: '③b Tanda (run-sdk)',
  tandaEspera: '③b Esperar la tanda',
  tandaVuelta: '③b ¿Llegó la tanda?',
  juntar: '③c Juntar',
  llegoTodo: '③c ¿Llegó todo?',
  chequeos: '④ Chequeos',
  seco: '⑤ ¿Modo seco?',
  secoCierre: '⑤ Seco · lo que se habría escrito',
  guardar: '⑤ Guardar el parte',
  legible: '⑤ ¿Legible?',
  drive: '⑤ Parte a Drive',
  cierre: '⑤ ¿Guardó y salió el PDF?',
  sinVuelta: '⑥ Sin vuelta · declara',
  secoSinVuelta: '⑥ ¿Modo seco? (sin vuelta)',
  secoSinVueltaCierre: '⑥ Seco · sin vuelta',
  cable: '⑥ Cable de vuelta · sala',
  volvio: '⑥ Cable · ¿volvió?',
}

// Tope de espera de CADA llamada al redactor: por debajo de los 800 s de la función de Vercel (vive el proxy que entrega el callback).
export const ESPERA_SEGUNDOS = 780

const SB = '{{ $env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL }}'
const cid = `{{ $('${N.sobre}').first().json.client_id }}`
const authSb = [
  { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
  { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
]

function sinExports(js) {
  const i = js.indexOf("if (typeof module !== 'undefined' && module.exports)")
  return i === -1 ? js : js.slice(0, i)
}
// (función de reemplazo: un texto con «$'» o «$&» dentro no debe interpretarse como patrón de String.replace)
const inyectar = (js) =>
  js
    .replace('__REFERENCIA__', () => JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
    .replace('__REGLAS__', () => JSON.stringify(leer('reglas-del-redactor.txt')))

export function codigoDeNodo(clave) {
  switch (clave) {
    case 'sobre': return leer('n0-sobre.js')
    case 'guardaManual': return leer('n1-guarda-manual.js')
    case 'guardaPlan': return leer('n2-guarda-plan.js')
    case 'guardaRepetido': return leer('n2b-repetido.js')
    case 'listaPedido': return inyectar(leer('n3a-armar-lista.js'))
    case 'listaVuelta': return leer('n3a-llego-la-lista.js')
    case 'armarTandas': return leer('n3b-armar-tandas.js')
    case 'tandaPedido': return inyectar(leer('n3b-armar-pedido-tanda.js'))
    case 'tandaVuelta': return leer('n3b-llego-la-tanda.js')
    case 'juntar': return leer('n3c-juntar.js')
    case 'chequeos': return sinExports(leer('brief-chequeos.js')) + '\n' + leer('n4-chequeos-nodo.js')
    case 'secoCierre': return leer('n5-seco.js')
    case 'cierre': return leer('n5-cierre.js')
    case 'sinVuelta': return leer('n6-sin-vuelta.js')
    case 'secoSinVueltaCierre': return leer('n6-seco-sin-vuelta.js')
    case 'volvio': return leer('n6-volvio.js')
    default: throw new Error('nodo sin código: ' + clave)
  }
}

const code = (nombre, clave, pos) => ({ parameters: { jsCode: codigoDeNodo(clave) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
const get = (nombre, url, pos) => ({
  parameters: { method: 'GET', url, sendHeaders: true, headerParameters: { parameters: authSb }, options: { timeout: 30000 } },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
  // 🔴 medido 29-sep: una consulta que vuelve VACÍA no despierta al nodo siguiente y la corrida terminaba «exitosa» sin haber llegado
  // al redactor (las GUARDA nunca corrían). Con esto la consulta SIEMPRE entrega una salida y las GUARDA deciden.
  alwaysOutputData: true,
})
const redactor = (nombre, pos) => ({
  parameters: {
    method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/agents/run-sdk', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
    // el HTTP manda EXACTAMENTE el cuerpo armado por el nodo anterior (donde viaja dry_run)
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
    options: { timeout: 60000, response: { response: { neverError: true } } },
  },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
})
const espera = (nombre, pos, webhookId) => ({
  parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: ESPERA_SEGUNDOS, resumeUnit: 'seconds', options: {} },
  name: nombre, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos, webhookId,
})
const si = (nombre, izquierda, pos) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izquierda, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
  name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
})

export function construirFlujo({ path = 'zero-risk/brief', nombre = 'Zero Risk — Brief · el parte de trabajo (campaign brief) · CC#1', webhookId = 'brief-parte-de-trabajo-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.sobre, 'sobre', x(1)),
    get(N.manual, `=${SB}/rest/v1/client_brand_books?select=id,client_id,version,gate_outcome,created_at,forbidden_words,required_terminology,content_text&client_id=eq.${cid}&order=version.desc&limit=1`, x(2)),
    code(N.guardaManual, 'guardaManual', x(3)),
    get(N.plan, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at,title,content_text,status&output_type=eq.campaign_plan_90d&client_id=eq.${cid}&order=created_at.desc&limit=1`, x(4)),
    code(N.guardaPlan, 'guardaPlan', x(5)),
    // la guardia de «repetido» IGNORA partes ilegibles: solo cuenta un parte con provenance_tag.legible = true
    get(N.repetido, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at&output_type=eq.campaign_brief_pack&client_id=eq.${cid}&provenance_tag->>plan_id=eq.{{ $('${N.guardaPlan}').first().json.plan_id }}&provenance_tag->>legible=eq.true&limit=1`, x(6)),
    code(N.guardaRepetido, 'guardaRepetido', x(7)),
    get(N.ficha, `=${SB}/rest/v1/clients?select=id,name&id=eq.${cid}&limit=1`, x(8)),
    // ── ③a la LISTA cerrada (llamada 1)
    code(N.listaPedido, 'listaPedido', x(9)),
    redactor(N.listaRedactor, x(10)),
    espera(N.listaEspera, x(11), webhookId + '-espera-lista'),
    code(N.listaVuelta, 'listaVuelta', x(12)),
    si(N.hayLista, '={{ $json.lista_ok }}', x(13)),
    // ── ③b las TANDAS (llamadas 2…N), una a una
    code(N.armarTandas, 'armarTandas', x(14)),
    { parameters: { batchSize: 1, options: {} }, name: N.recorrer, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: x(15) },
    code(N.tandaPedido, 'tandaPedido', x(16, 250)),
    redactor(N.tandaRedactor, x(17, 250)),
    espera(N.tandaEspera, x(18, 250), webhookId + '-espera-tanda'),
    code(N.tandaVuelta, 'tandaVuelta', x(19, 250)),
    // ── ③c juntar y comprobar que llegó TODO
    code(N.juntar, 'juntar', x(16, -250)),
    si(N.llegoTodo, '={{ $json.llego_la_vuelta }}', x(17, -250)),
    // ── ④ chequeos y ⑤ escritura (solo si llegó todo)
    code(N.chequeos, 'chequeos', x(18, -250)),
    si(N.seco, '={{ $json.dry_run }}', x(19, -250)),
    code(N.secoCierre, 'secoCierre', x(20, -100)),
    {
      parameters: {
        method: 'POST', url: `=${SB}/rest/v1/client_historical_outputs`, sendHeaders: true,
        headerParameters: { parameters: [...authSb, { name: 'Content-Type', value: 'application/json' }, { name: 'Prefer', value: 'return=representation' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fila_parte) }}',
        options: { timeout: 30000, response: { response: { neverError: true } } },
      },
      name: N.guardar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: x(20, -400), onError: 'continueRegularOutput',
    },
    si(N.legible, `={{ $('${N.chequeos}').first().json.parte_legible }}`, x(21, -400)),
    {
      parameters: {
        method: 'POST', url: 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/texto-a-drive', sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ client_id: $('${N.chequeos}').first().json.client_id, client_name: ($('${N.chequeos}').first().json.client_name || 'cliente'), nombre: 'Parte de trabajo · briefs · ' + new Date().toISOString().slice(0,10), texto: String($('${N.chequeos}').first().json.parte_md || '') }) }}`,
        options: { timeout: 120000, response: { response: { neverError: true } } },
      },
      name: N.drive, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: x(22, -500), onError: 'continueRegularOutput',
    },
    code(N.cierre, 'cierre', x(23, -400)),
    // ── ⑥ sin vuelta: NO se guarda nada · solo se avisa a la sala
    code(N.sinVuelta, 'sinVuelta', x(20, 200)),
    si(N.secoSinVuelta, '={{ $json.dry_run }}', x(21, 200)),
    code(N.secoSinVueltaCierre, 'secoSinVueltaCierre', x(22, 100)),
    {
      parameters: {
        method: 'POST', url: "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-brief' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload_cable) }}',
        options: { timeout: 60000 },
      },
      name: N.cable, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: x(24, -100), onError: 'continueRegularOutput',
    },
    code(N.volvio, 'volvio', x(25, -100)),
  ]
  const links = [
    [N.webhook, N.sobre], [N.sobre, N.manual], [N.manual, N.guardaManual], [N.guardaManual, N.plan], [N.plan, N.guardaPlan],
    [N.guardaPlan, N.repetido], [N.repetido, N.guardaRepetido], [N.guardaRepetido, N.ficha], [N.ficha, N.listaPedido],
    [N.listaPedido, N.listaRedactor], [N.listaRedactor, N.listaEspera], [N.listaEspera, N.listaVuelta], [N.listaVuelta, N.hayLista],
    [N.hayLista, N.armarTandas, 0], [N.hayLista, N.sinVuelta, 1],
    [N.armarTandas, N.recorrer],
    [N.recorrer, N.juntar, 0], // salida «terminado» (acumula todas las tandas)
    [N.recorrer, N.tandaPedido, 1], // salida «bucle»
    [N.tandaPedido, N.tandaRedactor], [N.tandaRedactor, N.tandaEspera], [N.tandaEspera, N.tandaVuelta], [N.tandaVuelta, N.recorrer], // vuelta al recorrido
    [N.juntar, N.llegoTodo], [N.llegoTodo, N.chequeos, 0], [N.llegoTodo, N.sinVuelta, 1],
    [N.chequeos, N.seco],
    [N.seco, N.secoCierre, 0], [N.seco, N.guardar, 1],
    [N.guardar, N.legible], [N.legible, N.drive, 0], [N.legible, N.cierre, 1], [N.drive, N.cierre],
    [N.cierre, N.cable],
    [N.sinVuelta, N.secoSinVuelta], [N.secoSinVuelta, N.secoSinVueltaCierre, 0], [N.secoSinVuelta, N.cable, 1],
    [N.cable, N.volvio],
  ]
  const connections = {}
  for (const [de, a, salida = 0] of links) {
    connections[de] = connections[de] || { main: [] }
    while (connections[de].main.length <= salida) connections[de].main.push([])
    connections[de].main[salida].push({ node: a, type: 'main', index: 0 })
  }
  return { name: nombre, nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-brief.mjs')) {
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  const salida = arg('--salida=')
  const prueba = () => construirFlujo({ path: 'zero-risk/brief-prueba-cc1', nombre: 'CC1 · prueba del brief TEMPORAL (se borra)', webhookId: 'brief-prueba-cc1-0001' })
  if (process.argv.includes('--prueba')) {
    const f = prueba()
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log('COPIA DE PRUEBA creada (inactiva):', r.id || JSON.stringify(r).slice(0, 400), '· nodos', f.nodes.length)
  } else if (process.argv.includes('--crear')) {
    const f = construirFlujo()
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log('FLUJO REAL creado (INACTIVO · no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', f.nodes.length)
  } else if (arg('--actualizar=')) {
    const id = arg('--actualizar=')
    // --como-prueba: la actualización conserva el path y el nombre de la COPIA de prueba (nunca el del flujo real)
    const f = process.argv.includes('--como-prueba') ? prueba() : construirFlujo()
    const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify(f) })
    console.log('PUT', r.status)
  } else {
    const f = construirFlujo()
    fs.writeFileSync(salida || 'brief.json', JSON.stringify(f))
    console.log('escrito', salida || 'brief.json', '· nodos', f.nodes.length)
  }
}
