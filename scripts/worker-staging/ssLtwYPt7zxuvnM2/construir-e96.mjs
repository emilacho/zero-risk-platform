// E96 · arreglo D · el rescate del manual LEE la respuesta ya pagada en vez de reintentar.
// Construye el cimiento desde el retrato VIVO · cambia UN nodo (y su nombre, que mentía).
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-e96.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'cimiento-VIVO-2026-09-18.json'), 'utf8'))

export const VIEJO = '[BB] Rescate · red 2 · reintento'
export const NUEVO = '[BB] Rescate · red 2 · leer lo ya pagado'
export const RED3 = '[BB] Rescate · red 3 · fusionar o PARAR'

// Lee del registro lo que la lente YA cobró · no invoca a nadie · US$ 0,00.
// `step_name` va SIN el sufijo del reintento: se busca la invocación original, la pagada.
export const CUERPO = `={
  "agent": "{{ $json._lente }}",
  "step_name": "{{ $json._step }}",
  "workflow_execution_id": "{{ $execution.id }}",
  "tope_ms": 120000
}`

const viejo = vivo.nodes.find((n) => n.name === VIEJO)
if (!viejo) throw new Error(`no encontré «${VIEJO}» en el retrato vivo`)

const nuevo = {
  ...viejo,
  name: NUEVO,
  parameters: {
    ...viejo.parameters,
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/agents/respuesta-pagada",
    jsonBody: CUERPO,
    options: {
      response: { response: { neverError: true, responseFormat: 'json' } },
      // la puerta espera hasta 120 s · 190 s deja aire y no se acerca al tope del motor
      timeout: 190000,
    },
  },
}

const nodes = vivo.nodes.map((n) => (n.name === VIEJO ? nuevo : n))
const connections = {}
for (const [origen, c] of Object.entries(vivo.connections)) {
  const clave = origen === VIEJO ? NUEVO : origen
  connections[clave] = {
    ...c,
    main: (c.main ?? []).map((salida) =>
      (salida ?? []).map((x) => (x.node === VIEJO ? { ...x, node: NUEVO } : x)),
    ),
  }
}

const construido = { name: vivo.name, nodes, connections, settings: vivo.settings }
writeFileSync(join(aqui, 'cimiento-construido-e96.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', nodes.length, 'nodos · cambia 1:', VIEJO, '→', NUEVO)
