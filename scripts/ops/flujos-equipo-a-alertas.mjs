#!/usr/bin/env node
// LOS FLUJOS QUE USABAN EL WEBHOOK DE #equipo (que ya no existe) → o son una ALARMA REAL (van a #alertas) o son RUTINA (sin Slack).
// (22-oct · firma Emilio 12:46 · ENCARGO de Lenovo a CC#2.) Regla de «menos ruido»: a Emilio solo le llega una alarma real; lo rutinario queda sin Slack.
//
//   node scripts/ops/flujos-equipo-a-alertas.mjs --seco                                  (por omisión: qué haría con cada flujo VIVO; sin valores)
//   node scripts/ops/flujos-equipo-a-alertas.mjs --aplicar --respaldos <carpeta FUERA de la bóveda>    (respaldo exacto, PUT, re-registro del horario, lectura de vuelta)
//   reversa por flujo: node scripts/ops/n8n-flujo.mjs restaurar <id> <respaldo.json> --ejecutar
//
// Tres acciones sobre el nodo de Slack de cada flujo:
//   · rutina → el nodo se DESACTIVA (n8n deja pasar los datos por él): el flujo sigue igual, sin mensaje.
//   · alarma → su dirección pasa a `$env.SLACK_WEBHOOK_URL` (el webhook de #alertas).
//   · mixto  → una pregunta delante («¿es una falla?»): solo la falla va a #alertas; el éxito no manda nada.
// En los tres casos se quita `SLACK_WEBHOOK_URL_EQUIPO` y cualquier dirección de Slack pegada como «respaldo» dentro de la expresión.
// NO se tocan: los flujos «TEMPORAL» ni la copia inactiva de referencia (ids en INTOCABLES).
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const VARIABLE_VIEJA = 'SLACK_WEBHOOK_URL_EQUIPO'
export const VARIABLE_NUEVA = 'SLACK_WEBHOOK_URL'

/** id del flujo → qué hacer. `nodos: 'todos'` = todos los nodos que usan la variable vieja. */
export const PLAN = {
  Dz2n5bA3yW89I2Ye: { accion: 'rutina', nodos: 'todos', porque: 'aviso de «cascada de landing completa» (éxito)' },
  LyVoKcrypS5uLyuu: { accion: 'rutina', nodos: 'todos', porque: 'aviso «ONBOARDING INITIATED» (informativo)' },
  wu1DUAXIuEG5nNTX: { accion: 'rutina', nodos: 'todos', porque: 'aviso «ONBOARDING INITIATED» (informativo)' },
  GwVId15UjYxqSn0Q: { accion: 'alarma', nodos: 'todos', porque: 'cambio de estado de un monitor de UptimeRobot (caída/recuperación; ya avisa solo al cambiar)' },
  rXR5GmnrGF6Dkwgq: { accion: 'alarma', nodos: 'todos', porque: 'un documento no llegó a Drive' },
  XTQTgIUMq9OHNs0a: { accion: 'alarma', nodos: 'todos', porque: 'el manual no llegó a Drive' },
  uw5Dri5S1XtcsKGm: { accion: 'alarma', nodos: 'todos', porque: 'aviso de gasto sobre el umbral (ya tiene tiempo de espera entre avisos)' },
  X9F0zp6LQ2xGEYVS: { accion: 'alarma', nodos: 'todos', porque: 'plan sin PDF / revisión incompleta' },
  VHmEAgsBhRd5ymgM: { accion: 'mixto', nodos: 'todos', porque: 'respaldo semanal: solo la FALLA es alarma', condicion: "={{ $('Execute pg_dump').first().json.success !== true }}" },
  aTLEk64o1BFAindd: { accion: 'mixto', nodos: 'todos', porque: 'propuesta del agente: solo «no se guardó nada» es alarma', condicion: '={{ !$json.guardado }}' },
}
export const INTOCABLES = ['dtsJGZatzPjM1NPU', 'lFwgt73lB8yF843g', 'pLp0vo7mye8lGM74', 'qkxIhqcW22tFkuCf', 'ogtweEUvFDPamrKX']

const usa = (n) => JSON.stringify(n).includes(VARIABLE_VIEJA)
const NUEVA = `$env.${VARIABLE_NUEVA}`

/** quita la variable vieja y las direcciones de Slack pegadas dentro de una expresión de texto */
export function limpiarExpresion(t) {
  if (typeof t !== 'string') return t
  return t
    .replace(/\s*\|\|\s*(['"`])https:\/\/hooks\.slack\.com\/services\/[^'"`\s]+\1/g, '')               // «|| 'https://hooks.slack.com/…'» pegado
    .replace(new RegExp(`\\$env\\.${VARIABLE_NUEVA}\\s*\\|\\|\\s*\\$env\\.${VARIABLE_VIEJA}`, 'g'), NUEVA)   // «NUEVA || VIEJA» → «NUEVA»
    .replace(new RegExp(`\\$env\\.${VARIABLE_VIEJA}\\s*\\|\\|\\s*\\$env\\.${VARIABLE_NUEVA}`, 'g'), NUEVA)
    .replace(new RegExp(`\\$env\\.${VARIABLE_VIEJA}`, 'g'), NUEVA)                                      // «VIEJA» → «NUEVA»
}
const recorre = (o) => (typeof o === 'string' ? limpiarExpresion(o) : Array.isArray(o) ? o.map(recorre) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recorre(v)])) : o)

/** inserta una pregunta delante del nodo: solo si la condición se cumple pasa al nodo (la rama «no» no va a ninguna parte) */
export function insertarPregunta(flujo, nodoNombre, condicion) {
  const nodo = flujo.nodes.find((n) => n.name === nodoNombre)
  const nombre = '¿Es una falla? · solo eso va a #alertas'
  const pos = Array.isArray(nodo.position) ? [nodo.position[0] - 200, nodo.position[1]] : [0, 0]
  const pregunta = { id: randomUUID(), name: nombre, type: 'n8n-nodes-base.if', typeVersion: 1, position: pos, parameters: { conditions: { boolean: [{ value1: condicion, value2: true }] } } }
  const conexiones = JSON.parse(JSON.stringify(flujo.connections))
  for (const de of Object.values(conexiones)) for (const ramas of Object.values(de)) for (const rama of ramas) for (const c of rama || []) if (c.node === nodoNombre) c.node = nombre
  conexiones[nombre] = { main: [[{ node: nodoNombre, type: 'main', index: 0 }], []] }
  return { ...flujo, nodes: [...flujo.nodes, pregunta], connections: conexiones }
}

/** aplica el plan a un flujo; devuelve el flujo nuevo y un resumen. No muta el original. */
export function transformar(flujo, regla) {
  let f = JSON.parse(JSON.stringify(flujo))
  const afectados = f.nodes.filter((n) => usa(n)).map((n) => n.name)
  const resumen = { accion: regla.accion, nodos: afectados, quedan: /** @type {number | string} */ (0) }
  f.nodes = f.nodes.map((n) => {
    if (!afectados.includes(n.name)) return n
    const nuevo = { ...n, parameters: recorre(n.parameters) }
    if (regla.accion === 'rutina') nuevo.disabled = true
    return nuevo
  })
  if (regla.accion === 'mixto') for (const nombre of afectados) f = insertarPregunta(f, nombre, regla.condicion)
  // solo lo que se envía a n8n (la API también devuelve una copia «publicada» del flujo que se renueva al reactivar)
  const cuerpo = JSON.stringify({ name: f.name, nodes: f.nodes, connections: f.connections, settings: f.settings })
  resumen.quedan = cuerpo.includes(VARIABLE_VIEJA) || /hooks\.slack\.com\/services\//.test(cuerpo) ? 'queda texto de Slack viejo' : 0
  return { flujo: f, resumen }
}

async function main(argv) {
  const aplicar = argv.includes('--aplicar')
  const i = argv.indexOf('--respaldos'); const carpeta = i >= 0 ? argv[i + 1] : null
  const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
  const E = (k) => process.env[k] ?? (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')   // con `doppler run --` sale de Doppler; el .env.local queda de respaldo
  const BASE = E('N8N_BASE_URL').replace(/\/$/, ''), K = E('N8N_API_KEY')
  if (aplicar && (!carpeta || /zr-vault|OneDrive/i.test(carpeta))) { console.error('--aplicar exige --respaldos <carpeta> FUERA de la bóveda'); return 2 }
  const api = async (m, p, body) => { const r = await fetch(`${BASE}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': K, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 160)}`); return JSON.parse(t) }
  if (aplicar && ((await api('GET', '/executions?status=running&limit=20')).data ?? []).length) { console.error('hay ejecuciones corriendo; no se toca nada ahora'); return 3 }
  let ok = true
  for (const [id, regla] of Object.entries(PLAN)) {
    if (INTOCABLES.includes(id)) continue
    const vivo = await api('GET', `/workflows/${id}`)
    if (!usa(vivo)) { console.log(`${id} «${vivo.name}»: ya no usa ${VARIABLE_VIEJA} (nada que hacer)`); continue }
    const { flujo, resumen } = transformar(vivo, regla)
    console.log(`${id} «${vivo.name}» [${regla.accion}]: ${resumen.nodos.length} nodo(s) · ${regla.porque} · quedan viejos: ${resumen.quedan}`)
    if (resumen.quedan) { ok = false; continue }
    if (!aplicar) continue
    fs.mkdirSync(carpeta, { recursive: true })
    const archivo = path.join(carpeta, `${id}-antes-equipo.json`); fs.writeFileSync(archivo, JSON.stringify(vivo))
    const { name, nodes, connections, settings } = flujo
    await api('PUT', `/workflows/${id}`, { name, nodes, connections, settings })
    if (vivo.active) { await api('POST', `/workflows/${id}/deactivate`); await api('POST', `/workflows/${id}/activate`) }
    const despues = await api('GET', `/workflows/${id}`)
    const queda = JSON.stringify(despues).includes(VARIABLE_VIEJA) || /hooks\.slack\.com\/services\//.test(JSON.stringify(despues))
    console.log(`   ${queda ? '✖ todavía hay texto viejo' : '✔ leído de vuelta limpio'} · activo=${despues.active} · respaldo ${archivo}`)
    if (queda || despues.active !== vivo.active) ok = false
  }
  return ok ? 0 : 1
}

if (process.argv[1]?.endsWith('flujos-equipo-a-alertas.mjs')) main(process.argv.slice(2)).then((c) => setTimeout(() => process.exit(c), 100))
