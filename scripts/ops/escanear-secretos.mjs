#!/usr/bin/env node
// ESCÁNER DE SECRETOS POR FORMA · una sola lista de patrones para el repo y para la bóveda (OneDrive), para que los dos barridos den lo mismo.
// (22-oct · pedido 4 de CC#3 tras hallar llaves vivas en 00-meta/credentials · lista de 18 patrones de CC#3 · apagado por omisión: NO es un hook ni un paso del CI.)
// NUNCA imprime el valor: solo archivo, línea, tipo y los últimos 4 caracteres.
//
// Uso: node scripts/ops/escanear-secretos.mjs --repo                  (archivos versionados del repo actual; falla con código 1 si encuentra)
//      node scripts/ops/escanear-secretos.mjs --boveda <carpeta>      (recorre toda la carpeta, p. ej. la bóveda; excluye .obsidian, node_modules, .git)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** tipo → patrón por FORMA (lista de CC#3). El lookbehind de `sk-` evita palabras como «task-…» (13 falsos positivos medidos). */
export const PATRONES = [
  { tipo: 'Cal.com', re: /cal_(live|test)_[A-Za-z0-9]{20,}/g },
  { tipo: 'Anthropic', re: /sk-ant-[A-Za-z0-9_-]{30,}/g },
  { tipo: 'OpenAI / Braintrust', re: /(?<![A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{40,}/g },
  { tipo: 'JWT (Supabase / n8n)', re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { tipo: 'Slack (token)', re: /xox[abprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}/g },
  { tipo: 'Slack (webhook)', re: /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g },
  { tipo: 'Meta', re: /\bEAA[A-Za-z0-9]{80,}/g },
  { tipo: 'Apify', re: /apify_api_[A-Za-z0-9]{20,}/g },
  { tipo: 'Supabase (sb_)', re: /sb_(secret|publishable)_[A-Za-z0-9_-]{20,}/g },
  { tipo: 'Supabase (sbp_)', re: /sbp_[a-f0-9]{30,}/g },
  { tipo: 'GitHub', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { tipo: 'Healthchecks', re: /hc[rw]_[A-Za-z0-9]{20,}/g },
  { tipo: 'Google OAuth (secreto de cliente)', re: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
  { tipo: 'Google API', re: /AIza[0-9A-Za-z_-]{35}/g },
  { tipo: 'Doppler', re: /dp\.(st|pt|sa)\.[A-Za-z0-9]{20,}/g },
  { tipo: 'Vercel', re: /vcp_[A-Za-z0-9]{20,}/g },
  { tipo: 'AWS', re: /AKIA[0-9A-Z]{16}/g },
  { tipo: 'Postgres (URL con clave)', re: /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/<>[\]{}$]{6,}@/g },
]

/** por CONTEXTO (no por forma) */
const FICHA_DE_PROVEEDOR = /(auth token|recovery code|token)\s*\|[^`\n]*`([A-Za-z0-9_+/=.-]{16,})`/i
/** un nombre de variable (SLACK_BOT_TOKEN) o un valor sin ningún dígito no es un secreto aunque esté en la fila de token */
const pareceNombre = (v) => /^[A-Z][A-Z0-9_]*$/.test(v) || !/\d/.test(v)
const HEX_LARGO = /\b[a-f0-9]{32,}\b/gi
/** el Account SID de Twilio («AC» + 32 hex) es un identificador, no el secreto (CC#3, 22-oct) */
const ES_SID_DE_TWILIO = /^AC[a-f0-9]{32}$/i
export const CARPETA_DE_FICHAS = '00-meta/credentials/'

export const EXCLUIDAS = new Set(['.obsidian', 'node_modules', '.git'])
const TAMANO_MAXIMO = 6_000_000

/** valores de mentira o marcadores: no son secretos (`<REDACTADO>`, XXXX, puntos suspensivos, ejemplos conocidos) */
export const esDeMentira = (v) => /x{4,}|\.{3}|…|abcd|ghij|example|fake|dummy|<redactado>/i.test(v)

const fin4 = (v) => v.slice(-4)

/** texto → hallazgos { linea, tipo, fin }. Nunca devuelve el valor completo. `ruta` decide si aplica el hex largo (solo en la carpeta de fichas). */
export function escanearTexto(texto, { ruta = '' } = {}) {
  const hallazgos = []
  const enFichas = ruta.replace(/\\/g, '/').includes(CARPETA_DE_FICHAS)
  texto.split(/\r?\n/).forEach((linea, i) => {
    const n = i + 1
    for (const { tipo, re } of PATRONES) {
      for (const m of linea.matchAll(re)) if (!esDeMentira(m[0])) hallazgos.push({ linea: n, tipo, fin: fin4(m[0]) })
    }
    const f = linea.match(FICHA_DE_PROVEEDOR)
    if (f && !esDeMentira(f[2]) && !pareceNombre(f[2])) hallazgos.push({ linea: n, tipo: 'ficha de proveedor (valor en la fila de token)', fin: fin4(f[2]) })
    if (enFichas) {
      for (const m of linea.matchAll(HEX_LARGO)) if (!esDeMentira(m[0]) && !ES_SID_DE_TWILIO.test(m[0])) hallazgos.push({ linea: n, tipo: 'hex largo en carpeta de fichas', fin: fin4(m[0]) })
    }
  })
  return hallazgos
}

export function escanearArchivo(ruta, { lee = (p) => fs.readFileSync(p, 'latin1') } = {}) {
  let texto
  try { texto = lee(ruta) } catch { return [] }
  return escanearTexto(texto, { ruta }).map((h) => ({ archivo: ruta, ...h }))
}

function* recorrer(raiz, { lista = (d) => fs.readdirSync(d, { withFileTypes: true }), tamano = (p) => fs.statSync(p).size } = {}) {
  let entradas
  try { entradas = lista(raiz) } catch { return }
  for (const e of entradas) {
    const p = path.join(raiz, e.name)
    if (e.isDirectory()) { if (!EXCLUIDAS.has(e.name)) yield* recorrer(p, { lista, tamano }) }
    else { try { if (tamano(p) <= TAMANO_MAXIMO) yield p } catch { /* ilegible: se salta */ } }
  }
}

export function escanearCarpeta(raiz, opts = {}) {
  const hallazgos = []
  let archivos = 0
  for (const p of recorrer(raiz, opts)) { archivos++; hallazgos.push(...escanearArchivo(p, opts)) }
  return { archivos, hallazgos }
}

export function archivosVersionados(raiz, run = spawnSync) {
  const r = run('git', ['-C', raiz, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) return null
  return r.stdout.split('\0').filter(Boolean).filter((f) => !f.split('/').some((parte) => EXCLUIDAS.has(parte))).map((f) => path.join(raiz, f))
}

/** una línea por hallazgo, sin el valor */
export const formatear = (h, base = '') => `${path.relative(base || '.', h.archivo).replace(/\\/g, '/')}:${h.linea} · ${h.tipo} · …${h.fin}`

export function ejecutar({ modo, carpeta, log = console.log, run = spawnSync } = {}) {
  let archivos = [], hallazgos = []
  if (modo === 'repo') {
    const lista = archivosVersionados(process.cwd(), run)
    if (!lista) { log('✖ no pude listar los archivos versionados (¿es un repositorio git?)'); return { ok: false, hallazgos: [] } }
    for (const p of lista) { if (!fs.existsSync(p) || fs.statSync(p).size > TAMANO_MAXIMO) continue; archivos.push(p); hallazgos.push(...escanearArchivo(p)) }
  } else if (modo === 'boveda') {
    if (!carpeta || !fs.existsSync(carpeta)) { log('✖ falta la carpeta (--boveda <carpeta>)'); return { ok: false, hallazgos: [] } }
    const r = escanearCarpeta(carpeta)
    archivos = new Array(r.archivos); hallazgos = r.hallazgos
  } else { log('Uso: --repo | --boveda <carpeta>'); return { ok: false, hallazgos: [] } }
  for (const h of hallazgos) log(formatear(h, modo === 'boveda' ? carpeta : process.cwd()))
  log(`${archivos.length} archivos revisados · ${hallazgos.length} hallazgos`)
  return { ok: hallazgos.length === 0, hallazgos }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2)
  const modo = a.includes('--repo') ? 'repo' : a.includes('--boveda') ? 'boveda' : null
  const r = ejecutar({ modo, carpeta: modo === 'boveda' ? a[a.indexOf('--boveda') + 1] : null })
  process.exit(r.ok ? 0 : 1)
}
