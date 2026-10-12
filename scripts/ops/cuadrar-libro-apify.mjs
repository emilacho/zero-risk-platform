#!/usr/bin/env node
/**
 * Solo LECTURA · ¿el libro de costos de Apify cuadra con la cuenta? Para un día (AAAA-MM-DD, UTC):
 *   cuenta = suma de usageTotalUsd de las corridas del día en la cuenta de Apify
 *   anotado = suma de las filas de llamada con run_id y costo_conocido (service='apify:<función>')
 *   resto = lo que el pase diario de las 05:00 escribirá en la fila del día = cuenta − Σ min(anotado de la corrida, su costo)  (nunca negativo por corrida)
 *   el libro quedará en anotado + resto; debe ser igual a la cuenta. Muestra además las corridas con la llamada sin importe (las cubre el resto entero).
 * Uso: node scripts/ops/cuadrar-libro-apify.mjs 2026-10-12
 */
import fs from 'node:fs'
const envPath = 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const dia = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(dia ?? '')) { console.error('uso: cuadrar-libro-apify.mjs AAAA-MM-DD'); process.exit(1) }
const H = { Authorization: 'Bearer ' + g('APIFY_API_TOKEN') }
const SB = g('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''); const SK = g('SUPABASE_SERVICE_ROLE_KEY')
const corridas = []
for (let off = 0; off < 1000; off += 200) {
  const l = (await (await fetch(`https://api.apify.com/v2/actor-runs?limit=200&offset=${off}&desc=1`, { headers: H })).json()).data.items
  if (!l.length) break
  corridas.push(...l.filter((r) => String(r.startedAt).slice(0, 10) === dia))
  if (String(l[l.length - 1].startedAt).slice(0, 10) < dia) break
}
const detalle = []
for (const r of corridas) detalle.push({ id: r.id, usd: (await (await fetch('https://api.apify.com/v2/actor-runs/' + r.id, { headers: H })).json()).data.usageTotalUsd ?? 0 })
const filas = await (await fetch(`${SB}/rest/v1/costs?select=service,amount_usd_exact,description&service=like.apify:*&date=eq.${dia}`, { headers: { apikey: SK, Authorization: 'Bearer ' + SK } })).json()
const anotado = {}
for (const f of filas) { try { const d = JSON.parse(f.description || '{}'); if (d.run_id && d.costo_conocido === true) anotado[d.run_id] = (anotado[d.run_id] || 0) + (Number(f.amount_usd_exact) || 0) } catch { /* fila sin descripción legible */ } }
let cuenta = 0, ya = 0, resto = 0
const sinImporte = []
for (const c of detalle) {
  cuenta += c.usd
  const a = Math.min(anotado[c.id] || 0, c.usd)
  ya += a; resto += Math.max(0, c.usd - a)
  if (!(c.id in anotado)) sinImporte.push(c.id)
}
const r6 = (x) => Number(x.toFixed(6))
console.log(JSON.stringify({ dia, corridas_en_la_cuenta: detalle.length, cuenta_usd: r6(cuenta), anotado_en_las_llamadas_usd: r6(ya), resto_que_escribira_el_pase_de_las_05_usd: r6(resto), libro_despues_del_pase_usd: r6(ya + resto), diferencia_con_la_cuenta_usd: r6(ya + resto - cuenta), corridas_sin_importe_en_su_llamada: sinImporte.length, cuadra: Math.abs(ya + resto - cuenta) < 0.000001 }, null, 1))
