/**
 * EL VIGÍA DE LA CADENA NO CALLA A LA SALA (CC#2 · 2026-10-21 · tercera prueba real).
 * Hallazgo: a las 22:00Z el vigía calculó el lote (2026-W44) y su nodo «3 · Sobre a la sala (lote)» recibió `401 unauthorized · missing x-api-key header`: ese nodo (y el de la tanda) mandaban
 * `x-api-key: {{ $env.SALA_INGRESS_API_KEY }}` SIN respaldo, y esa variable no llega al n8n (los flujos que sí funcionan usan `SALA_INGRESS_API_KEY || INTERNAL_API_KEY`). El nodo tiene `neverError`,
 * así que el rechazo se tragaba y la ejecución salía en verde: el reloj de respaldo nunca pudo dejar un sobre.
 *
 *   1 · los dos nodos hacia la sala llevan el respaldo `|| $env.INTERNAL_API_KEY`
 *   2 · tras cada uno, un nodo de código revisa la respuesta (2xx y `ok !== false`) y, si la sala RECHAZÓ el sobre, avisa a #alertas (una línea por sobre); si todo bien no devuelve nada y el flujo sigue igual
 *
 *   node vigia-llave.mjs <entrada.json> <salida.json>     · repara el JSON del vigía (el vivo o el del constructor)
 *   import { repararVigia } from './vigia-llave.mjs'       · lo usa `construir.mjs` para que una reconstrucción no traiga el defecto de vuelta
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const RESPALDO_DE_LA_LLAVE = '={{ $env.SALA_INGRESS_API_KEY || $env.INTERNAL_API_KEY }}'
const CANAL_ALERTAS = 'C0B7XUUEBHA'
const uuid = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}` }

const codigoDeRevision = (cual, nodoDeSobres) => `// ${cual} · ¿LA SALA ACEPTÓ EL SOBRE? (21-oct · tercera prueba) · la sala contestó 401 «missing x-api-key» y la ejecución salió en verde: el rechazo se callaba.
// Aquí se AVISA a #alertas, una línea por sobre rechazado. Si la sala aceptó (2xx y ok distinto de false; un sobre repetido también es 200) no devuelve nada y el flujo sigue como siempre.
const sobres = $('${nodoDeSobres}').all()
const out = []
$input.all().forEach((r, i) => {
  const j = r.json || {}
  const b = j.body && typeof j.body === 'object' ? j.body : {}
  const s = Number(j.statusCode)
  if (Number.isFinite(s) && s >= 200 && s < 300 && b.ok !== false) return
  const sobre = (sobres[i] && sobres[i].json && sobres[i].json.sobre) || {}
  const p = sobre.payload || {}
  const que = p.lote ? 'del lote ' + p.lote : p.tanda ? 'de la tanda ' + p.tanda : 'sin lote'
  const motivo = [Number.isFinite(s) ? 'HTTP ' + s : 'sin respuesta', b.code || b.error || '', b.detail || b.detalle || ''].filter(Boolean).join(' · ')
  out.push({ json: { slack: { channel: '${CANAL_ALERTAS}', text: '⚠️ La sala RECHAZÓ el sobre ' + que + ' de la campaña ' + (p.campana_id || 'desconocida') + ' (' + motivo + '). Las piezas no arrancan por el reloj hasta corregirlo.' } } })
})
return out`

const nodoDeCodigo = (name, jsCode, position) => ({ id: uuid('vigia-llave|' + name), name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode } })
const nodoDeAviso = (name, position) => ({
  id: uuid('vigia-llave|' + name), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, onError: 'continueRegularOutput',
  parameters: {
    method: 'POST', url: 'https://slack.com/api/chat.postMessage', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.slack) }}',
    options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
  },
})

const RAMAS = [
  { sala: '3 · Sobre a la sala (lote)', sobres: '3 · Sobres de lote', revision: '3 · ¿La sala aceptó el lote?', aviso: '3 · Aviso · la sala rechazó el lote', cual: '3' },
  { sala: '4 · Sobre a la sala (tanda)', sobres: '4 · Sobres de tanda', revision: '4 · ¿La sala aceptó la tanda?', aviso: '4 · Aviso · la sala rechazó la tanda', cual: '4' },
]

export function repararVigia(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  for (const r of RAMAS) {
    const sala = w.nodes.find((n) => n.name === r.sala)
    if (!sala) throw new Error(`falta el nodo «${r.sala}»: el flujo no es el vigía de la cadena`)
    if (w.nodes.some((n) => n.name === r.revision)) throw new Error(`el vigía ya trae «${r.revision}»: no repararlo dos veces`)
    const cab = sala.parameters.headerParameters.parameters.find((h) => h.name === 'x-api-key')
    if (!cab) throw new Error(`«${r.sala}» no trae x-api-key`)
    cab.value = RESPALDO_DE_LA_LLAVE
    const [x, y] = sala.position
    w.nodes.push(nodoDeCodigo(r.revision, codigoDeRevision(r.cual, r.sobres), [x + 280, y]))
    w.nodes.push(nodoDeAviso(r.aviso, [x + 560, y]))
    w.connections[r.sala] = { main: [[{ node: r.revision, type: 'main', index: 0 }]] }
    w.connections[r.revision] = { main: [[{ node: r.aviso, type: 'main', index: 0 }]] }
  }
  return w
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [entrada, salida] = process.argv.slice(2)
  if (!entrada || !salida) { console.error('uso: node vigia-llave.mjs <entrada.json> <salida.json>'); process.exit(2) }
  fs.writeFileSync(salida, JSON.stringify(repararVigia(JSON.parse(fs.readFileSync(entrada, 'utf8'))), null, 2))
  console.log('vigía reparado:', salida)
}
