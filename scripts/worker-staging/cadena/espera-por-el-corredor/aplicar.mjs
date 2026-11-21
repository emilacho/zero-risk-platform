// 21-nov · opción A (GO Lenovo 02:47Z · CC1) · APLICA en n8n el DESPUÉS de los 4 sub-flujos de la cadena (la vuelta del agente llega por el corredor a un Wait).
// SOLO con el FIRME de CC6 (y la lectura de CC7) y el turno de la fila.
// Candados (si uno falla, no escribe NADA):
//   1. n8n sin ejecuciones `running` ni `waiting` (0/0);
//   2. cada vivo es IGUAL a su ANTES guardado (nodos y conexiones): nadie lo cambió desde que se midió;
//   3. cada DESPUÉS es exactamente el cambio puro `conEsperaPorElCorredor(ANTES)`: nada más que eso.
// Escribe los 4 en fila. Si un PUT falla o el vivo no queda igual, VUELVE ATRÁS los que ya escribió (al ANTES) y lo dice.
// Después relee cada vivo, comprueba que quedó igual al DESPUÉS y guarda su FOTO (`<id>-VIVO-2026-11-21.json`).
// ORDEN SEGURO: estos flujos pueden ir ANTES que el código. Con el código de hoy, run-sdk ignora `callback_mode=runner` para el estratega y la vuelta
// la entrega Vercel al mismo Wait (dentro de sus 800 s, como hoy). Con el código nuevo la entrega el corredor, sin techo.
// Reversa: `--revertir` hace lo mismo al revés (cada vivo tiene que ser igual a su DESPUÉS y queda igual a su ANTES).
// Uso:  doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/espera-por-el-corredor/aplicar.mjs            → plan (no escribe)
//       doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/espera-por-el-corredor/aplicar.mjs --ejecutar [--revertir]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conEsperaPorElCorredor, SUBFLUJOS } from '../espera-por-el-corredor.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const FECHA = '2026-11-21'
const base = process.env.N8N_BASE_URL?.replace(/\/$/, ''), key = process.env.N8N_API_KEY
if (!base || !key) throw new Error('faltan N8N_BASE_URL / N8N_API_KEY (correr con doppler)')
const ejecutar = process.argv.includes('--ejecutar')
const revertir = process.argv.includes('--revertir')
const h = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
const leer = (id, n) => JSON.parse(readFileSync(join(aqui, `${id}-${n}-${FECHA}.json`), 'utf8'))
const forma = (f) => JSON.stringify({ n: f.nodes, c: f.connections })
const igual = (a, b) => forma(a) === forma(b)
const cuerpoDelPut = (f) => ({ name: f.name, nodes: f.nodes, connections: f.connections, settings: f.settings ?? {} })
const leerVivo = async (id) => { const r = await fetch(`${base}/api/v1/workflows/${id}`, { headers: h }); if (!r.ok) throw new Error(`n8n GET ${id} → ${r.status}`); return r.json() }

const plan = Object.entries(SUBFLUJOS).map(([id, s]) => {
  const antes = leer(id, 'ANTES'), despues = leer(id, 'DESPUES')
  // 3 · el DESPUÉS es el cambio puro, nada más
  if (!igual(conEsperaPorElCorredor(antes, s.forma), despues)) throw new Error(`ALTO · ${id}: el DESPUÉS guardado no es el cambio puro del ANTES`)
  return { id, ...s, desde: revertir ? despues : antes, hacia: revertir ? antes : despues, antes }
})

// 1 · n8n 0/0
for (const st of ['running', 'waiting']) {
  const r = await fetch(`${base}/api/v1/executions?status=${st}&limit=50`, { headers: h })
  const j = await r.json()
  if (!r.ok || !Array.isArray(j.data)) throw new Error(`ALTO · no pude leer las ejecuciones ${st}`)
  if (j.data.length) throw new Error(`ALTO · n8n ${st}: ${j.data.length} (${j.data.map((e) => e.workflowId + ':' + e.id).join(', ')})`)
}
// 2 · cada vivo es el que se midió (los 4 ANTES de escribir el primero)
for (const p of plan) {
  const vivo = await leerVivo(p.id)
  if (!igual(vivo, p.desde)) throw new Error(`ALTO · ${p.id} (${p.clave}): el vivo no es igual al de partida; alguien lo cambió. No escribo nada`)
  console.log(`✓ ${p.id} · ${p.clave} · vivo = ${revertir ? 'DESPUÉS' : 'ANTES'} · activo=${vivo.active} · versionId=${vivo.versionId}`)
}
if (!ejecutar) { console.log('PLAN · candados verdes; no escribí nada (falta --ejecutar)'); process.exit(0) }

const escritos = []
const volverAtras = async (motivo) => {
  for (const p of escritos.reverse()) {
    const r = await fetch(`${base}/api/v1/workflows/${p.id}`, { method: 'PUT', headers: h, body: JSON.stringify(cuerpoDelPut(p.desde)) })
    const ok = r.ok && igual(await leerVivo(p.id), p.desde)
    console.error(`${ok ? 'VUELTO ATRÁS' : '🔴 NO PUDE VOLVER ATRÁS'} · ${p.id} (${p.clave})`)
  }
  throw new Error(`ALTO · ${motivo}`)
}
for (const p of plan) {
  const put = await fetch(`${base}/api/v1/workflows/${p.id}`, { method: 'PUT', headers: h, body: JSON.stringify(cuerpoDelPut(p.hacia)) })
  if (!put.ok) await volverAtras(`PUT ${p.id} → ${put.status}: ${(await put.text()).slice(0, 300)}`)
  escritos.push(p)
  const quedo = await leerVivo(p.id)
  if (!igual(quedo, p.hacia)) await volverAtras(`${p.id}: después del PUT el vivo no quedó igual al esperado`)
  writeFileSync(join(aqui, `${p.id}-VIVO-${FECHA}${revertir ? '-revertido' : ''}.json`), JSON.stringify(quedo, null, 2) + '\n')
  console.log(`${revertir ? 'REVERTIDO' : 'APLICADO'} · ${p.id} · ${p.clave} · nodos ${p.desde.nodes.length} → ${quedo.nodes.length} · activo=${quedo.active} · versionId=${quedo.versionId}`)
}
