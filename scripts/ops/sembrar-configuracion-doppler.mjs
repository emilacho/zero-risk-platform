#!/usr/bin/env node
// SEMBRAR EN DOPPLER LA CONFIGURACIÓN NO SECRETA de zero-risk-platform (URLs, ids, banderas) leyéndola de las variables de Vercel que NO son sensibles.
// (22-oct · GO de Lenovo, paso 1 del plan del sync Doppler → Vercel.) Los SECRETOS nunca pasan por aquí: ni los que Vercel marca «sensitive» (la API no los devuelve),
// ni los que por NOMBRE o por FORMA parecen una llave. Lo dudoso NO se siembra: se lista por nombre para decidirlo a mano.
//
//   node scripts/ops/sembrar-configuracion-doppler.mjs --seco        (por omisión: qué sembraría y qué descarta, sin valores)
//   node scripts/ops/sembrar-configuracion-doppler.mjs --ejecutar    (escribe en Doppler zero-risk/prd por la entrada estándar, sin pisar lo que ya existe)
// Nunca imprime un valor. Los escribe «unmasked» (visibles en el panel): son configuración, y Vercel exige que las `NEXT_PUBLIC_*` lo sean.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ejecutarDoppler } from './generar-secretos-grupo-c.mjs'

export const DESTINO = { proyecto: 'zero-risk', config: 'prd' }
export const PROYECTO_VERCEL = 'prj_UNusLHZNj5vOVrvCEHcRL8EUms2i'     // zero-risk-platform
/** nombre → { referencia } para valores que se espejan sin copiarlos a mano */
export const REFERENCIAS = { APIFY_API_TOKEN: '${APIFY_TOKEN}' }

/** nombres que por sí solos indican un secreto */
export const RE_NOMBRE_SECRETO = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DSN|HMAC|SIGNING|WEBHOOK_URL|AUTH)(?![A-Z]*_(?:URL|ID|ENABLED|MODE)$)|_PASS$|^SLACK_|BEARER/i
/** formas de valor que parecen una llave o llevan credenciales */
export const RE_VALOR_SECRETO = [/^sk-/i, /^xox[a-z]-/i, /^eyJ[A-Za-z0-9_-]{15,}/, /^ghp_/, /^apify_api_/, /^[A-Za-z0-9+/_-]{32,}={0,2}$/, /^[0-9a-f]{32,}$/i, /Bearer\s+\S{12,}/i, /:\/\/[^/\s:@]+:[^/\s@]+@/, /[?&](key|token|secret|apikey|api_key|password)=/i, /hooks\.slack\.com\/services\//]

/** direcciones de base de datos: llevan la contraseña dentro, aunque el nombre termine en _URL */
export const RE_NOMBRE_BASE_DE_DATOS = /DB_URL|DATABASE_URL|POSTGRES|CONNECTION_STRING|DB_PASS/i
export function pareceSecretoPorNombre(nombre) { return RE_NOMBRE_SECRETO.test(nombre) || RE_NOMBRE_BASE_DE_DATOS.test(nombre) }
export function pareceSecretoPorValor(valor) { return typeof valor !== 'string' || RE_VALOR_SECRETO.some((re) => re.test(valor.trim())) }

/** decide qué hacer con cada variable de Vercel. `variables`: [{ key, type, target[], value? }], `enDoppler`: nombres que ya existen allí */
export function planear(variables, enDoppler) {
  const ya = new Set(enDoppler)
  const porNombre = new Map()
  for (const v of variables) { const l = porNombre.get(v.key) ?? []; l.push(v); porNombre.set(v.key, l) }
  const sembrar = [], descartadas = []
  for (const [nombre, lista] of porNombre) {
    const motivo = (m) => descartadas.push({ nombre, motivo: m })
    if (ya.has(nombre)) { motivo('ya existe en Doppler'); continue }
    if (REFERENCIAS[nombre]) continue                                            // se trata aparte (referencia)
    if (lista.every((v) => v.type === 'sensitive')) { motivo('sensible en Vercel (la API no devuelve su valor)'); continue }
    if (pareceSecretoPorNombre(nombre)) { motivo('el nombre parece un secreto'); continue }
    const prod = lista.find((v) => (v.target ?? []).includes('production') && v.type !== 'sensitive' && typeof v.value === 'string')
    if (!prod) { motivo('no hay valor legible en Producción'); continue }
    if (pareceSecretoPorValor(prod.value)) { motivo('el valor parece una llave o lleva credenciales'); continue }
    if (prod.value.length > 1500) { motivo('valor demasiado largo para ser configuración'); continue }
    sembrar.push({ nombre, valor: prod.value })
  }
  return { sembrar, descartadas }
}

async function main(argv) {
  const ejecutarYa = argv.includes('--ejecutar')
  const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
  const E = (k) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
  const token = E('VERCEL_TOKEN') || E('VERCEL_API_TOKEN')
  const r = await fetch(`https://api.vercel.com/v9/projects/${PROYECTO_VERCEL}/env?decrypt=true`, { headers: { authorization: 'Bearer ' + token } })
  if (!r.ok) { console.error('no pude leer las variables de Vercel:', r.status); return 2 }
  const variables = (await r.json()).envs ?? []
  const existentes = ejecutarDoppler(['secrets', '--only-names', '--json', '-p', DESTINO.proyecto, '-c', DESTINO.config])
  if (!existentes.ok) { console.error('no pude leer los nombres de Doppler:', existentes.error); return 2 }
  const enDoppler = Object.keys(JSON.parse(existentes.salida))
  // el listado de Vercel devuelve las variables «encrypted» CIFRADAS: el valor en claro se pide una por una, y SOLO de las que por nombre no parecen un secreto
  for (const v of variables) {
    if (v.type !== 'encrypted' || pareceSecretoPorNombre(v.key) || enDoppler.includes(v.key) || REFERENCIAS[v.key]) continue
    const d = await fetch(`https://api.vercel.com/v1/projects/${PROYECTO_VERCEL}/env/${v.id}`, { headers: { authorization: 'Bearer ' + token } })
    if (d.ok) { const j = await d.json(); if (typeof j.value === 'string') v.value = j.value }
  }
  const { sembrar, descartadas } = planear(variables, enDoppler)
  console.log(`Vercel zero-risk-platform: ${new Set(variables.map((v) => v.key)).size} nombres · a sembrar ${sembrar.length} · descartados ${descartadas.length}`)
  const por = {}; for (const d of descartadas) (por[d.motivo] ??= []).push(d.nombre)
  for (const [m, l] of Object.entries(por)) console.log(`  descartados (${m}) [${l.length}]: ${l.join(', ')}`)
  console.log(`  a sembrar [${sembrar.length}]: ${sembrar.map((s) => s.nombre).join(', ')}`)
  if (!ejecutarYa) { console.log('(seco: no se escribió nada)'); return 0 }
  let hechas = 0, fallos = 0
  for (const s of sembrar) {
    const w = ejecutarDoppler(['secrets', 'set', s.nombre, '--visibility', 'unmasked', '--silent', '-p', DESTINO.proyecto, '-c', DESTINO.config], { entrada: s.valor })
    if (w.ok) hechas++; else { fallos++; console.log(`  ✖ ${s.nombre}: ${w.error}`) }
  }
  for (const [nombre, ref] of Object.entries(REFERENCIAS)) {
    if (enDoppler.includes(nombre)) continue
    const w = ejecutarDoppler(['secrets', 'set', nombre, '--silent', '-p', DESTINO.proyecto, '-c', DESTINO.config], { entrada: ref })
    if (w.ok) { hechas++; console.log(`  ✔ ${nombre} = referencia ${ref}`) } else { fallos++; console.log(`  ✖ ${nombre}: ${w.error}`) }
  }
  console.log(`sembradas ${hechas} · fallos ${fallos}`)
  return fallos ? 1 : 0
}

if (process.argv[1]?.endsWith('sembrar-configuracion-doppler.mjs')) main(process.argv.slice(2)).then((c) => setTimeout(() => process.exit(c), 100))
