// Suma el VIGILANTE al flujo del portero (ogfq56oIEoHufFPM) a partir de su respaldo VIVO del 14-oct. ADITIVO: un nodo al final, tras «⑤ Cierre».
//   node scripts/worker-staging/ogfq56oIEoHufFPM/construir-vigilante.mjs
// «⑥ Vigilar» llama a /api/brain/alimentar/vigilar con la salida del cierre; la ruta revisa las condiciones y, si alguna falla, DESACTIVA este flujo y avisa a #alertas.
// Si todo va bien, silencio. Sin `onError: continue`: si la ruta contesta 502 (no se pudo apagar o avisar) la ejecución queda en error y se ve en n8n.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const NODO = '⑥ Vigilar (apaga y avisa si algo falla)'
export function conVigilante(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  if (w.nodes.some((n) => n.name === NODO)) throw new Error('el vigilante ya está en el flujo')
  const cierre = w.nodes.find((n) => n.name === '⑤ Cierre')
  if (!cierre) throw new Error('no existe ⑤ Cierre')
  if (w.connections['⑤ Cierre']) throw new Error('⑤ Cierre ya tiene salida')
  w.nodes.push({
    parameters: {
      method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/brain/alimentar/vigilar',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ dry_run: $('⓪ Entrada').first().json.dry_run !== false, workflow_id: $('⓪ Entrada').first().json.workflow_id, workflow_execution_id: $('⓪ Entrada').first().json.workflow_execution_id, cierre: $json }) }}",
      options: { timeout: 300000 },
    },
    id: 'vigilante-6', name: NODO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [(cierre.position?.[0] ?? 3120) + 260, cierre.position?.[1] ?? 0],
  })
  w.connections['⑤ Cierre'] = { main: [[{ node: NODO, type: 'main', index: 0 }]] }
  return w
}
if (process.argv[1] && process.argv[1].endsWith('construir-vigilante.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'ogfq56oIEoHufFPM-ANTES-vigilante-2026-10-14.json'), 'utf8'))
  const w = conVigilante(antes)
  fs.writeFileSync(path.join(aqui, 'ogfq56oIEoHufFPM-ARREGLADO-vigilante-2026-10-14.json'), JSON.stringify(w, null, 2))
  console.log('ok · nodos', antes.nodes.length, '→', w.nodes.length)
}
