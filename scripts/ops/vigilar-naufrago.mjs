// CC#1 · RESGUARDO de la prueba real (orden de Lenovo 11:40): mira cada 30 s si Náufrago (0a2ffbd4…) tiene llamadas de agente, costos o sobres NUEVOS en la sala. Solo lectura. Si aparece algo, avisa a Lenovo por Slack; CC#3 cierra los módulos (no se toca nada de Náufrago).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const texto = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k) => (texto.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SB = g('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''), KEY = g('SUPABASE_SERVICE_ROLE_KEY')
import { crearAlarmas, publicarEnSlack } from './alarma-por-incidente.mjs'
const TOKEN_BOT = (texto.match(/^SLACK_BOT_TOKEN=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const alarmas = crearAlarmas({ publicar: publicarEnSlack({ token: TOKEN_BOT }) })
const NAU = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const LOG = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/estado/CC1-vigia-naufrago.log'
const log = (s) => { const l = `${new Date().toISOString().slice(11, 19)}Z ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n') }
const cuenta = async (ruta) => { const r = await fetch(`${SB}/rest/v1/${ruta}`, { method: 'HEAD', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact' } }); const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/); if (!m) throw new Error('sin conteo ' + ruta.split('?')[0] + ' ' + r.status); return Number(m[1]) }
const medir = async () => ({
  llamadas: await cuenta(`agent_invocations?client_id=eq.${NAU}&select=id`),
  costos: await cuenta(`costs?description=like.*${NAU}*&select=id`),
  sala: await cuenta(`sala_event_log?client_id=eq.${NAU}&select=event_id`),
})
fs.writeFileSync(LOG, '# resguardo de Náufrago · CC#1 · inicio ' + new Date().toISOString() + '\n')
const base = await medir()
log('línea base: ' + JSON.stringify(base))
let previo = base
for (;;) {
  await new Promise((r) => setTimeout(r, 30000))
  let ahora
  try { ahora = await medir() } catch (e) { log('ERROR de lectura: ' + (e instanceof Error ? e.message : e)); continue }
  const cambio = Object.keys(base).filter((k) => ahora[k] !== previo[k])
  if (cambio.length) {
    log('🔴 CAMBIO en Náufrago: ' + cambio.map((k) => `${k} ${previo[k]}→${ahora[k]}`).join(' · '))
    log('alarma: ' + JSON.stringify(await alarmas.avisar({ clave: 'naufrago-actividad', titulo: 'Náufrago tuvo actividad nueva durante la prueba real', detalle: cambio.map((k) => `${k} ${previo[k]}→${ahora[k]}`).join(' · ') })))
    previo = ahora
  }
}
