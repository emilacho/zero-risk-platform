// CC#1 · PRUEBA REAL · envoltorio del vigía certificado (#650/#679): cada 30 s mide el gasto del cliente (y de las fichas que se llaman igual), avisa al llegar al aviso y APAGA al llegar al tope.
//   node vigilar-prueba-real.mjs --desde <ISO del POST menos 1 min> --tope 10 --aviso 8 [--nombre "Zero Risk Seguridad Industrial"] [--cliente <uuid>] [--mismo-nombre] [--ensayo] [--una-vez]
// Sin --cliente: espera a que la ficha NAZCA (clients creada después de --desde con ese nombre) y la usa. --ensayo = no apaga nunca (solo mira). Nunca imprime llaves.
// --mismo-nombre: suma además todas las fichas con el nombre de la encontrada nacidas desde --desde (la prueba repetida abre una ficha nueva con el mismo nombre).
// Avisos: UNA alarma por incidente en #alertas (alarma-por-incidente.mjs); aviso y tope comparten la clave `gasto-prueba-real` (el tope va en el hilo del aviso).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { crearAlarmas, publicarEnSlack } from './alarma-por-incidente.mjs'

export const CLAVE_DE_LA_ALARMA = 'gasto-prueba-real'

/** lo que se le pasa al vigía certificado en cada vuelta */
export function argumentosBase({ cliente, desde, tope, aviso, env, mismoNombre = false }) {
  return ['--cliente', cliente, '--desde', desde, '--tope', tope, '--aviso', aviso, '--una-vez', '--env', env, ...(mismoNombre ? ['--mismo-nombre'] : [])]
}

/**
 * El texto de la alarma al llegar al tope, según lo que el vigía devolvió al APAGAR. Solo el código 20 significa «apagado y leído de vuelta»;
 * 4 = el apagado no se pudo leer de vuelta; cualquier otro (2, null…) = error: NO se puede afirmar que esté apagado.
 */
export function alarmaDelTope({ status, tope }) {
  if (status === 20) {
    return { titulo: 'Prueba real: tope de gasto alcanzado y módulos apagados', detalle: `Tope de US$ ${tope}: candado del alta cerrado y módulos apagados y leídos de vuelta. Lo en vuelo se revisa a mano.` }
  }
  return {
    titulo: '⚠️ Prueba real: tope de gasto alcanzado y NO se pudo confirmar el apagado',
    detalle: `Tope de US$ ${tope}: el vigía devolvió el código ${status ?? 'sin código'} al apagar (solo 20 = apagado y leído de vuelta; 4 = no se pudo leer de vuelta). El gasto puede seguir: APAGAR A MANO el candado del alta y los interruptores de finanzas, oficina, revisión y cadena, y revisar raw/estado/CC1-vigia-prueba-real.log.`,
  }
}

async function main() {
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
  const alarmas = crearAlarmas({ publicar: publicarEnSlack({ token: g('SLACK_BOT_TOKEN') }) })
  const VIGIA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vigia-prueba.mjs')
  const LOG = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/estado/CC1-vigia-prueba-real.log'
  const log = (s) => { const l = `${new Date().toISOString().slice(11, 19)}Z ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n') }
  const rest = async (ruta) => { const r = await fetch(`${SB}/rest/v1/${ruta}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }); return r.json() }
  fs.writeFileSync(LOG, `# vigía de la prueba real · CC#1 · inicio ${new Date().toISOString()} · desde ${desde} · tope ${tope} · aviso ${aviso}${tiene('--mismo-nombre') ? ' · SUMA FICHAS DEL MISMO NOMBRE' : ''}${tiene('--ensayo') ? ' · ENSAYO (no apaga)' : ''}\n`)
  let avisado = false
  const salir = async (c) => { await new Promise((r) => setTimeout(r, 300)); process.exit(c) }
  for (;;) {
    if (!cliente) {
      const f = await rest(`clients?select=id,name,created_at&created_at=gte.${encodeURIComponent(desde)}&name=ilike.${encodeURIComponent(nombre + '*')}&order=created_at.asc&limit=1`)
      if (Array.isArray(f) && f[0]) { cliente = f[0].id; log(`la ficha nació: ${cliente} («${f[0].name}», ${f[0].created_at})`) }
      else { log('esperando que nazca la ficha…'); if (tiene('--una-vez')) await salir(0); await new Promise((r) => setTimeout(r, 15000)); continue }
    }
    const base = argumentosBase({ cliente, desde, tope, aviso, env: ENV, mismoNombre: tiene('--mismo-nombre') })
    let r = spawnSync('node', [VIGIA, ...base], { encoding: 'utf8' })
    let salida = (r.stdout || '').trim().split('\n').pop() + (r.stderr ? ' ' + r.stderr.trim().slice(0, 200) : '')
    if (r.status === 20 && !tiene('--ensayo')) {
      log('TOPE ALCANZADO → apagando (candado del alta + finanzas + oficina + revisión + cadena)')
      r = spawnSync('node', [VIGIA, ...base, '--apagar'], { encoding: 'utf8' })
      log((r.stdout || '').trim().replace(/\n/g, ' | '))
      log('alarma: ' + JSON.stringify(await alarmas.avisar({ clave: CLAVE_DE_LA_ALARMA, ...alarmaDelTope({ status: r.status, tope }) })))
      await salir(r.status ?? 20)
    }
    log(`código ${r.status} · ${salida}`)
    if (r.status === 10 && !avisado) { avisado = true; log('alarma: ' + JSON.stringify(await alarmas.avisar({ clave: CLAVE_DE_LA_ALARMA, titulo: `Prueba real: llegó al aviso de gasto (US$ ${aviso} de ${tope})`, detalle: salida }))) }
    if (r.status === 20 && tiene('--ensayo')) { log('(ensayo: tope alcanzado, no se apaga)'); await salir(20) }
    if (tiene('--una-vez')) await salir(r.status ?? 0)
    await new Promise((x) => setTimeout(x, 30000))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(String(e)); process.exit(2) })
