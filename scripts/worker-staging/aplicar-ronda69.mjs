// ronda 69 · aplicar los flujos con las SEGURIDADES que faltaron en la 68:
//   construir → respaldo FRESCO + flujo arreglado (no toca n8n)
//   aplicar   → por cada flujo: n8n 0 corriendo/0 esperando · `diferencia` del respaldo contra el VIVO debe dar iguales (si alguien lo cambió en medio, NO se restaura) · restaurar · releer iguales
// Uso: node aplicar-ronda69.mjs construir|aplicar [id,id,…]
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FLUJOS } from './construir-ronda69.mjs'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
const FECHA = '2026-10-11'
const modo = process.argv[2]
const solo = process.argv[3] ? process.argv[3].split(',') : null
const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const N = g('N8N_BASE_URL'), K = g('N8N_API_KEY')
const flujoCli = (...a) => execFileSync('node', [RAIZ + 'scripts/ops/n8n-flujo.mjs', ...a], { encoding: 'utf8', cwd: RAIZ, maxBuffer: 50 * 1024 * 1024 })
const corriendo = async () => {
  let n = 0
  for (const s of ['running', 'waiting']) n += ((await (await fetch(`${N}/api/v1/executions?status=${s}&limit=5`, { headers: { 'X-N8N-API-KEY': K } })).json()).data || []).length
  return n
}
const ruta = (pref, tipo) => `scripts/worker-staging/${pref}-${tipo}-ronda69-${FECHA}.json`

if (!['construir', 'aplicar'].includes(modo)) throw new Error('uso: construir|aplicar [ids]')
fs.mkdirSync(RAIZ + 'scripts/worker-staging/_tmp', { recursive: true })
for (const [id, pref, fn] of FLUJOS) {
  if (solo && !solo.includes(id)) continue
  fs.mkdirSync(RAIZ + 'scripts/worker-staging/' + pref.split('/')[0], { recursive: true })
  if (modo === 'construir') {
    flujoCli('respaldar', id, RAIZ + ruta(pref, 'ANTES'))
    const antes = JSON.parse(fs.readFileSync(RAIZ + ruta(pref, 'ANTES'), 'utf8'))
    fs.writeFileSync(RAIZ + ruta(pref, 'ARREGLADO'), JSON.stringify(fn(antes), null, 2))
    console.log('construido', id, pref)
  } else {
    if ((await corriendo()) !== 0) { console.log('🔴 n8n tiene corridas vivas · NO se aplica nada más'); process.exit(1) }
    const dif = flujoCli('diferencia', id, RAIZ + ruta(pref, 'ANTES'))
    if (!/"iguales":\s*true/.test(dif)) { console.log('🔴', id, 'el VIVO cambió después del respaldo · NO se restaura · hay que reconstruir sobre el vivo\n', dif.slice(0, 400)); continue }
    const r = flujoCli('restaurar', id, RAIZ + ruta(pref, 'ARREGLADO'), '--ejecutar')
    const post = flujoCli('diferencia', id, RAIZ + ruta(pref, 'ARREGLADO'))
    console.log(/"iguales":\s*true/.test(post) ? '✔ aplicado' : '🔴 NO quedó igual', id, '·', r.trim().split('\n').pop().slice(0, 160))
  }
}
