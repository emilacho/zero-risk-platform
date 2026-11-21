#!/usr/bin/env node
// AL TERMINAR LA ALTA, EL AGENTE PROPONE LO QUE FALTA DEL MANUAL (eslogan y demás campos vacíos) · NUNCA BLOQUEA.
// (30-oct · punto 2 del encargo «CEREBRO · tres arreglos de la alta» · regla de Emilio: «si no existe, puede inventar; pero no evita que proceda el flujo;
//  si no lo inventa o no lo encuentra, está bien; es más importante la fluidez; luego en el dashboard el humano puede agregar».)
//
// Qué hace: en «Alta · Segunda Fase» (wu1DUAXIuEG5nNTX), DESPUÉS de «Emit · journey_completed» (el cierre de la alta, ya emitido), cuelga UN nodo que
// llama al flujo «Manual · propuesta del agente» (aTLEk64o1BFAindd, webhook manual-proponer-campos; responde al recibir y trabaja solo).
// Por qué no bloquea (los tres cortes):
//   1. va DESPUÉS del cierre: el viaje ya quedó completado y avisado cuando este nodo corre; nada depende de él;
//   2. el nodo sigue en error (`onError: continueRegularOutput`), con tiempo límite corto y `neverError`: si el flujo de la propuesta no existe, está apagado,
//      se cuelga o responde 4xx/5xx, la ejecución termina igual en éxito; sin reintentos (no cobra dos veces);
//   3. en ensayo (`dry_run === true`) va al eco (`/api/dry-run/eco`) y no llama al agente.
// El flujo de la propuesta ya solo llena campos VACÍOS (o «PENDIENTE»), rotulados «[propuesta del agente — razón]»; si no encuentra o decide no proponer, no cambia nada.
//
//   node --env-file=.env.local scripts/ops/alta-propuesta-tras-cierre.mjs --seco                              (por omisión: qué cambiaría; no escribe)
//   node --env-file=.env.local scripts/ops/alta-propuesta-tras-cierre.mjs --aplicar --respaldos <carpeta FUERA de la bóveda>
//   reversa: node scripts/ops/n8n-flujo.mjs restaurar wu1DUAXIuEG5nNTX <carpeta>/wu1DUAXIuEG5nNTX-ANTES.json --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const FLUJO = 'wu1DUAXIuEG5nNTX'
export const NODO_CIERRE = '[MODELB] Phase-boundary Emit · journey_completed'
export const NODO_NUEVO = 'Manual · pedir propuesta del agente (no bloquea)'
export const WEBHOOK = 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/manual-proponer-campos'
const DATOS = "$('Datos del alta').first().json"

/** el nodo nuevo (puro) */
export function nodoPropuesta(posicion = [0, 0]) {
  return {
    id: randomUUID(),
    name: NODO_NUEVO,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    onError: 'continueRegularOutput',
    retryOnFail: false,
    position: posicion,
    notes: 'Al terminar la alta, pide al agente que proponga lo que falta del manual (eslogan y campos vacíos). NO bloquea: va después del cierre, sigue en error, sin reintentos y con tiempo corto. En ensayo va al eco.',
    parameters: {
      method: 'POST',
      url: `={{ ${DATOS}.dry_run === true ? (($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/dry-run/eco') : '${WEBHOOK}' }}`,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ client_id: ${DATOS}.client_id, dry_run: false, origen: 'alta' }) }}`,
      options: { timeout: 10000, response: { response: { neverError: true } } },
    },
  }
}

/**
 * Agrega el nodo DESPUÉS del cierre (salida de éxito, la 0; la 1 es «Nota perdida»). Idempotente: si ya está, devuelve `ya: true` sin cambiar nada.
 * No toca ningún otro nodo ni conexión.
 */
export function agregarPropuesta(flujo) {
  const nodos = flujo.nodes ?? []
  if (nodos.some((n) => n.name === NODO_NUEVO)) return { ya: true, flujo }
  const cierre = nodos.find((n) => n.name === NODO_CIERRE)
  if (!cierre) throw new Error(`no encuentro el nodo «${NODO_CIERRE}»: el flujo cambió, no se toca nada`)
  const [x, y] = cierre.position ?? [0, 0]
  const nuevo = nodoPropuesta([x + 260, y - 120])
  const conexiones = JSON.parse(JSON.stringify(flujo.connections ?? {}))
  const entrada = conexiones[NODO_CIERRE] ?? (conexiones[NODO_CIERRE] = { main: [] })
  entrada.main = entrada.main ?? []
  while (entrada.main.length < 1) entrada.main.push([])
  entrada.main[0] = [...(entrada.main[0] ?? []), { node: NODO_NUEVO, type: 'main', index: 0 }]
  return { ya: false, flujo: { ...flujo, nodes: [...nodos, nuevo], connections: conexiones } }
}

// ───────────────────────── guion contra n8n (solo si se ejecuta directo) ─────────────────────────
const LLAVES = [/[0-9a-f]{64}/, /eyJ[A-Za-z0-9_-]{20,}/, /(?<![A-Za-z-])sk-[A-Za-z0-9_-]{20,}/, /xox[a-z]-[A-Za-z0-9-]{10,}/, /Bearer [A-Za-z0-9._-]{25,}/]

async function principal() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const BASE = process.env.N8N_BASE_URL?.replace(/\/$/, ''), KEY = process.env.N8N_API_KEY
  if (!BASE || !KEY) { console.error('faltan N8N_BASE_URL / N8N_API_KEY (usa doppler run o --env-file)'); process.exit(1) }
  const api = async (m, p, body) => {
    const r = await fetch(`${BASE}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text()
    if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 200)}`)
    return JSON.parse(t)
  }
  const vivo = await api('GET', `/workflows/${FLUJO}`)
  console.log(`flujo vivo: ${vivo.name} · ${vivo.nodes.length} nodos · activo=${vivo.active}`)
  const { ya, flujo } = agregarPropuesta(vivo)
  if (ya) { console.log('ya está puesto: no hay nada que cambiar'); return }
  console.log(`agregaría 1 nodo «${NODO_NUEVO}» después de «${NODO_CIERRE}» (salida de éxito)`)
  if (!aplicar) { console.log('(--seco: no se escribió nada; usa --aplicar --respaldos <carpeta>)'); return }
  const dir = flag('--respaldos')
  if (!dir) { console.error('falta --respaldos <carpeta FUERA de la bóveda>'); process.exit(1) }
  const crudo = JSON.stringify(vivo)
  if (LLAVES.some((r) => r.test(crudo))) { console.error('el flujo trae una llave pegada: el respaldo NO se escribe (guárdalo fuera de la bóveda y revísalo)'); process.exit(1) }
  fs.mkdirSync(dir, { recursive: true })
  const respaldo = path.join(dir, `${FLUJO}-ANTES.json`)
  fs.writeFileSync(respaldo, crudo)
  console.log('respaldo:', respaldo)
  const { name, nodes, connections, settings } = flujo
  await api('PUT', `/workflows/${FLUJO}`, { name, nodes, connections, settings })
  const despues = await api('GET', `/workflows/${FLUJO}`)
  const ok = despues.nodes.some((n) => n.name === NODO_NUEVO) && despues.nodes.length === vivo.nodes.length + 1
  console.log(ok ? `aplicado y leído de vuelta: ${despues.nodes.length} nodos · activo=${despues.active}` : 'OJO: la lectura de vuelta no coincide')
  if (!ok) process.exit(2)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) principal().then(() => new Promise((r) => setTimeout(r, 100))).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
