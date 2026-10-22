#!/usr/bin/env node
// GRUPO C · nuestras llaves: se generan aleatorias y se escriben DIRECTO en Doppler. NUNCA se imprimen, ni se guardan en un archivo, ni van en la línea de comandos.
// (22-oct · ENCARGO «rotación rápida con Doppler» · lo corre CC#2 cuando Emilio ya creó el proyecto e inició sesión en la CLI; Emilio no toca estas llaves.)
//
// Uso:
//   node scripts/ops/generar-secretos-grupo-c.mjs --seco                       (no necesita Doppler: muestra nombres y largos, nada más)
//   node scripts/ops/generar-secretos-grupo-c.mjs --ejecutar --config prd      (escribe las que FALTAN en Doppler; no pisa las que ya existen)
//   node scripts/ops/generar-secretos-grupo-c.mjs --ejecutar --config prd --rotar INTERNAL_API_KEY,CRON_SECRET   (reemplaza SOLO esas)
//   opciones: --proyecto zero-risk (por omisión) · --config dev|prd (una por vez; cada entorno lleva valores DISTINTOS)
//
// Cómo se mantiene en secreto: el valor viaja por la ENTRADA ESTÁNDAR del proceso `doppler secrets set NOMBRE --silent` (no por argumentos: no aparece en la lista de procesos
// ni en el historial del shell); el guion solo imprime nombre, largo y resultado. La lectura de comprobación mide el largo dentro del proceso y descarta el texto.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

/** nombre → para qué sirve · bytes aleatorios (el valor sale en base64url: ~1,33 caracteres por byte) */
export const SECRETOS_GRUPO_C = [
  { nombre: 'INTERNAL_API_KEY', uso: 'abre las rutas internas (Vercel, corredor, n8n, .env.local)', bytes: 48 },
  { nombre: 'SALA_DISPATCH_KEY', uso: 'la sala despacha a n8n', bytes: 32 },
  { nombre: 'SALA_CALLBACK_API_KEY', uso: 'n8n responde a la sala', bytes: 32 },
  { nombre: 'SALA_INGRESS_API_KEY', uso: 'entrada a la sala', bytes: 32 },
  { nombre: 'DEAL_WON_WEBHOOK_KEY', uso: 'trato cerrado → alta', bytes: 32 },
  { nombre: 'MC_API_TOKEN', uso: 'tablero (mission-control)', bytes: 32 },
  { nombre: 'MC_MASTER_PASSWORD', uso: 'contraseña maestra del tablero', bytes: 32 },
  { nombre: 'ADMIN_SECRET', uso: 'rutas de administración', bytes: 32 },
  { nombre: 'N8N_WEBHOOK_SECRET', uso: 'firma de webhooks de n8n', bytes: 32 },
  { nombre: 'PIPELINE_CALLBACK_SECRET', uso: 'vuelta de las cadenas', bytes: 32 },
  { nombre: 'CRON_SECRET', uso: 'Vercel Cron', bytes: 32 },
  { nombre: 'CALCOM_WEBHOOK_SECRET', uso: 'Cal.com firma sus avisos (hay que pegar el MISMO valor en Cal.com → Webhooks)', bytes: 32 },
  { nombre: 'TALLY_SIGNING_SECRET', uso: 'Tally firma sus avisos (hay que pegar el MISMO valor en Tally → Integrations → Webhooks)', bytes: 32 },
  { nombre: 'PORTERO_WEBHOOK_KEY', uso: 'webhooks del portero; pareja de la credencial n8n «Portero · llave de los webhooks (x-portero-key)»', bytes: 32 },
]

/** valor aleatorio criptográfico, solo caracteres seguros para un encabezado, una URL y un archivo de entorno */
export function generarValor(bytes = 32, fuente = randomBytes) {
  return fuente(bytes).toString('base64url')
}

/** qué hay que hacer, dado lo que YA existe en esa configuración (solo nombres) y lo que se pidió rotar */
export function planear(existentes, rotar = []) {
  const ya = new Set(existentes)
  const forzar = new Set(rotar)
  const desconocidas = [...forzar].filter((n) => !SECRETOS_GRUPO_C.some((s) => s.nombre === n))
  const acciones = SECRETOS_GRUPO_C.map((s) => ({ ...s, accion: forzar.has(s.nombre) ? (ya.has(s.nombre) ? 'rotar' : 'crear') : ya.has(s.nombre) ? 'conservar' : 'crear' }))
  return { acciones, desconocidas }
}

/** corre `doppler` con el valor por la entrada estándar; devuelve solo { ok, error } y nunca el texto de la salida */
export function ejecutarDoppler(args, { entrada, run = spawnSync } = {}) {
  const r = run('doppler', args, { input: entrada, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  return { ok: r.status === 0 && !r.error, error: r.error ? String(r.error.code ?? r.error.message) : r.status === 0 ? null : String((r.stderr ?? '').split('\n')[0]).slice(0, 160), salida: r.stdout ?? '' }
}

/** nombres que existen hoy en esa configuración (solo nombres, nunca valores) */
export function nombresExistentes(proyecto, config, run = spawnSync) {
  const r = ejecutarDoppler(['secrets', '--only-names', '--json', '-p', proyecto, '-c', config], { run })
  if (!r.ok) return { ok: false, error: r.error, nombres: [] }
  try { return { ok: true, nombres: Object.keys(JSON.parse(r.salida)) } } catch { return { ok: false, error: 'respuesta ilegible', nombres: [] } }
}

export function ejecutar({ proyecto, config, rotar = [], run = spawnSync, fuente = randomBytes, log = console.log }) {
  const v = ejecutarDoppler(['--version'], { run })
  if (!v.ok) { log('✖ no encuentro la CLI de Doppler (`doppler --version` falló). Instálala e inicia sesión (`doppler login`).'); return { ok: false, escritos: [], fallidos: [] } }
  const ex = nombresExistentes(proyecto, config, run)
  if (!ex.ok) { log(`✖ no pude leer los nombres de ${proyecto}/${config}: ${ex.error}. ¿Existe el proyecto y la sesión tiene acceso?`); return { ok: false, escritos: [], fallidos: [] } }
  const { acciones, desconocidas } = planear(ex.nombres, rotar)
  if (desconocidas.length) { log(`✖ --rotar nombra variables que no son del grupo C: ${desconocidas.join(', ')}`); return { ok: false, escritos: [], fallidos: [] } }
  const escritos = [], fallidos = []
  for (const a of acciones) {
    if (a.accion === 'conservar') { log(`= ${a.nombre}: ya existe en ${config}, se conserva`); continue }
    const valor = generarValor(a.bytes, fuente)
    const w = ejecutarDoppler(['secrets', 'set', a.nombre, '--silent', '-p', proyecto, '-c', config], { entrada: valor, run })
    if (!w.ok) { log(`✖ ${a.nombre}: no se pudo escribir (${w.error})`); fallidos.push(a.nombre); continue }
    // comprobación: el largo guardado debe coincidir, medido dentro del proceso (el texto se descarta)
    const g = ejecutarDoppler(['secrets', 'get', a.nombre, '--plain', '-p', proyecto, '-c', config], { run })
    const largo = g.ok ? g.salida.replace(/\r?\n$/, '').length : -1
    if (largo !== valor.length) { log(`✖ ${a.nombre}: se escribió pero la comprobación de largo no coincide (${largo} ≠ ${valor.length})`); fallidos.push(a.nombre); continue }
    log(`✔ ${a.nombre}: ${a.accion === 'rotar' ? 'rotada' : 'creada'} en ${proyecto}/${config} (${valor.length} caracteres)`)
    escritos.push(a.nombre)
  }
  return { ok: fallidos.length === 0, escritos, fallidos }
}

function main(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
  const proyecto = opt('--proyecto', 'zero-risk')
  const config = opt('--config', '')
  const rotar = (opt('--rotar', '') || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (argv.includes('--seco')) {
    console.log(`SECO · proyecto ${proyecto} · nada se escribe. Variables del grupo C (${SECRETOS_GRUPO_C.length}):`)
    for (const s of SECRETOS_GRUPO_C) console.log(`  ${s.nombre} · ${Math.ceil((s.bytes * 4) / 3)} caracteres · ${s.uso}`)
    return 0
  }
  if (!argv.includes('--ejecutar') || !['dev', 'prd'].includes(config)) { console.log('Uso: --seco | --ejecutar --config dev|prd [--proyecto zero-risk] [--rotar NOMBRE,NOMBRE]'); return 2 }
  return ejecutar({ proyecto, config, rotar }).ok ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('generar-secretos-grupo-c.mjs')) process.exit(main(process.argv.slice(2)))
