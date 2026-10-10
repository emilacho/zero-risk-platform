// VERIFICAR LA ROTACIÓN DE INTERNAL_API_KEY · solo lectura · NUNCA imprime la llave.
//   node scripts/ops/verificar-llave-interna.mjs [--env-file=<ruta del .env.local>] [--horas=2]
// Hace tres cosas:
//  1 · la nueva llave (la del .env.local) abre una ruta protegida de Vercel (200) y una llave equivocada NO la abre (401)
//  2 · lista los flujos de n8n que todavía tienen la llave PEGADA como texto (deben ser 0 antes de rotar; si no, se romperán al rotar)
//  3 · cuenta, por flujo, las ejecuciones con error 401/unauthorized de las últimas horas (después de rotar deben ser 0)
import fs from 'node:fs'

/** pura: ¿esta ejecución con error es un rechazo por llave? */
export function esRechazoDeLlave(mensaje) {
  return /\b401\b|unauthorized|invalid x-api-key|missing x-api-key|authorization failed/i.test(String(mensaje ?? ''))
}
/** pura: resumen por flujo de las ejecuciones fallidas por llave */
export function resumirRechazos(ejecuciones) {
  const por = {}
  for (const e of ejecuciones) if (esRechazoDeLlave(e.mensaje)) { por[e.flujo] = (por[e.flujo] ?? 0) + 1 }
  return por
}

async function main() {
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const envFile = arg('--env-file=') || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  const horas = Number(arg('--horas=') || 2)
  if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const K = process.env.INTERNAL_API_KEY
  if (!K) { console.log('✗ no hay INTERNAL_API_KEY en el entorno'); process.exit(2) }
  const vercel = process.env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app'
  let fallos = 0
  const ruta = `${vercel}/api/agent-health-metrics`
  const buena = await fetch(ruta, { headers: { 'x-api-key': K } })
  const mala = await fetch(ruta, { headers: { 'x-api-key': K.slice(0, -1) + (K.endsWith('0') ? '1' : '0') } })
  console.log(`1 · Vercel ${ruta}: llave actual → ${buena.status} (esperado 200) · llave equivocada → ${mala.status} (esperado 401)`)
  if (buena.status !== 200 || mala.status !== 401) fallos++

  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app'
  const h = { 'X-N8N-API-KEY': process.env.N8N_API_KEY ?? '' }
  const ids = []
  let cursor = ''
  do { const r = await (await fetch(`${base}/api/v1/workflows?limit=250${cursor ? '&cursor=' + cursor : ''}`, { headers: h })).json(); ids.push(...(r.data ?? []).map((w) => ({ id: w.id, name: w.name, active: w.active }))); cursor = r.nextCursor || '' } while (cursor)
  const pegados = []
  for (const w of ids) { const t = JSON.stringify(await (await fetch(`${base}/api/v1/workflows/${w.id}`, { headers: h })).json()); if (t.includes(K)) pegados.push(w) }
  console.log(`2 · flujos de n8n con la llave ACTUAL pegada como texto: ${pegados.length} (esperado 0)`)
  for (const w of pegados) console.log(`     · ${w.id} ${w.name} ${w.active ? '(activo)' : ''}`)
  if (pegados.length) fallos++

  const desde = Date.now() - horas * 3_600_000
  const ex = await (await fetch(`${base}/api/v1/executions?status=error&limit=250`, { headers: h })).json()
  const nombres = Object.fromEntries(ids.map((w) => [w.id, w.name]))
  const recientes = (ex.data ?? []).filter((e) => new Date(e.startedAt).getTime() >= desde)
  const detalle = []
  for (const e of recientes.slice(0, 120)) {
    const d = await (await fetch(`${base}/api/v1/executions/${e.id}?includeData=true`, { headers: h })).json()
    detalle.push({ flujo: nombres[e.workflowId] ?? e.workflowId, mensaje: d.data?.resultData?.error?.message ?? '' })
  }
  const rechazos = resumirRechazos(detalle)
  console.log(`3 · ejecuciones con error en las últimas ${horas} h: ${recientes.length} · rechazadas por llave (401): ${Object.values(rechazos).reduce((a, b) => a + b, 0)}`)
  for (const [f, n] of Object.entries(rechazos)) console.log(`     · ${f}: ${n}`)
  if (Object.keys(rechazos).length) fallos++
  console.log(fallos ? `✗ ${fallos} comprobación(es) no pasaron` : '✓ todo responde con la llave nueva')
  process.exit(fallos ? 1 : 0)
}
if (process.argv[1] && process.argv[1].endsWith('verificar-llave-interna.mjs')) main()
