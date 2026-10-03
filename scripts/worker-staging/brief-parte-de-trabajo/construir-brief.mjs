// Constructor del flujo `zero-risk/brief` (el parte de trabajo · campaign brief) · CC#1 · 2026-09-29.
//
//   node construir-brief.mjs --salida=brief.json               → solo escribe el JSON · NO toca n8n
//   node construir-brief.mjs --crear                            → crea el flujo REAL en n8n, INACTIVO (no se publica)
//   node construir-brief.mjs --prueba                           → crea una COPIA temporal de prueba (otro path) INACTIVA
//   node construir-brief.mjs --actualizar=<id>                  → PUT del JSON a un flujo existente (sigue como estaba de activo)
//
// Seis etapas lógicas del encargo (Webhook → ① manual → ② plan → ③ redactor → ④ chequeos → ⑤ guardar+Drive → ⑥ cable);
// cada una tiene sus nodos de ayuda (la llave y el modo seco en ⓪, las GUARDA, la espera del agente, el ramal seco).
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
  cuerpo: '③ Armar el cuerpo del redactor',
  redactor: '③ Redactor (run-sdk)',
  espera: '③ Esperar al redactor',
  vuelta: '③ ¿Llegó la vuelta?',
  chequeos: '④ Chequeos',
  seco: '⑤ ¿Modo seco?',
  secoCierre: '⑤ Seco · lo que se habría escrito',
  guardar: '⑤ Guardar el parte',
  drive: '⑤ Parte a Drive',
  cierre: '⑤ ¿Guardó y salió el PDF?',
  cable: '⑥ Cable de vuelta · sala',
  volvio: '⑥ Cable · ¿volvió?',
}

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

/** 03-oct · el trato de la marca: la MISMA lógica que prueba `trato-del-cliente.test.ts` · se pega entera en los nodos que la usan */
const TRATO_LOGICA = fs.readFileSync(join(aqui, '..', '..', '..', 'src', 'lib', 'trato', 'trato-logica.js'), 'utf8')

export function codigoDeNodo(clave) {
  switch (clave) {
    case 'sobre': return leer('n0-sobre.js')
    case 'guardaManual': return leer('n1-guarda-manual.js')
    case 'guardaPlan': return leer('n2-guarda-plan.js')
    case 'guardaRepetido': return leer('n2b-repetido.js')
    case 'cuerpo': return sinExports(TRATO_LOGICA) + '\n' + leer('n3-armar-cuerpo.js').replace('__REFERENCIA__', JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
    case 'vuelta': return leer('n3-llego-la-vuelta.js')
    case 'chequeos': return sinExports(TRATO_LOGICA) + '\n' + sinExports(leer('brief-chequeos.js')) + '\n' + leer('n4-chequeos-nodo.js')
    case 'secoCierre': return leer('n5-seco.js')
    case 'cierre': return leer('n5-cierre.js')
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

export function construirFlujo({ path = 'zero-risk/brief', nombre = 'Zero Risk — Brief · el parte de trabajo (campaign brief) · CC#1', webhookId = 'brief-parte-de-trabajo-0001' } = {}) {
  const x = (i) => [i * 260, 0]
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.sobre, 'sobre', x(1)),
    get(N.manual, `=${SB}/rest/v1/client_brand_books?select=id,client_id,version,gate_outcome,created_at,forbidden_words,required_terminology,content_text,voice_description,writing_style,tone_guidelines&client_id=eq.${cid}&order=version.desc&limit=1`, x(2)),
    code(N.guardaManual, 'guardaManual', x(3)),
    get(N.plan, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at,title,content_text,status&output_type=eq.campaign_plan_90d&client_id=eq.${cid}&order=created_at.desc&limit=1`, x(4)),
    code(N.guardaPlan, 'guardaPlan', x(5)),
    get(N.repetido, `=${SB}/rest/v1/client_historical_outputs?select=id,created_at&output_type=eq.campaign_brief_pack&client_id=eq.${cid}&provenance_tag->>plan_id=eq.{{ $('${N.guardaPlan}').first().json.plan_id }}&limit=1`, x(6)),
    code(N.guardaRepetido, 'guardaRepetido', x(7)),
    get(N.ficha, `=${SB}/rest/v1/clients?select=id,name,country,market,config&id=eq.${cid}&limit=1`, x(8)),
    code(N.cuerpo, 'cuerpo', x(9)),
    {
      parameters: {
        method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/agents/run-sdk', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
        options: { timeout: 60000, response: { response: { neverError: true } } },
      },
      name: N.redactor, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: x(10), onError: 'continueRegularOutput',
    },
    // 🔴 EL TOPE DE ESPERA (30-sep · corrida real 158667): con la palanca del corredor la vuelta ya no muere en los 800 s de Vercel, pero ESTE nodo seguía esperando sólo 900 s y el redactor del brief tarda
    // ~16-32 min (la única corrida real medida: 1.923 s): la espera vencía, el parte salía «la vuelta NO llegó» y el trabajo se cobraba igual. 3.600 s (1 h) cubre lo medido con holgura; el SDK ya acota el COSTO con `tope_usd`.
    { parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 3600, resumeUnit: 'seconds', options: {} }, name: N.espera, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: x(11), webhookId: webhookId + '-espera' },
    code(N.vuelta, 'vuelta', x(12)),
    code(N.chequeos, 'chequeos', x(13)),
    {
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.dry_run }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
      name: N.seco, type: 'n8n-nodes-base.if', typeVersion: 2, position: x(14),
    },
    code(N.secoCierre, 'secoCierre', [x(15)[0], 200]),
    {
      parameters: {
        method: 'POST', url: `=${SB}/rest/v1/client_historical_outputs`, sendHeaders: true,
        headerParameters: { parameters: [...authSb, { name: 'Content-Type', value: 'application/json' }, { name: 'Prefer', value: 'return=representation' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fila_parte) }}',
        options: { timeout: 30000, response: { response: { neverError: true } } },
      },
      name: N.guardar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x(15)[0], -200], onError: 'continueRegularOutput',
    },
    {
      parameters: {
        method: 'POST', url: 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/texto-a-drive', sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ client_id: $('${N.chequeos}').first().json.client_id, client_name: ($('${N.chequeos}').first().json.client_name || 'cliente'), nombre: ($('${N.chequeos}').first().json.titulo_parte || ('Parte de trabajo · briefs · ' + new Date().toISOString().slice(0,10))), texto: String($('${N.chequeos}').first().json.parte_md || '') }) }}`,
        options: { timeout: 120000, response: { response: { neverError: true } } },
      },
      name: N.drive, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x(16)[0], -200], onError: 'continueRegularOutput',
    },
    code(N.cierre, 'cierre', [x(17)[0], -200]),
    {
      parameters: {
        method: 'POST', url: "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-brief' }] },
        sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload_cable) }}',
        options: { timeout: 60000 },
      },
      name: N.cable, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x(18)[0], -200], onError: 'continueRegularOutput',
    },
    code(N.volvio, 'volvio', [x(19)[0], -200]),
  ]
  const enlace = (de, a, salida = 0) => ({ de, a, salida })
  const links = [
    enlace(N.webhook, N.sobre), enlace(N.sobre, N.manual), enlace(N.manual, N.guardaManual), enlace(N.guardaManual, N.plan),
    enlace(N.plan, N.guardaPlan), enlace(N.guardaPlan, N.repetido), enlace(N.repetido, N.guardaRepetido), enlace(N.guardaRepetido, N.ficha),
    enlace(N.ficha, N.cuerpo), enlace(N.cuerpo, N.redactor), enlace(N.redactor, N.espera), enlace(N.espera, N.vuelta), enlace(N.vuelta, N.chequeos),
    enlace(N.chequeos, N.seco),
    enlace(N.seco, N.secoCierre, 0), // verdadero = modo seco
    enlace(N.seco, N.guardar, 1), // falso = modo real
    enlace(N.guardar, N.drive), enlace(N.drive, N.cierre), enlace(N.cierre, N.cable), enlace(N.cable, N.volvio),
  ]
  const connections = {}
  for (const l of links) {
    connections[l.de] = connections[l.de] || { main: [] }
    while (connections[l.de].main.length <= l.salida) connections[l.de].main.push([])
    connections[l.de].main[l.salida].push({ node: l.a, type: 'main', index: 0 })
  }
  return { name: nombre, nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-brief.mjs')) {
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  const salida = arg('--salida=')
  if (process.argv.includes('--prueba')) {
    const f = construirFlujo({ path: 'zero-risk/brief-prueba-cc1', nombre: 'CC1 · prueba del brief TEMPORAL (se borra)', webhookId: 'brief-prueba-cc1-0001' })
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log('COPIA DE PRUEBA creada (inactiva):', r.id || JSON.stringify(r).slice(0, 300))
  } else if (process.argv.includes('--crear')) {
    const f = construirFlujo()
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(f) })).json()
    console.log('FLUJO REAL creado (INACTIVO · no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', f.nodes.length)
  } else if (arg('--actualizar=')) {
    const id = arg('--actualizar=')
    // --como-prueba: la actualización conserva el path y el nombre de la COPIA de prueba (nunca el del flujo real)
    const f = process.argv.includes('--como-prueba')
      ? construirFlujo({ path: 'zero-risk/brief-prueba-cc1', nombre: 'CC1 · prueba del brief TEMPORAL (se borra)', webhookId: 'brief-prueba-cc1-0001' })
      : construirFlujo()
    const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify(f) })
    console.log('PUT', r.status)
  } else {
    const f = construirFlujo()
    fs.writeFileSync(salida || 'brief.json', JSON.stringify(f))
    console.log('escrito', salida || 'brief.json', '· nodos', f.nodes.length)
  }
}
