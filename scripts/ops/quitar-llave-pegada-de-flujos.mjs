#!/usr/bin/env node
// Quita la llave PEGADA como "respaldo" en las expresiones de n8n: `{{ $env.SUPABASE_SERVICE_ROLE_KEY || '<llave pegada>' }}` → `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`.
// (22-oct · cierre de la fuga · plan Doppler, punto 5 de la certificación de CC#3.) Los 2 flujos que la traen hoy: GwVId15UjYxqSn0Q (UptimeRobot → Slack, cron 5 min) y VHmEAgsBhRd5ymgM (respaldo semanal de Supabase).
// Por qué no cambia el comportamiento: la variable ya existe en n8n, y la expresión solo caía a la pegada si la variable estaba vacía. Con la pegada fuera, si la variable falta el flujo FALLA (visible), no usa una llave vieja en silencio.
//
//   node scripts/ops/quitar-llave-pegada-de-flujos.mjs --seco                 (por omisión: cuenta y muestra la forma del cambio, sin valores)
//   node scripts/ops/quitar-llave-pegada-de-flujos.mjs --aplicar --respaldos <carpeta FUERA de la bóveda>   (respaldo exacto, PUT, re-registro del horario, lectura de vuelta)
//   reversa: node scripts/ops/n8n-flujo.mjs restaurar <id> <respaldo.json> --ejecutar
// No imprime el valor en ningún caso.
import fs from 'node:fs'
import path from 'node:path'

export const FLUJOS = ['GwVId15UjYxqSn0Q', 'VHmEAgsBhRd5ymgM']
export const NOMBRE_DE_LA_VARIABLE = 'SUPABASE_SERVICE_ROLE_KEY'

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `|| '<valor>'` o `|| "<valor>"` justo después de `$env.NOMBRE`; devuelve el texto nuevo y cuántas veces lo quitó */
export function quitarRespaldoPegado(texto, valor, variable = NOMBRE_DE_LA_VARIABLE) {
  if (typeof texto !== 'string' || !valor) return { texto, quitados: 0 }
  const re = new RegExp(`(\\$env\\.${escapar(variable)})\\s*\\|\\|\\s*(['"])${escapar(valor)}\\2`, 'g')
  let quitados = 0
  const nuevo = texto.replace(re, (_m, antes) => { quitados++; return antes })
  return { texto: nuevo, quitados }
}

/** recorre cualquier estructura y aplica `quitarRespaldoPegado` a cada texto; devuelve una copia */
export function limpiarFlujo(flujo, valor) {
  let total = 0, restantes = 0
  const rec = (o) => {
    if (typeof o === 'string') { const r = quitarRespaldoPegado(o, valor); total += r.quitados; if (valor && r.texto.includes(valor)) restantes++; return r.texto }
    if (Array.isArray(o)) return o.map(rec)
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rec(v)]))
    return o
  }
  const copia = rec(flujo)
  return { flujo: copia, quitados: total, restantes }
}

async function main(argv) {
  const aplicar = argv.includes('--aplicar')
  const i = argv.indexOf('--respaldos')
  const carpeta = i >= 0 ? argv[i + 1] : null
  const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
  const E = (k) => process.env[k] ?? (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')   // con `doppler run --` sale de Doppler; el .env.local queda de respaldo
  const BASE = E('N8N_BASE_URL').replace(/\/$/, ''), K = E('N8N_API_KEY'), V = E(NOMBRE_DE_LA_VARIABLE)
  if (!BASE || !K || !V) { console.error('faltan N8N_BASE_URL / N8N_API_KEY / ' + NOMBRE_DE_LA_VARIABLE); return 2 }
  if (aplicar && (!carpeta || /zr-vault|OneDrive/i.test(carpeta))) { console.error('--aplicar exige --respaldos <carpeta> FUERA de la bóveda (el respaldo trae la llave pegada)'); return 2 }
  const api = async (m, p, body) => { const r = await fetch(`${BASE}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': K, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 160)}`); return JSON.parse(t) }
  if (aplicar) {
    const corriendo = (await api('GET', '/executions?status=running&limit=20')).data ?? []
    if (corriendo.length) { console.error(`hay ${corriendo.length} ejecuciones corriendo; no se toca nada ahora`); return 3 }
  }
  let ok = true
  for (const id of FLUJOS) {
    const vivo = await api('GET', `/workflows/${id}`)
    const r = limpiarFlujo(vivo, V)
    console.log(`${id} «${vivo.name}»: ${r.quitados} respaldos pegados por quitar · quedarían ${r.restantes} textos con el valor`)
    if (r.restantes) { console.log('   ✖ el valor aparece fuera de una expresión `$env … ||`: no se puede quitar automáticamente'); ok = false; continue }
    if (!aplicar) continue
    fs.mkdirSync(carpeta, { recursive: true })
    const archivo = path.join(carpeta, `${id}-antes.json`)
    fs.writeFileSync(archivo, JSON.stringify(vivo))
    const { name, nodes, connections, settings } = r.flujo
    await api('PUT', `/workflows/${id}`, { name, nodes, connections, settings })
    if (vivo.active) { await api('POST', `/workflows/${id}/deactivate`); await api('POST', `/workflows/${id}/activate`) }
    const despues = await api('GET', `/workflows/${id}`)
    const quedan = JSON.stringify(despues).includes(V)
    console.log(`   ${quedan ? '✖ el valor TODAVÍA está en el flujo' : '✔ leído de vuelta: el valor ya no está'} · activo=${despues.active} · respaldo en ${archivo}`)
    if (quedan || despues.active !== vivo.active) ok = false
  }
  return ok ? 0 : 1
}

if (process.argv[1]?.endsWith('quitar-llave-pegada-de-flujos.mjs')) main(process.argv.slice(2)).then((c) => setTimeout(() => process.exit(c), 100))
