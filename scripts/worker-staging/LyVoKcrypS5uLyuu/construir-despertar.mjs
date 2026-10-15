// Suma el DESPERTAR al alta (LyVoKcrypS5uLyuu · Onboarding E2E v2) a partir de su respaldo VIVO del 15-oct. ADITIVO: UN nodo nuevo; ningún otro nodo cambia.
//   node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-despertar.mjs
// «⑦ Despertar el cerebro» llama a /api/brain/alimentar/despertar con el client_id del alta, DESPUÉS de manual y cimiento (cuelga de «Armar carga · segunda fase» como SEGUNDA salida:
// n8n la corre al terminar la rama principal, así que nunca atrasa el pedido de planeación). `onError: continueRegularOutput`: si falla, el alta no se rompe (la ruta ya avisa a #alertas).
// El alta está INACTIVA y este script NO la activa.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const NODO = '⑦ Despertar el cerebro (con el raspado del alta)'
export const DESDE = 'Armar carga · segunda fase'
export function conDespertar(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  if (w.nodes.some((n) => n.name === NODO)) throw new Error('el despertar ya está en el alta')
  const origen = w.nodes.find((n) => n.name === DESDE)
  if (!origen) throw new Error(`no existe «${DESDE}»`)
  const salida = w.connections[DESDE]?.main?.[0]
  if (!salida?.length) throw new Error(`«${DESDE}» no tiene salida`)
  w.nodes.push({
    parameters: {
      method: 'POST', url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/brain/alimentar/despertar",
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ client_id: $('Validate Deal Data').first().json.client_id, dry_run: false, workflow_id: $workflow.id, workflow_execution_id: String($execution.id) }) }}",
      options: { timeout: 280000, response: { response: { neverError: true } } },
    },
    id: 'despertar-7', name: NODO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    position: [(origen.position?.[0] ?? 6080) + 260, (origen.position?.[1] ?? 1100) + 260],
  })
  // SEGUNDA salida de «Armar carga · segunda fase»: corre después de la rama principal
  w.connections[DESDE].main[0] = [...salida, { node: NODO, type: 'main', index: 0 }]
  return w
}
if (process.argv[1] && process.argv[1].endsWith('construir-despertar.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ANTES-despertar-2026-10-15.json'), 'utf8'))
  const w = conDespertar(antes)
  fs.writeFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-despertar-2026-10-15.json'), JSON.stringify(w, null, 2))
  console.log('ok · nodos', antes.nodes.length, '→', w.nodes.length, '· activo =', w.active)
}
