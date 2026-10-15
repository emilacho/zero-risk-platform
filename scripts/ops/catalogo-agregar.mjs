#!/usr/bin/env node
/**
 * PLAN v3 · V12 · `catalogo-agregar` · CC#2 · 15-oct · da de alta UNA fila del catálogo del plan (`plan_catalogo_*`). SIN `--aplicar` solo valida e IMPRIME. Nunca imprime una llave.
 *
 *   node scripts/ops/catalogo-agregar.mjs plan     --tabla <fuentes|tipos|reglas|lexico|topes> --archivo <fila.json> [--sin-red]
 *   node scripts/ops/catalogo-agregar.mjs agregar  --tabla <…> --archivo <fila.json> [--pais EC] [--salida <carpeta>] --aplicar
 *   node scripts/ops/catalogo-agregar.mjs revertir --tabla <…> --clave <id> --version <n> [--salida <carpeta>] --aplicar      vuelve a marcar vigente la versión n (reversa del alta)
 *
 * Qué hace `agregar --aplicar`: (1) valida (columnas, tipos, operador del catálogo cerrado, fuente/tipo referenciado existe); (2) RESPALDA todas las versiones de esa clave a <salida>;
 * (3) inserta `version = max + 1` como NO vigente; (4) marca la anterior no vigente y la nueva vigente; (5) lee de vuelta y compara. NUNCA edita una fila en sitio (solo voltea `vigente`).
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (en `plan`, con `--sin-red` no hacen falta; las referencias no se comprueban y se dice).
 * Si la tabla no existe (V1 sin aplicar) termina con 3 y lo dice: no inventa nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { TABLAS, validarAlta, filaNueva } from './catalogo-agregar/nucleo.mjs'

const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const sinRed = A.includes('--sin-red')
const tipoDeTabla = flag('tabla')
const SALIDA = flag('salida') || `_respaldos/catalogo-${new Date().toISOString().replace(/[:.]/g, '-')}`
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
// Windows: `process.exit()` con una petición viva aborta el proceso (libuv) y devuelve 0xC0000409; se sale por excepción y `process.exitCode`.
class Salida extends Error { constructor(cod, msg) { super(msg ?? ''); this.cod = cod } }
const salir = (cod, msg) => { if (msg) console.error(msg); throw new Salida(cod, msg) }

async function leer(tabla, q) {
  const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: H() })
  const txt = await r.text()
  if (r.status === 404 || /PGRST205|does not exist/.test(txt)) salir(3, `la tabla ${tabla} no existe (V1 sin aplicar): no se escribe nada`)
  if (!r.ok) salir(1, `leer ${tabla}: HTTP ${r.status} ${txt.slice(0, 200)}`)
  return JSON.parse(txt)
}
async function parchar(tabla, filtro, cuerpo) {
  const r = await fetch(`${U}/rest/v1/${tabla}?${filtro}`, { method: 'PATCH', headers: { ...H(), prefer: 'return=representation' }, body: JSON.stringify(cuerpo) })
  if (!r.ok) throw new Error(`PATCH ${tabla}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
async function insertar(tabla, fila) {
  const r = await fetch(`${U}/rest/v1/${tabla}`, { method: 'POST', headers: { ...H(), prefer: 'return=representation' }, body: JSON.stringify(fila) })
  if (!r.ok) throw new Error(`INSERT ${tabla}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json())[0]
}
async function existe(tipo, columna, valor) {
  const T = TABLAS[tipo]
  const f = await leer(T.tabla, `${columna}=eq.${encodeURIComponent(valor)}&vigente=eq.true&select=${columna}&limit=1`)
  return Array.isArray(f) && f.length > 0
}
function guardar(nombre, obj) { fs.mkdirSync(SALIDA, { recursive: true }); const p = path.join(SALIDA, nombre); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); return p }

async function main() {
if (!['plan', 'agregar', 'revertir'].includes(orden)) salir(2, 'orden: plan | agregar | revertir (ver cabecera del guion)')
const T = TABLAS[tipoDeTabla]
if (!T) salir(2, `--tabla debe ser una de: ${Object.keys(TABLAS).join(', ')}`)
const hayRed = !!(U && SK) && !sinRed
if (orden !== 'plan' && !hayRed) salir(2, 'faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

if (orden === 'revertir') {
  const clave = flag('clave'), version = Number(flag('version'))
  if (!clave || !Number.isInteger(version)) salir(2, '--clave y --version (entero) son obligatorias')
  const filas = await leer(T.tabla, `${T.clave}=eq.${encodeURIComponent(clave)}&select=*&order=version.asc`)
  if (!filas.some((f) => f.version === version)) salir(1, `no existe ${clave} v${version}`)
  console.log(`revertir ${T.tabla} ${clave}: vigente pasa a v${version} (hoy: ${filas.filter((f) => f.vigente).map((f) => 'v' + f.version).join(', ') || 'ninguna'})`)
  if (!aplicar) { console.log('(sin --aplicar: no se escribió nada)'); throw new Salida(0) }
  console.log('respaldo:', guardar(`respaldo-${T.tabla}-${clave}.json`, filas))
  await parchar(T.tabla, `${T.clave}=eq.${encodeURIComponent(clave)}&vigente=eq.true`, { vigente: false })
  const ok = await parchar(T.tabla, `${T.clave}=eq.${encodeURIComponent(clave)}&version=eq.${version}`, { vigente: true })
  console.log(ok.length === 1 ? `listo: ${clave} v${version} vigente` : 'ATENCIÓN: no se pudo marcar la versión; revisar el respaldo')
  throw new Salida(ok.length === 1 ? 0 : 1)
}

// plan | agregar
const archivo = flag('archivo')
if (!archivo) salir(2, '--archivo <fila.json> es obligatorio')
let fila
try { fila = JSON.parse(fs.readFileSync(archivo, 'utf8')) } catch (e) { salir(2, `no se pudo leer ${archivo}: ${e.message}`) }

// las referencias se comprueban de verdad solo con red; sin red se dice
const cache = new Map()
const refs = []
const existeAsync = (tipo, columna, valor) => { refs.push([tipo, columna, valor]); return true }
let v = validarAlta(tipoDeTabla, fila, existeAsync)
if (v.ok && hayRed) {
  const malas = []
  for (const [tipo, columna, valor] of refs) {
    const k = `${tipo}:${valor}`
    if (!cache.has(k)) cache.set(k, await existe(tipo, columna, valor))
    if (!cache.get(k)) malas.push(`${tipo === 'fuentes' ? 'la fuente' : 'el tipo'} «${valor}» no existe en el catálogo vigente`)
  }
  if (malas.length) v = { ok: false, errores: malas }
}
if (!v.ok) { console.error('ALTA INVÁLIDA:\n - ' + v.errores.join('\n - ')); throw new Salida(1) }
console.log(`alta válida en ${T.tabla} (${T.clave} = ${v.fila[T.clave]})` + (hayRed ? '' : ' · SIN RED: las referencias a fuentes/tipos NO se comprobaron'))
if (orden === 'plan') throw new Salida(0)

const previas = await leer(T.tabla, `${T.clave}=eq.${encodeURIComponent(v.fila[T.clave])}&select=*&order=version.asc`)
const nueva = filaNueva(v.fila, previas.map((f) => f.version), { pais: flag('pais') })
console.log(`se insertará v${nueva.version} (versiones previas: ${previas.map((f) => 'v' + f.version + (f.vigente ? '*' : '')).join(', ') || 'ninguna'})`)
if (!aplicar) { console.log('(sin --aplicar: no se escribió nada)'); throw new Salida(0) }
console.log('respaldo:', guardar(`respaldo-${T.tabla}-${v.fila[T.clave]}.json`, previas))
const creada = await insertar(T.tabla, nueva)
await parchar(T.tabla, `${T.clave}=eq.${encodeURIComponent(v.fila[T.clave])}&vigente=eq.true&version=neq.${nueva.version}`, { vigente: false })
const vigente = await parchar(T.tabla, `${T.clave}=eq.${encodeURIComponent(v.fila[T.clave])}&version=eq.${nueva.version}`, { vigente: true })
const despues = await leer(T.tabla, `${T.clave}=eq.${encodeURIComponent(v.fila[T.clave])}&select=*&order=version.asc`)
guardar(`despues-${T.tabla}-${v.fila[T.clave]}.json`, despues)
const unaVigente = despues.filter((f) => f.vigente).length === 1 && despues.find((f) => f.vigente)?.version === nueva.version
console.log(unaVigente && creada && vigente.length === 1 ? `listo: ${v.fila[T.clave]} v${nueva.version} vigente (la anterior queda como respaldo y reversa)` : 'ATENCIÓN: la lectura de vuelta no cuadra; revisar el respaldo y usar `revertir`')
throw new Salida(unaVigente ? 0 : 1)
}
main().catch((e) => { if (e instanceof Salida) { process.exitCode = e.cod; return } console.error(String(e && e.message ? e.message : e)); process.exitCode = 1 })
