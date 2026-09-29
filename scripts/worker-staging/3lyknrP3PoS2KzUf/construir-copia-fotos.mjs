// Cadena «copia de fotos» del flujo de Apify (3lyknrP3PoS2KzUf) · CC#1 · 2026-09-29.
// lista (Code) → bajar (HTTP, archivo) → revisar (Code) → subir (HTTP, archivo) → anotar (Code)
// Cuelga al FINAL de la cadena de la libreta: responde → anota gasto → copia. Un fallo de fotos no toca ni la respuesta ni el gasto.
//
//   node construir-copia-fotos.mjs                 → escribe el JSON parcheado (--salida=) y muestra el diff · NO toca n8n
//   node construir-copia-fotos.mjs --publicar      → PUT al flujo vivo (solo con 0 ejecuciones en vuelo y aviso previo)
//
// 🔴 Por qué 5 nodos y no 1: el nodo Code de n8n NO sube bytes (Buffer se serializa como JSON: medido 29-sep, 15 de 16 fotos
// dañadas; probado con Uint8Array, ArrayBuffer, prepareBinaryData, helpers.request; no hay fetch ni Blob). Solo el nodo HTTP
// Request con archivo binario sube los bytes exactos (verificado por largo y firma). `fotos-anotar.js` VUELVE a leer lo subido
// y compara con lo bajado antes de dar nada por `ok`.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const src = (f) => fs.readFileSync(join(aqui, f), 'utf8')
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
export const N = {
  lista: 'Fotos · lista',
  bajar: 'Fotos · bajar',
  revisar: 'Fotos · revisar',
  subir: 'Fotos · subir',
  anotar: 'Fotos · anotar',
}
export const ANCLA = 'Anotar en la libreta'

export function nodosCopiaFotos([x, y]) {
  const paso = 300
  return [
    { parameters: { jsCode: src('fotos-lista.js') }, name: N.lista, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y] },
    {
      parameters: {
        url: '={{ $json.src }}', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Accept', value: 'image/*' }] },
        options: { batching: { batch: { batchSize: 4, batchInterval: 0 } }, timeout: 20000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'file', outputPropertyName: 'data' } } },
      },
      name: N.bajar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + paso, y],
      onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1500,
    },
    { parameters: { jsCode: src('fotos-revisar.js') }, name: N.revisar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 2 * paso, y] },
    {
      parameters: {
        method: 'POST', url: `=${SB}/storage/v1/object/client-social-images/{{ $json.path }}`, sendHeaders: true,
        headerParameters: { parameters: [
          { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
          { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
          { name: 'Content-Type', value: '={{ $json.ct }}' },
          { name: 'x-upsert', value: 'true' },
        ] },
        sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data',
        options: { batching: { batch: { batchSize: 4, batchInterval: 0 } }, timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
      },
      name: N.subir, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 3 * paso, y],
      onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: src('fotos-anotar.js') }, name: N.anotar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 4 * paso, y] },
  ]
}

export function conectar(connections, ancla = ANCLA) {
  const c = connections
  const a = c[ancla] || (c[ancla] = { main: [[]] })
  a.main[0] = (a.main[0] || []).filter((z) => z.node !== N.lista).concat({ node: N.lista, type: 'main', index: 0 })
  const enlace = (de, a2) => { c[de] = { main: [[{ node: a2, type: 'main', index: 0 }]] } }
  enlace(N.lista, N.bajar); enlace(N.bajar, N.revisar); enlace(N.revisar, N.subir); enlace(N.subir, N.anotar)
  return c
}

if (process.argv[1] && process.argv[1].endsWith('construir-copia-fotos.mjs')) {
  const publicar = process.argv.includes('--publicar')
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY, ID = '3lyknrP3PoS2KzUf'
  const w = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: { 'X-N8N-API-KEY': key } })).json()
  if (w.nodes.some((n) => n.name === N.lista)) { console.log('ya existe · nada que hacer'); process.exit(0) }
  const ancla = w.nodes.find((n) => n.name === ANCLA)
  w.nodes.push(...nodosCopiaFotos([ancla.position[0] + 300, ancla.position[1]]))
  conectar(w.connections)
  const cuerpo = { name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings }
  fs.writeFileSync(process.argv.find((a) => a.startsWith('--salida='))?.slice(9) || 'apify-con-copia-fotos.json', JSON.stringify(cuerpo))
  console.log('nodos', w.nodes.length, '· Anotar en la libreta →', w.connections[ANCLA].main[0].map((x) => x.node).join(' | '))
  if (publicar) {
    const r = await fetch(`${base}/api/v1/workflows/${ID}`, { method: 'PUT', headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    console.log('PUT', r.status)
  }
}
