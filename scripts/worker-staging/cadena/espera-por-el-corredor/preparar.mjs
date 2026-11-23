// 21-nov · opción A (GO Lenovo 02:47Z · CC1) · SOLO LECTURA de n8n: baja los 4 sub-flujos vivos, guarda el ANTES de cada uno y escribe su DESPUÉS
// con la espera por el corredor (`../espera-por-el-corredor.mjs`). Aplicarlo es otro paso (`aplicar.mjs`), después del FIRME, con n8n 0/0 y cada ANTES igual al vivo.
// Uso:  doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/espera-por-el-corredor/preparar.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conEsperaPorElCorredor, SUBFLUJOS } from '../espera-por-el-corredor.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
export const FECHA = '2026-11-21'

const base = process.env.N8N_BASE_URL?.replace(/\/$/, ''), key = process.env.N8N_API_KEY
if (!base || !key) throw new Error('faltan N8N_BASE_URL / N8N_API_KEY (correr con doppler)')
for (const [id, { forma }] of Object.entries(SUBFLUJOS)) {
  const r = await fetch(`${base}/api/v1/workflows/${id}`, { headers: { 'X-N8N-API-KEY': key } })
  if (!r.ok) throw new Error(`n8n GET ${id} → ${r.status}`)
  const vivo = await r.json()
  const despues = conEsperaPorElCorredor(vivo, forma)
  writeFileSync(join(aqui, `${id}-ANTES-${FECHA}.json`), JSON.stringify(vivo, null, 2) + '\n')
  writeFileSync(join(aqui, `${id}-DESPUES-${FECHA}.json`), JSON.stringify(despues, null, 2) + '\n')
  console.log(`${id} · ${vivo.name} · activo=${vivo.active} · versionId=${vivo.versionId} · nodos ${vivo.nodes.length} → ${despues.nodes.length}`)
}
