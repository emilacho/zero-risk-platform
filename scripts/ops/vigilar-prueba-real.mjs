// CC#1 · PRUEBA REAL · envoltorio del vigía certificado (#650, cabeza 923f9f0): cada 30 s mide el gasto del cliente, avisa por Slack al llegar al aviso y APAGA al llegar al tope.
//   node vigilar-prueba-real.mjs --desde <ISO del POST menos 1 min> --tope 10 --aviso 8 [--nombre "Zero Risk Seguridad Industrial"] [--cliente <uuid>] [--ensayo] [--una-vez]
// Sin --cliente: espera a que la ficha NAZCA (clients creada después de --desde con ese nombre) y la usa. --ensayo = no apaga nunca (solo mira). Nunca imprime llaves.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const tiene = (n) => args.includes(n)
const desde = flag('--desde'), tope = flag('--tope', '10'), aviso = flag('--aviso', '8'), nombre = flag('--nombre', 'Zero Risk Seguridad Industrial')
let cliente = flag('--cliente')
if (!desde || Number.isNaN(Date.parse(desde))) { console.error('falta --desde (ISO)'); process.exit(2) }
const ENV = 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const texto = fs.readFileSync(ENV, 'utf8')
const g = (k) => (texto.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SB = g('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''), KEY = g('SUPABASE_SERVICE_ROLE_KEY')
import { crearAlarmas, publicarEnSlack } from './alarma-por-incidente.mjs'
const TOKEN_BOT = (texto.match(/^SLACK_BOT_TOKEN=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const alarmas = crearAlarmas({ publicar: publicarEnSlack({ token: TOKEN_BOT }) })
const VIGIA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vigia-prueba.mjs')
const LOG = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/estado/CC1-vigia-prueba-real.log'
const log = (s) => { const l = `${new Date().toISOString().slice(11, 19)}Z ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n') }
const rest = async (ruta) => { const r = await fetch(`${SB}/rest/v1/${ruta}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }); return r.json() }
fs.writeFileSync(LOG, `# vigía de la prueba real · CC#1 · inicio ${new Date().toISOString()} · desde ${desde} · tope ${tope} · aviso ${aviso}${tiene('--ensayo') ? ' · ENSAYO (no apaga)' : ''}\n`)
let avisado = false
const salir = async (c) => { await new Promise((r) => setTimeout(r, 300)); process.exit(c) }
for (;;) {
  if (!cliente) {
    const f = await rest(`clients?select=id,name,created_at&created_at=gte.${encodeURIComponent(desde)}&name=ilike.${encodeURIComponent(nombre + '*')}&order=created_at.asc&limit=1`)
    if (Array.isArray(f) && f[0]) { cliente = f[0].id; log(`la ficha nació: ${cliente} («${f[0].name}», ${f[0].created_at})`) }
    else { log('esperando que nazca la ficha…'); if (tiene('--una-vez')) await salir(0); await new Promise((r) => setTimeout(r, 15000)); continue }
  }
  const base = ['--cliente', cliente, '--desde', desde, '--tope', tope, '--aviso', aviso, '--una-vez', '--env', ENV]
  let r = spawnSync('node', [VIGIA, ...base], { encoding: 'utf8' })
  let salida = (r.stdout || '').trim().split('\n').pop() + (r.stderr ? ' ' + r.stderr.trim().slice(0, 200) : '')
  if (r.status === 20 && !tiene('--ensayo')) {
    log('TOPE ALCANZADO → apagando (candado del alta + finanzas + oficina + revisión + cadena)')
    r = spawnSync('node', [VIGIA, ...base, '--apagar'], { encoding: 'utf8' })
    log((r.stdout || '').trim().replace(/\n/g, ' | '))
    log('alarma: ' + JSON.stringify(await alarmas.avisar({ clave: 'gasto-prueba-real', titulo: 'Prueba real: tope de gasto alcanzado y módulos apagados', detalle: `Tope de US$ ${tope}: candado del alta cerrado y módulos apagados (código ${r.status}). Lo en vuelo se revisa a mano.` })))
    await salir(r.status ?? 20)
  }
  log(`código ${r.status} · ${salida}`)
  if (r.status === 10 && !avisado) { avisado = true; log('alarma: ' + JSON.stringify(await alarmas.avisar({ clave: 'gasto-prueba-real', titulo: `Prueba real: llegó al aviso de gasto (US$ ${aviso} de ${tope})`, detalle: salida }))) }
  if (r.status === 20 && tiene('--ensayo')) { log('(ensayo: tope alcanzado, no se apaga)'); await salir(20) }
  if (tiene('--una-vez')) await salir(r.status ?? 0)
  await new Promise((x) => setTimeout(x, 30000))
}
