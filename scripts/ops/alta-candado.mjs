#!/usr/bin/env node
/**
 * EL CANDADO DEL ALTA COMPLETA (CC#1 · noche del 19-oct).
 *   node scripts/ops/alta-candado.mjs estado     · dice si está abierto o cerrado, y cuántos sobres esperan en la sala
 *   node scripts/ops/alta-candado.mjs abrir      · abre (abierta:true) SOLO si no hay sobres pendientes; lee de vuelta
 *   node scripts/ops/alta-candado.mjs cerrar     · cierra (abierta:false); lee de vuelta
 * La fila es `settings.alta.abierta`. Cerrado: el alta (LyVoKcrypS5uLyuu) lanza ALTA_CERRADA antes de llamar a ningún agente y no gasta nada.
 * Variables: SUPABASE_ACCESS_TOKEN (de .env.local, ruta con --env). Nunca imprime una llave.
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const orden = args[0]
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const envPath = flag('--env') ?? 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const TOKEN = g('SUPABASE_ACCESS_TOKEN')
const REF = g('SUPABASE_PROJECT_REF') ?? 'ordaeyxvvvdqsznsecjx'
if (!['estado', 'abrir', 'cerrar'].includes(orden) || !TOKEN) { console.error('uso: alta-candado.mjs <estado|abrir|cerrar> [--env ruta]; falta SUPABASE_ACCESS_TOKEN'); process.exit(2) }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error('la base respondió: ' + JSON.stringify(j).slice(0, 200))
  return j
}
const leer = async () => {
  const f = (await sql("select value from public.settings where key = 'alta.abierta'"))[0]
  if (!f) return { existe: false, abierta: false }
  try { return { existe: true, abierta: JSON.parse(f.value).abierta === true } } catch { return { existe: true, abierta: false } }
}
const pendientes = async () => Number((await sql("select count(*) n from public.sala_event_log i where i.step_id like 'intake.%' and not exists (select 1 from public.sala_event_log c where c.stream_id = i.stream_id and c.step_id like 'router.claim.%')"))[0].n)

const main = async () => {
  const antes = await leer()
  const pend = await pendientes()
  console.log(`candado: ${antes.existe ? (antes.abierta ? 'ABIERTO' : 'CERRADO') : 'sin fila (cuenta como CERRADO)'} · sobres pendientes en la sala: ${pend}`)
  if (orden === 'estado') return
  if (orden === 'abrir' && pend !== 0) { console.error('NO se abre: hay sobres pendientes en la sala (se despacharían solos al abrir). Resuélvelos primero.'); process.exitCode = 3; return }
  const nota = 'CANDADO del alta completa: cerrado hasta el dale de Emilio. Para abrir: poner abierta=true.'
  const valor = JSON.stringify({ abierta: orden === 'abrir', nota, cambiado_en: new Date().toISOString() }).replace(/'/g, "''")
  await sql(`insert into public.settings (key, value, category) values ('alta.abierta', '${valor}', 'general') on conflict (key) do update set value = excluded.value`)
  const despues = await leer()
  console.log(`candado ahora: ${despues.abierta ? 'ABIERTO' : 'CERRADO'}`)
  if (despues.abierta !== (orden === 'abrir')) { console.error('la lectura de vuelta NO coincide'); process.exitCode = 4 }
}
main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exitCode = 1 })
