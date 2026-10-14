#!/usr/bin/env node
// F0 · INSTALAR LAS IDENTIDADES DE LA OFICINA FINANCIERA (CC#1 · 2026-10-14 · rev. 9) · diseño v2 rev. 9 §3 y §10.
// 🔴 ESTE GUION ES NUEVO: NO es «la vía oficial». `scripts/sync-agent-content.ts` solo ACTUALIZA filas que ya existen; no hay ninguna vía que CREE filas. Por eso este guion existe y lo dice.
//    Usa el texto del repo canónico (`msitarzewski/agency-agents`) TAL CUAL, leído de `src/agents/identities/<nombre>.md`, con su huella sha256 fija; nada a mano.
//    Después de instalar, el script oficial de sincronización las salta (ya tienen contenido): sin choque.
//   node scripts/ops/instalar-identidades-finanzas.mjs                       → SECO (por omisión): dice qué haría y no escribe nada
//   node scripts/ops/instalar-identidades-finanzas.mjs --aplicar --confirmo-cc3 AAAA-MM-DD   → inserta las filas FALTANTES, INACTIVAS (la activación es un acto aparte con firma)
// 🔴 NO se aplica sin el «SÍ» de CC#3: la fecha debe ser REAL (calendario), no futura y no anterior al 2026-10-14. Solo INSERTA (nunca actualiza), siempre `is_active:false` / `status:'inactive'`,
//    y NUNCA toca `finance-financial-analyst` (fase 2).
// 🔴 `paid-media-ppc-strategist` y `paid-media-tracking-specialist` YA están instalados con otro nombre (`paid_media_ppc_strategist`, `tracking-specialist`): NO se duplican.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const PRIMER_DIA = '2026-10-14'
export const IDENTIDADES = [
  { nombre: 'finance-fpa-analyst', ruta_en_el_repo: 'finance/finance-fpa-analyst.md', sha256: '5fa9137c80e0b91fbe62815e7981d7b6a2ca5bafe43013c56d1b847a3c963141' },
  { nombre: 'chief-financial-officer', ruta_en_el_repo: 'specialized/chief-financial-officer.md', sha256: '05efa4015fc7feac9bb41942fa6e9eb2b79e2219bf1280b290c754fd16e15a08' },
]
/** nunca se tocan */
export const INTOCABLES = ['finance-financial-analyst']
/** el que sirve de forma para departamento, rol y fase (está instalado e inactivo desde el 12-oct) */
export const FILA_DE_REFERENCIA = 'finance-financial-analyst'
export const huella = (texto) => crypto.createHash('sha256').update(String(texto).replace(/\r\n/g, '\n')).digest('hex')

export function leerIdentidad(nombre, dir = path.join(aqui, '..', '..', 'src', 'agents', 'identities')) {
  const p = path.join(dir, nombre + '.md')
  if (!fs.existsSync(p)) throw new Error(`no existe el archivo de identidad: ${p}`)
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
}
export const nombreDelFrente = (texto) => (/^name:\s*(.+)$/m.exec(texto) || [])[1]?.trim() ?? null

/**
 * La fecha del «SÍ» de CC#3: AAAA-MM-DD REAL (rechaza 2026-02-30, mes 13, 2026-10-1, con hora), no futura contra el reloj inyectado y no anterior al primer día de la construcción.
 * `{ valor }` o `{ error }`.
 */
export function leerFechaConfirmada(crudo, ahora) {
  if (typeof crudo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(crudo)) return { error: '--confirmo-cc3 pide una fecha AAAA-MM-DD' }
  const t = new Date(crudo + 'T00:00:00Z')
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== crudo) return { error: `la fecha ${crudo} no existe en el calendario` }
  if (crudo < PRIMER_DIA) return { error: `la fecha ${crudo} es anterior a la construcción (${PRIMER_DIA})` }
  const hoy = new Date(ahora).toISOString().slice(0, 10)
  if (crudo > hoy) return { error: `la fecha ${crudo} es futura (hoy es ${hoy})` }
  return { valor: crudo }
}

/**
 * Pura: dado lo que ya hay (`existentes`: nombres), la fila de referencia y los textos, dice qué filas se insertarían y cuáles se omiten.
 * Se niega si un texto no coincide con la huella del repo canónico (alguien lo editó a mano).
 */
export function planDeInstalacion({ existentes, referencia, textos }) {
  const inserciones = [], omitidas = [], errores = []
  for (const id of IDENTIDADES) {
    if (INTOCABLES.includes(id.nombre)) { errores.push(`«${id.nombre}» es intocable`); continue }
    const texto = textos[id.nombre]
    if (typeof texto !== 'string' || !texto.trim()) { errores.push(`falta el texto de «${id.nombre}»`); continue }
    if (huella(texto) !== id.sha256) { errores.push(`«${id.nombre}»: el texto no coincide con el del repo canónico (huella distinta); no se instala nada a mano`); continue }
    if (existentes.includes(id.nombre)) { omitidas.push({ nombre: id.nombre, motivo: 'ya está en agents (no se actualiza)' }); continue }
    inserciones.push({
      name: id.nombre,
      display_name: nombreDelFrente(texto) ?? id.nombre,
      role: referencia?.role ?? 'empleado',
      department_id: referencia?.department_id ?? null,
      // la convención de las filas ya instaladas: `canonical:<repo>@<rama>:<ruta> · <quién y cuándo>`
      identity_source: `canonical:msitarzewski/agency-agents@main:${id.ruta_en_el_repo} · instalada por CC#1 con instalar-identidades-finanzas.mjs · 2026-10-14`,
      identity_content: texto,
      model: 'claude-sonnet',
      status: 'inactive',
      is_active: false,
      phase: referencia?.phase ?? null,
    })
  }
  return { inserciones, omitidas, errores }
}

/**
 * El guion entero, con TODO lo del mundo inyectado (base, reloj, archivos): sin `--aplicar` no escribe NUNCA; con `--aplicar` exige la fecha real y no futura.
 * `d` = { fetch, ahora(): Date, base: { url, llave }, leer(nombre): string, log(...) }. Devuelve el código de salida.
 */
export async function ejecutar(argv, d) {
  const log = d.log ?? (() => {})
  const aplicar = argv.includes('--aplicar')
  if (aplicar) {
    const i = argv.indexOf('--confirmo-cc3')
    const f = leerFechaConfirmada(i >= 0 ? argv[i + 1] : null, d.ahora())
    if (f.error) { log('se detiene: --aplicar exige --confirmo-cc3 AAAA-MM-DD (el «SÍ» de CC#3): ' + f.error); return 3 }
  }
  if (!d.base?.url || !d.base?.llave) { log('faltan las variables de la base'); return 2 }
  const H = { apikey: d.base.llave, Authorization: 'Bearer ' + d.base.llave, 'content-type': 'application/json' }
  const nombres = IDENTIDADES.map((x) => x.nombre).concat(FILA_DE_REFERENCIA)
  const r = await d.fetch(`${d.base.url}/rest/v1/agents?select=name,role,department_id,phase&name=in.(${nombres.join(',')})`, { headers: H })
  const filas = await r.json()
  if (!Array.isArray(filas)) { log('no se pudo leer agents'); return 4 }
  const textos = Object.fromEntries(IDENTIDADES.map((x) => [x.nombre, d.leer(x.nombre)]))
  const plan = planDeInstalacion({ existentes: filas.map((f) => f.name), referencia: filas.find((f) => f.name === FILA_DE_REFERENCIA) ?? null, textos })
  for (const e of plan.errores) log('✗ ' + e)
  for (const o of plan.omitidas) log('= ' + o.nombre + ' · ' + o.motivo)
  for (const x of plan.inserciones) log((aplicar ? '+ inserta ' : '· (seco) insertaría ') + x.name + ` · ${x.identity_content.length} car. · inactiva`)
  if (plan.errores.length) return 5
  if (!aplicar) { log('seco: no se escribió nada'); return 0 }
  for (const x of plan.inserciones) {
    const w = await d.fetch(`${d.base.url}/rest/v1/agents`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(x) })
    log((w.ok ? '✓ insertada ' : `✗ ${w.status} `) + x.name)
    if (!w.ok) return 6
  }
  return 0
}

function entornoDe(argv) {
  const envArg = argv.find((x) => x.startsWith('--env='))
  const ruta = envArg ? envArg.slice(6) : path.join(aqui, '..', '..', '.env.local')
  const env = Object.fromEntries(fs.readFileSync(ruta, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
  return { url: (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), llave: env.SUPABASE_SERVICE_ROLE_KEY }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2)
  ejecutar(argv, { fetch, ahora: () => new Date(), base: entornoDe(argv), leer: (n) => leerIdentidad(n), log: (...a) => console.log(...a) }).then((c) => process.exit(c))
}
