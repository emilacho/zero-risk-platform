// Constructor del flujo `zero-risk/pieza` (el productor: UN brief → UNA pieza) · CC#1 · 2026-10-01 · encargo Lenovo «construir el flujo de la pieza».
//
//   node construir-pieza.mjs --salida=pieza.json   → solo escribe el JSON · NO toca n8n
//   node construir-pieza.mjs --crear               → crea el flujo REAL en n8n, INACTIVO (no se publica ni se activa)
//   node construir-pieza.mjs --actualizar=<id>     → PUT del JSON a un flujo existente (nunca cambia si está activo o no)
//
// Patrón del flujo del brief (`PQdIgbuFexuBsoh8`) · despachado por la sala (sobre → /api/sala/intake → repartidor → flujo · ADR-018) · la vuelta la entrega el CORREDOR.
// 🔴 Canon de Emilio (01-oct): estructural · sin temporales · sin vigilancia. Por construcción:
//   · NINGÚN nodo que pague tiene `retryOnFail` (el productor llama una sola vez)
//   · la espera (3.600 s) vive más que el trabajo (el corredor entrega la vuelta, no Vercel)
//   · NINGÚN nodo se traga un error: las consultas siempre entregan salida y una GUARDA decide; todo fallo sale como fallo con su motivo
//   · el orden lo da el GRAFO (cadena en serie): ninguna lectura por nombre a un nodo que no sea antecesor
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

export const N = {
  webhook: 'Webhook · pieza',
  sobre: '⓪ Sobre · llave · modo seco',
  parte: '① Cargar el parte',
  guardaParte: '① GUARDA · el parte y el brief',
  manual: '② Cargar el manual vigente',
  guardaManual: '② GUARDA · sin manual aprobado se DETIENE',
  fotos: '③ Cargar las fotos propias',
  guardaFotos: '③ GUARDA · las fotos propias',
  repetida: '④ ¿Ya hay pieza de este brief?',
  guardaRepetida: '④ ¿Ya hay pieza de este brief? · guarda',
  ficha: '⑤ Ficha del cliente',
  sedes: '⑤ Sedes y voz del cliente',
  guardaSedes: '⑤ GUARDA · sedes y voz',
  cuerpo: '⑤ Armar el cuerpo del productor',
  salud: '⑤ ¿Qué sabe hacer el corredor?',
  guardaSalud: '⑤ GUARDA · el corredor trae los límites',
  productor: '⑥ Productor (run-sdk)',
  acepto: '⑥ ¿Aceptó el pedido?',
  espera: '⑥ Esperar al productor',
  vuelta: '⑥ ¿Llegó la vuelta?',
  chequeos: '⑦ Chequeos',
  seco: '⑧ ¿Modo seco?',
  secoCierre: '⑧ Seco · lo que se habría escrito',
  guardar: '⑧ Guardar la pieza',
  cierre: '⑧ ¿Guardó la pieza?',
  cable: '⑨ Cable de vuelta · sala',
  volvio: '⑨ Cable · ¿volvió?',
}

const SB = '{{ $env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL }}'
const cid = `{{ $('${N.sobre}').first().json.client_id }}`
const authSb = [
  { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
  { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
]

/** la lógica de sedes y voz (la MISMA que prueba `sedes-logica.test.ts` y usa el recolector) · se pega entera en los nodos que la usan */
const SEDES_LOGICA = fs.readFileSync(join(aqui, '..', '..', '..', 'src', 'lib', 'sedes', 'sedes-logica.js'), 'utf8')

function sinExports(js) {
  const i = js.indexOf("if (typeof module !== 'undefined' && module.exports)")
  return i === -1 ? js : js.slice(0, i)
}

export function codigoDeNodo(clave) {
  switch (clave) {
    case 'sobre': return leer('n0-sobre.js')
    case 'guardaParte': return leer('n1-guarda-parte.js')
    case 'guardaManual': return leer('n2-guarda-manual.js')
    case 'guardaFotos': return leer('n3-guarda-fotos.js')
    case 'guardaRepetida': return leer('n4-guarda-repetida.js')
    case 'guardaSedes': return leer('n5c-guarda-sedes-y-voz.js')
    case 'cuerpo': return sinExports(SEDES_LOGICA) + '\n' + leer('n5-armar-cuerpo.js')
    case 'guardaSalud': return leer('n5b-corredor-trae-limites.js')
    case 'acepto': return leer('n6a-acepto.js')
    case 'vuelta': return leer('n6-llego-la-vuelta.js')
    case 'chequeos': return sinExports(SEDES_LOGICA) + '\n' + sinExports(leer('pieza-chequeos.js')) + '\n' + leer('n7-chequeos-nodo.js')
    case 'secoCierre': return leer('n8-seco.js')
    case 'cierre': return leer('n8-cierre.js')
    case 'volvio': return leer('n9-volvio.js')
    default: throw new Error('nodo sin código: ' + clave)
  }
}

const code = (nombre, clave, pos) => ({ parameters: { jsCode: codigoDeNodo(clave) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
// 🔴 medido 29-sep: una consulta que vuelve VACÍA no despierta al nodo siguiente y la corrida terminaba «exitosa» sin haber llegado al nodo que trabaja (las GUARDA nunca corrían).
// Con `alwaysOutputData` la consulta SIEMPRE entrega una salida y las GUARDA deciden. `continueRegularOutput` sólo porque la GUARDA de aguas abajo lee el resultado y declara el fallo.
const get = (nombre, url, pos) => ({
  parameters: { method: 'GET', url, sendHeaders: true, headerParameters: { parameters: authSb }, options: { timeout: 30000 } },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput', alwaysOutputData: true,
})

export function construirFlujo({ path = 'zero-risk/pieza', nombre = 'Zero Risk — Pieza · el productor (un brief → una pieza) · CC#1', webhookId = 'pieza-el-productor-0001' } = {}) {
  const x = (i) => [i * 260, 0]
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.sobre, 'sobre', x(1)),
    get(N.parte, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at,title,provenance_tag&output_type=eq.campaign_brief_pack&client_id=eq.${cid}{{ $('${N.sobre}').first().json.parte_id ? '&id=eq.' + $('${N.sobre}').first().json.parte_id : '' }}&order=created_at.desc&limit=20`, x(2)),
    code(N.guardaParte, 'guardaParte', x(3)),
    get(N.manual, `=${SB}/rest/v1/client_brand_books?select=id,client_id,version,gate_outcome,created_at,forbidden_words,required_terminology&client_id=eq.${cid}&order=version.desc&limit=1`, x(4)),
    code(N.guardaManual, 'guardaManual', x(5)),
    get(N.fotos, `=${SB}/rest/v1/client_social_images?select=id,tipo,post_id,url,estado,created_at&client_id=eq.${cid}&owner_role=eq.propio&estado=eq.ok&order=created_at.desc&limit=200`, x(6)),
    code(N.guardaFotos, 'guardaFotos', x(7)),
    get(N.repetida, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at&output_type=eq.campaign_piece&client_id=eq.${cid}&provenance_tag->>brief_id=eq.{{ $('${N.guardaFotos}').first().json.brief_id }}&provenance_tag->>parte_id=eq.{{ $('${N.guardaFotos}').first().json.parte_id }}&limit=1`, x(8)),
    code(N.guardaRepetida, 'guardaRepetida', x(9)),
    get(N.ficha, `=${SB}/rest/v1/clients?select=*&id=eq.${cid}&limit=1`, x(10)),
    // 🔴 02-oct · las SEDES y la VOZ del cliente (US$ 0: lee lo que el sistema ya guardó · idempotente · SIN reintento) · una lectura caída no detiene la pieza: la GUARDA de abajo la DECLARA y el pedido le prohíbe al productor afirmar horarios
    {
      parameters: {
        method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/clients/sedes/recolectar', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }] },
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ client_id: $('${N.sobre}').first().json.client_id }) }}`,
        options: { timeout: 45000, response: { response: { neverError: true } } },
      },
      name: N.sedes, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [10.5 * 260, 0], onError: 'continueRegularOutput', alwaysOutputData: true,
    },
    code(N.guardaSedes, 'guardaSedes', [10.8 * 260, 0]),
    code(N.cuerpo, 'cuerpo', x(11)),
    // 🔴 ANTES de pagar: ¿el corredor trae los límites de «mirar afuera»? (GET /health · sin llave · sin reintento · el fallo lo declara la GUARDA de abajo)
    { parameters: { method: 'GET', url: "={{ ($env.RAILWAY_AGENT_RUNNER_URL || 'https://zero-risk-platform-production.up.railway.app').replace(/\\/+$/, '') }}/health", options: { timeout: 10000 } }, name: N.salud, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [11.4 * 260, 0], onError: 'continueRegularOutput', alwaysOutputData: true },
    code(N.guardaSalud, 'guardaSalud', [11.7 * 260, 0]),
    {
      // 🔴 SIN `retryOnFail`: el productor PAGA. Una llamada, un resultado (medido 01-oct: con reintento una llamada cortada por tope se cobró 4 veces).
      parameters: {
        method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/agents/run-sdk', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
        options: { timeout: 60000, response: { response: { neverError: true } } },
      },
      name: N.productor, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: x(12), onError: 'continueRegularOutput',
    },
    code(N.acepto, 'acepto', x(13)),
    // 🔴 LA ESPERA VIVE MÁS QUE EL TRABAJO (lección 30-sep, corrida 158667): el corredor entrega la vuelta (callback_mode:'runner') y la espera de este nodo no puede vencer antes.
    // 3.600 s (1 h) cubre con holgura lo medido (una pieza: minutos); el SDK ya acota el COSTO con max_budget_usd.
    { parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 3600, resumeUnit: 'seconds', options: {} }, name: N.espera, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [13.5 * 260, 0], webhookId: webhookId + '-espera' },
    code(N.vuelta, 'vuelta', x(14)),
    code(N.chequeos, 'chequeos', x(15)),
    {
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.dry_run }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
      name: N.seco, type: 'n8n-nodes-base.if', typeVersion: 2, position: x(16),
    },
    code(N.secoCierre, 'secoCierre', [x(17)[0], 200]),
    {
      parameters: {
        method: 'POST', url: `=${SB}/rest/v1/client_historical_outputs`, sendHeaders: true,
        headerParameters: { parameters: [...authSb, { name: 'Content-Type', value: 'application/json' }, { name: 'Prefer', value: 'return=representation' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fila_pieza) }}',
        options: { timeout: 30000, response: { response: { neverError: true } } },
      },
      name: N.guardar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x(17)[0], -200], onError: 'continueRegularOutput',
    },
    code(N.cierre, 'cierre', [x(18)[0], -200]),
    {
      parameters: {
        method: 'POST', url: "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-pieza' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload_cable) }}',
        options: { timeout: 60000 },
      },
      name: N.cable, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x(19)[0], -200], onError: 'continueRegularOutput',
    },
    code(N.volvio, 'volvio', [x(20)[0], -200]),
  ]
  const enlace = (de, a, salida = 0) => ({ de, a, salida })
  const links = [
    enlace(N.webhook, N.sobre), enlace(N.sobre, N.parte), enlace(N.parte, N.guardaParte), enlace(N.guardaParte, N.manual),
    enlace(N.manual, N.guardaManual), enlace(N.guardaManual, N.fotos), enlace(N.fotos, N.guardaFotos), enlace(N.guardaFotos, N.repetida),
    enlace(N.repetida, N.guardaRepetida), enlace(N.guardaRepetida, N.ficha), enlace(N.ficha, N.sedes), enlace(N.sedes, N.guardaSedes), enlace(N.guardaSedes, N.cuerpo), enlace(N.cuerpo, N.salud), enlace(N.salud, N.guardaSalud), enlace(N.guardaSalud, N.productor),
    enlace(N.productor, N.acepto), enlace(N.acepto, N.espera), enlace(N.espera, N.vuelta), enlace(N.vuelta, N.chequeos), enlace(N.chequeos, N.seco),
    enlace(N.seco, N.secoCierre, 0), // verdadero = modo seco
    enlace(N.seco, N.guardar, 1), // falso = modo real
    enlace(N.guardar, N.cierre), enlace(N.cierre, N.cable), enlace(N.cable, N.volvio),
  ]
  const connections = {}
  for (const l of links) {
    connections[l.de] = connections[l.de] || { main: [] }
    while (connections[l.de].main.length <= l.salida) connections[l.de].main.push([])
    connections[l.de].main[l.salida].push({ node: l.a, type: 'main', index: 0 })
  }
  return { name: nombre, nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-pieza.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  if (process.argv.includes('--crear')) {
    const f = construirFlujo()
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log('FLUJO REAL creado (INACTIVO · no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', f.nodes.length)
  } else if (arg('--actualizar=')) {
    const id = arg('--actualizar=')
    const f = construirFlujo()
    const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify(f) })
    console.log('PUT', r.status)
  } else {
    const f = construirFlujo()
    const salida = arg('--salida=') || 'pieza.json'
    fs.writeFileSync(salida, JSON.stringify(f))
    console.log('escrito', salida, '· nodos', f.nodes.length)
  }
}
