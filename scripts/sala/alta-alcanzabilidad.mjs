#!/usr/bin/env node
/**
 * E71 · ALCANZABILIDAD ESTÁTICA DEL ALTA · la comprobación que no depende de correr el alta.
 *
 * Por qué existe: el sobre que pide `planeación` colgaba de un `journey_completed` que NINGÚN
 * disparador alcanzaba (cola vieja del alta, movida a la segunda fase `wu1D` el 03-sep y dejada
 * huérfana). El diff no lo veía; una corrida paga lo habría mostrado tarde. Esto lo ve gratis.
 *
 * Qué comprueba sobre un flujo n8n (JSON de `GET /api/v1/workflows/:id`):
 *   1. el nodo del sobre es ALCANZABLE desde el disparador del alta (BFS por conexiones `main`)
 *   2. el camino que lo alcanza pasa por «Llamar · Segunda Fase del alta» (el final real)
 *   3. no hay huérfanos NUEVOS fuera de la lista conocida (la cola vieja, 24 nodos, ya está declarada)
 *
 * Uso:
 *   node scripts/sala/alta-alcanzabilidad.mjs                       → lee el motor en vivo (N8N_BASE_URL · N8N_API_KEY)
 *   node scripts/sala/alta-alcanzabilidad.mjs <archivo.json>        → lee una foto
 *   node scripts/sala/alta-alcanzabilidad.mjs --foto <salida.json>  → lee el motor y guarda la foto (para el test)
 * Exit 0 = alcanzable y sin huérfanos nuevos · 1 = defecto · 2 = no se pudo leer.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export const ALTA_ID = 'LyVoKcrypS5uLyuu'
export const DISPARADOR = 'Webhook: Deal Won'
export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
export const FINAL_REAL = 'Llamar · Segunda Fase del alta'

/** Huérfanos CONOCIDOS · la cola vieja del alta (Notion + plan + agenda + cierre + cascada + Camino III),
 *  duplicada dentro de `wu1DUAXIuEG5nNTX` desde el 03-sep y dejada colgando acá. Declarados, no borrados
 *  (borrarlos es otro encargo). Cualquier huérfano que NO esté en esta lista hace fallar la comprobación. */
export const HUERFANOS_CONOCIDOS = Object.freeze([
  'Create Notion Client Workspace',
  'Build Success Plan Template',
  'Create Success Plan in Notion',
  'Schedule Kickoff Call (Cal.com)',
  'Compute Handoff Score',
  'AM Handoff → SALA event (am_handoff)',
  'Alert Slack: Onboarding Initiated',
  'Notify MC Inbox',
  'Trigger Master Journey ugK3',
  'Run Onboarding Cascade (Gap 3)',
  'Spell Check Pass (in-cascade)',
  '[APIFY-WIRE] Split per function (onboarding_e2e)',
  '[MODELB] Write-back Callback · run terminal',
  '[APIFY-WIRE] IF · Camino III decision (PASS/REJECT)',
  '[APIFY-WIRE] POST /api/hitl/queue (canon)',
  'Build Master Journey Input (canon shape)',
  'Wait · Camino III decision',
  'Onboarding rejected · Camino III',
  '[MODELB] Phase-boundary Emit · notion_workspace_created',
  '[MODELB] Phase-boundary Emit · success_plan_built',
  '[MODELB] Phase-boundary Emit · kickoff_scheduled',
  '[MODELB] Phase-boundary Emit · mc_inbox_notified',
  '[MODELB] Phase-boundary Emit · journey_completed',
  '[MODELB] Phase-boundary Emit · CASCADE',
])

export function sucesores(workflow, nombre) {
  const c = workflow.connections?.[nombre]
  if (!c) return []
  return Object.values(c).flatMap((salidas) => salidas.flatMap((arr) => (arr ?? []).map((x) => x.node)))
}

export function analizar(workflow) {
  const nombres = new Set((workflow.nodes ?? []).map((n) => n.name))
  const padre = new Map()
  const vistos = new Set([DISPARADOR])
  const cola = [DISPARADOR]
  while (cola.length) {
    const x = cola.shift()
    for (const y of sucesores(workflow, x)) {
      if (vistos.has(y)) continue
      vistos.add(y)
      padre.set(y, x)
      cola.push(y)
    }
  }
  const camino = []
  if (vistos.has(SOBRE)) {
    let cur = SOBRE
    while (cur) { camino.unshift(cur); cur = padre.get(cur) }
  }
  const huerfanos = [...nombres].filter((n) => !vistos.has(n))
  const huerfanosNuevos = huerfanos.filter((n) => !HUERFANOS_CONOCIDOS.includes(n))
  const conocidosQueVolvieron = HUERFANOS_CONOCIDOS.filter((n) => nombres.has(n) && vistos.has(n))
  return {
    versionId: workflow.versionId ?? null,
    nodos: nombres.size,
    alcanzables: vistos.size,
    sobre_existe: nombres.has(SOBRE),
    sobre_alcanzable: vistos.has(SOBRE),
    pasa_por_final_real: camino.includes(FINAL_REAL),
    camino,
    huerfanos,
    huerfanos_nuevos: huerfanosNuevos,
    conocidos_que_volvieron: conocidosQueVolvieron,
  }
}

export const GUARDA = 'GUARDA · si la puerta rechazó el pedido de planeación'

/** E73 · los huecos que CC#2 dejó dichos en E72 (M5 · M6):
 *   - un nodo DESACTIVADO en n8n deja pasar los datos ⇒ con «Llamar» desactivado el sobre saldría sin
 *     correr la segunda fase, y la alcanzabilidad sola no lo ve ⇒ ningún nodo del camino puede estar disabled,
 *     y «Llamar» tiene que ESPERAR a la segunda fase (waitForSubWorkflow no puede estar en false);
 *   - sin la GUARDA, un rechazo de la puerta vuelve a ser «200 y silencio» ⇒ la GUARDA tiene que existir,
 *     ser la salida del sobre, y lanzar cuando `ok !== true`. */
export function huecos(workflow, r) {
  const byName = new Map((workflow.nodes ?? []).map((n) => [n.name, n]))
  const problemas = []
  const desactivados = r.camino.filter((n) => byName.get(n)?.disabled)
  if (desactivados.length) problemas.push(`nodos DESACTIVADOS en el camino al sobre (dejan pasar los datos sin correr): ${desactivados.join(' · ')}`)
  const llamar = byName.get(FINAL_REAL)
  if (llamar && llamar.parameters?.options?.waitForSubWorkflow === false) problemas.push(`«${FINAL_REAL}» no espera a la segunda fase (waitForSubWorkflow=false) · el sobre saldría antes de terminar`)
  const guarda = byName.get(GUARDA)
  if (!guarda) problemas.push(`falta «${GUARDA}» · un rechazo de la puerta volvería a ser 200 y silencio`)
  else {
    const salidas = sucesores(workflow, SOBRE)
    if (!salidas.includes(GUARDA)) problemas.push(`«${GUARDA}» no es la salida del sobre (salidas: ${salidas.join(', ') || 'ninguna'})`)
    const code = String(guarda.parameters?.jsCode ?? '')
    if (!/ok !== true/.test(code) || !/throw new Error/.test(code)) problemas.push(`«${GUARDA}» ya no lanza cuando ok !== true`)
    if (guarda.disabled) problemas.push(`«${GUARDA}» está desactivada`)
  }
  return problemas
}

export function veredicto(r, workflow) {
  const problemas = []
  if (!r.sobre_existe) problemas.push(`falta el nodo «${SOBRE}»`)
  if (!r.sobre_alcanzable) problemas.push(`«${SOBRE}» NO es alcanzable desde «${DISPARADOR}» · el pedido de planeación nunca saldría`)
  if (r.sobre_alcanzable && !r.pasa_por_final_real) problemas.push(`el sobre no cuelga del final real («${FINAL_REAL}»)`)
  if (r.huerfanos_nuevos.length) problemas.push(`huérfanos NUEVOS (no declarados): ${r.huerfanos_nuevos.join(' · ')}`)
  if (workflow) problemas.push(...huecos(workflow, r))
  return { ok: problemas.length === 0, problemas }
}

/** E73 · hueco 3 (el de fondo): CI lee una FOTO, no el motor. Con `N8N_API_KEY` en el entorno (secreto de
 *  GitHub · manos de Emilio) esto lee el motor y compara: si la foto y el motor no son la misma versión, falla.
 *  Sin la llave devuelve `null` y quien llama lo dice en voz alta. */
export async function compararConMotor(foto) {
  if (!process.env.N8N_API_KEY) return null
  const vivo = await leerMotor()
  const norm = (w) => JSON.stringify({
    nodes: (w.nodes ?? []).map((n) => [n.name, n.type, JSON.stringify(n.parameters ?? {}), !!n.disabled]).sort(),
    connections: w.connections ?? {},
  })
  return {
    versionId_motor: vivo.versionId ?? null,
    versionId_foto: foto.versionId ?? null,
    iguales: norm(vivo) === norm(foto),
    vivo,
  }
}

async function leerMotor() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  }
  const base = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/+$/, '')
  if (!process.env.N8N_API_KEY) throw new Error('falta N8N_API_KEY')
  const res = await fetch(`${base}/api/v1/workflows/${ALTA_ID}`, { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } })
  if (!res.ok) throw new Error(`motor respondió ${res.status}`)
  return res.json()
}

const esMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (esMain) {
  try {
    const args = process.argv.slice(2)
    const fotoIdx = args.indexOf('--foto')
    const fotoOut = fotoIdx >= 0 ? args[fotoIdx + 1] : null
    const archivo = args.find((a) => !a.startsWith('--') && a !== fotoOut)
    const wf = archivo ? JSON.parse(readFileSync(archivo, 'utf8')) : await leerMotor()
    if (fotoIdx >= 0) { writeFileSync(fotoOut, JSON.stringify(wf, null, 1)); console.log('foto guardada ·', fotoOut) }
    const r = analizar(wf)
    const v = veredicto(r, wf)
    console.log(JSON.stringify({ fuente: archivo ?? 'motor', versionId: r.versionId, nodos: r.nodos, alcanzables: r.alcanzables, huerfanos: r.huerfanos.length, huerfanos_nuevos: r.huerfanos_nuevos, sobre_alcanzable: r.sobre_alcanzable, pasa_por_final_real: r.pasa_por_final_real }, null, 2))
    console.log('camino al sobre:\n  ' + (r.camino.length ? r.camino.join('\n  → ') : '(ninguno)'))
    console.log('\nVEREDICTO ·', v.ok ? 'EL SOBRE SALE · alcanzable por el final real · sin huérfanos nuevos' : '🔴 ' + v.problemas.join(' | '))
    process.exit(v.ok ? 0 : 1)
  } catch (e) {
    console.error('no se pudo comprobar ·', e.message)
    process.exit(2)
  }
}
