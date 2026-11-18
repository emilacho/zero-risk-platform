// ENSAYO de la migración 202611180500 contra la base REAL, que SIEMPRE se deshace · US$ 0, no cambia nada
// uso: node ensayo-migracion.mjs <archivo.sql>
// Cambia solo dos cosas del archivo: el aviso final pasa a ser una excepción («ENSAYO-OK …», que deshace todo el DO) y `commit` pasa a `rollback`.
// Si un candado salta, vuelve SU mensaje (y también se deshace). Antes, mide la puerta: n8n 0/0 y fuera de los minutos :59/:00/:29/:30.
import fs from 'node:fs'
import { sql } from './conjuntos.mjs'

const archivo = process.argv[2]
const original = fs.readFileSync(archivo, 'utf8')
const AVISO = "raise notice 'limpieza de Náufrago: hecha · el reel % y el plan intactos', reel;"
if (!original.includes(AVISO) || (original.match(/^commit;$/gm) ?? []).length !== 1) { console.log('✘ el archivo no tiene la forma esperada'); process.exit(1) }
const ensayo = original.replace(AVISO, "raise exception 'ENSAYO-OK · todos los candados pasaron · reel % intacto', reel;").replace(/^commit;$/m, 'rollback;')

const m = new Date().getUTCMinutes()
if ([59, 0, 29, 30].includes(m)) { console.log(`✘ minuto prohibido :${m}`); process.exit(1) }
const base = (process.env.N8N_BASE_URL || process.env.N8N_API_URL).replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
for (const st of ['running', 'waiting']) {
  const r = await fetch(`${base}/api/v1/executions?status=${st}&limit=50`, { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } })
  const n = (await r.json()).data?.length ?? -1
  if (n !== 0) { console.log(`✘ n8n ${st}: ${n}`); process.exit(1) }
}
try { await sql(ensayo, false); console.log('✘ el ensayo terminó sin su excepción: revisar'); process.exitCode = 1 }
catch (e) { const t = String(e); const ok = t.match(/ENSAYO-OK[^"\\]*/); console.log(ok ? `✔ ${ok[0]}` : `✘ ${t.slice(0, 700)}`); process.exitCode = ok ? 0 : 1 }
