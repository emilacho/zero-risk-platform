// 21-nov · #1260 · APLICA en n8n el DESPUÉS del lector de fichas (`k1IZ5eGfGbUeMQR8`, espera 290 000 → 800 000 ms). Solo con el FIRME de #1260.
// Candados (si uno falla, no escribe nada):
//   1. n8n sin ejecuciones `running` ni `waiting` (0/0);
//   2. el vivo es IGUAL al ANTES guardado (mismos nodos y conexiones): nadie lo cambió desde que se midió;
//   3. el DESPUÉS difiere del ANTES en UN solo valor (el timeout de ese nodo).
// Después del PUT relee el vivo, comprueba que quedó igual al DESPUÉS y guarda la FOTO del vivo (`…-VIVO-2026-11-21.json`).
// Reversa: `--revertir` hace lo mismo al revés (el vivo tiene que ser igual al DESPUÉS y queda igual al ANTES).
// Uso:  doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/fichas-espera-800/aplicar.mjs [--revertir]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ID, NODO, ANTES_MS, DESPUES_MS, cuerpoDelPut } from './preparar.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY
if (!base || !key) throw new Error('faltan N8N_BASE_URL / N8N_API_KEY (correr con doppler)')
const revertir = process.argv.includes('--revertir')
const leer = (n) => JSON.parse(readFileSync(join(aqui, `${ID}-${n}-2026-11-21.json`), 'utf8'))
const [desde, hacia] = revertir ? [leer('DESPUES'), leer('ANTES')] : [leer('ANTES'), leer('DESPUES')]
const h = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
const igual = (a, b) => JSON.stringify({ n: a.nodes, c: a.connections }) === JSON.stringify({ n: b.nodes, c: b.connections })

// 3 · el cambio es UNO solo
const diferencias = []
const recorrer = (a, b, ruta) => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) { if (a !== b) diferencias.push(ruta); return }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) recorrer(a[k], b[k], `${ruta}.${k}`)
}
recorrer({ n: desde.nodes, c: desde.connections }, { n: hacia.nodes, c: hacia.connections }, '')
const nodoDeLaDiferencia = diferencias.length === 1 ? desde.nodes[Number(diferencias[0].split('.')[2])]?.name : null
if (diferencias.length !== 1 || !diferencias[0].endsWith('.parameters.options.timeout') || nodoDeLaDiferencia !== NODO) throw new Error(`ALTO · el cambio no es solo el timeout de «${NODO}»: ${JSON.stringify(diferencias)}`)

// 1 · n8n 0/0
for (const st of ['running', 'waiting']) {
  const r = await fetch(`${base}/api/v1/executions?status=${st}&limit=50`, { headers: h })
  const j = await r.json()
  if (!r.ok || !Array.isArray(j.data)) throw new Error(`ALTO · no pude leer las ejecuciones ${st}`)
  if (j.data.length) throw new Error(`ALTO · n8n ${st}: ${j.data.length}`)
}
// 2 · el vivo es el que se midió
const vivo = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: h })).json()
if (!igual(vivo, desde)) throw new Error('ALTO · el vivo no es igual al de partida: alguien lo cambió; no escribo')

const put = await fetch(`${base}/api/v1/workflows/${ID}`, { method: 'PUT', headers: h, body: JSON.stringify(cuerpoDelPut(hacia)) })
if (!put.ok) throw new Error(`PUT ${put.status}: ${await put.text()}`)
const despues = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: h })).json()
if (!igual(despues, hacia)) throw new Error('ALTO · después del PUT el vivo no quedó igual al esperado (revisar a mano)')
const t = despues.nodes.find((n) => n.name === NODO).parameters.options.timeout
writeFileSync(join(aqui, `${ID}-VIVO-2026-11-21${revertir ? '-revertido' : ''}.json`), JSON.stringify(despues, null, 2) + '\n')
console.log(`${revertir ? 'REVERTIDO' : 'APLICADO'} · ${NODO} espera ${t} ms (${revertir ? DESPUES_MS : ANTES_MS} → ${t}) · activo=${despues.active} · versionId=${despues.versionId}`)
