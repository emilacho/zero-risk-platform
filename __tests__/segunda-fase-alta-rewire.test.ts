/**
 * Tests · Segunda fase del alta · re-cableado (worker LyVoKcrypS5uLyuu · CC#3 2026-08-28).
 *
 * CONTEXTO MEDIDO (raw/findings/2026-08-28-CC3-AUDITORIA-ADVERSARIAL-el-alta-esta-cortada-a-la-mitad.md
 * y raw/findings/2026-08-28-CC3-el-orden-real-de-la-cola-y-que-rompe-el-recorte.md):
 *
 *   - 24 de 73 nodos son INALCANZABLES desde el webhook.
 *   - `[MODELB] Emit · cimiento.promoted` es TERMINAL: el alta promueve el cimiento y se acaba.
 *   - Último alta completa de un cliente real: 21-jul 20:35 UTC. Ninguna en 38 días.
 *   - Los 4 nodos de «fase B» (ejecutivo de cuenta + bandeja) están INTERCALADOS en la cola,
 *     no al final: `Alert Slack` cuelga de `AM Handoff`, y `Write-back Callback` cuelga de
 *     `Notify MC Inbox`. Cortarlos sin empalmar se lleva el aviso a Emilio Y el cierre.
 *   - Además `Write-back Callback` LEE `$('Compute Handoff Score')` y `$('Notify MC Inbox')`
 *     dentro de `summary`: en n8n, leer un nodo que no corrió revienta la corrida.
 *
 * ALCANCE (DECISION-EMILIO-alcance-de-la-segunda-fase): entran 9 nodos + `journey_completed`.
 * Salen a fase B los 4 del ejecutivo/bandeja. Sale la cascada (5 nodos, `Spell Check Pass`
 * incluido: es un `noOp` marcador · el corrector real corre dentro de /api/cascade/onboard).
 *
 * §148 honest · esta suite lee el JSON EXPORTADO del worker vivo · NO toca producción.
 * 🔴 Los tests del bloque «objetivo» DEBEN DAR ROJO contra el JSON de hoy. Un test que
 * pasa antes del arreglo está mirando otra cosa.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu/segunda-fase')
const worker = JSON.parse(readFileSync(join(DIR, 'live-worker-2026-08-28.json'), 'utf8')) as {
  nodes: Array<{ name: string; type: string; disabled?: boolean; parameters: Record<string, unknown> }>
  connections: Record<string, { main?: Array<Array<{ node: string }> | null> }>
}

const nodeByName = (n: string) => worker.nodes.find((x) => x.name === n)
const targets = (from: string): string[] =>
  (worker.connections[from]?.main ?? []).flatMap((rama) => (rama ?? []).map((c) => c.node))

/** Alcanzables desde un nodo, siguiendo `main` en cualquier salida. */
function alcanzables(desde: string): Set<string> {
  const vistos = new Set<string>([desde])
  const pila = [desde]
  while (pila.length) {
    const n = pila.pop() as string
    for (const t of targets(n)) if (!vistos.has(t)) { vistos.add(t); pila.push(t) }
  }
  return vistos
}

// ── nombres canónicos (tal cual están en el worker vivo) ──────────────────────
const ENTRADA = 'Webhook: Deal Won'
const PROMOVIDO = '[MODELB] Emit · cimiento.promoted'
const WORKSPACE = 'Create Notion Client Workspace'
const PLAN_TPL = 'Build Success Plan Template'
const PLAN = 'Create Success Plan in Notion'
const AGENDA = 'Schedule Kickoff Call (Cal.com)'
const SLACK = 'Alert Slack: Onboarding Initiated'
const CIERRE = '[MODELB] Write-back Callback · run terminal'
const FIN = '[MODELB] Phase-boundary Emit · journey_completed'

/** Los 4 que Emilio saca a «fase B»: se DESCONECTAN, no se borran. */
const FASE_B = [
  'Compute Handoff Score',
  'AM Handoff → SALA event (am_handoff)',
  'Notify MC Inbox',
  '[MODELB] Phase-boundary Emit · mc_inbox_notified',
]

/** Los 5 de la cascada: quedan fuera del alcance («ese cascade es otro tema»). */
const CASCADA = [
  'Spell Check Pass (in-cascade)',
  'Run Onboarding Cascade (Gap 3)',
  'Build Master Journey Input (canon shape)',
  'Trigger Master Journey ugK3',
  '[MODELB] Phase-boundary Emit · CASCADE',
]

/** Los 10 que entran (los 9 de Emilio + el cierre del recorrido). */
const SEGUNDA_FASE = [
  WORKSPACE,
  '[MODELB] Phase-boundary Emit · notion_workspace_created',
  PLAN_TPL,
  PLAN,
  '[MODELB] Phase-boundary Emit · success_plan_built',
  AGENDA,
  '[MODELB] Phase-boundary Emit · kickoff_scheduled',
  SLACK,
  CIERRE,
  FIN,
]

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL POSITIVO · si esto falla, el instrumento está roto y nada más vale.
// Debe estar VERDE hoy y después del arreglo.
// ─────────────────────────────────────────────────────────────────────────────
describe('control positivo · la foto del worker se lee y es la que creemos', () => {
  it('el worker exportado tiene 73 nodos', () => {
    expect(worker.nodes.length).toBe(73)
  })

  it('los 10 nodos de la segunda fase EXISTEN en el worker', () => {
    for (const n of SEGUNDA_FASE) expect(nodeByName(n), `falta nodo ${n}`).toBeDefined()
  })

  it('la primera mitad SÍ está cableada (el instrumento ve aristas reales)', () => {
    const vivos = alcanzables(ENTRADA)
    expect(vivos.has('Validate Deal Data')).toBe(true)
    expect(vivos.has('[JEFATURA] Execute Cimiento Track')).toBe(true)
    expect(vivos.has(PROMOVIDO)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ROJO OBLIGATORIO · el estado OBJETIVO. Contra el JSON de hoy TIENE que fallar.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 objetivo · la segunda fase cuelga del cimiento promovido', () => {
  it('`cimiento.promoted` TIENE salida (hoy es terminal · ROJO esperado)', () => {
    expect(targets(PROMOVIDO).length).toBeGreaterThan(0)
  })

  it('`cimiento.promoted` entra a `Create Notion Client Workspace`', () => {
    expect(targets(PROMOVIDO)).toContain(WORKSPACE)
  })

  it('la segunda fase entera queda ALCANZABLE desde el webhook', () => {
    const vivos = alcanzables(ENTRADA)
    for (const n of SEGUNDA_FASE) expect(vivos.has(n), `${n} sigue inalcanzable`).toBe(true)
  })
})

describe('🔴 objetivo · los dos empalmes que saltean la fase B', () => {
  it('`Schedule Kickoff Call` empalma directo a `Alert Slack` (saltea el ejecutivo de cuenta)', () => {
    expect(targets(AGENDA)).toContain(SLACK)
  })

  it('`Alert Slack` empalma directo al cierre (saltea la bandeja)', () => {
    expect(targets(SLACK)).toContain(CIERRE)
  })

  it('el cierre ya NO cuelga de `Notify MC Inbox`', () => {
    expect(targets('Notify MC Inbox')).not.toContain(CIERRE)
  })

  it('`Alert Slack` ya NO cuelga de `AM Handoff`', () => {
    expect(targets('AM Handoff → SALA event (am_handoff)')).not.toContain(SLACK)
  })
})

describe('🔴 objetivo · el cierre no lee datos de nodos que no van a correr', () => {
  const cuerpoCierre = JSON.stringify(nodeByName(CIERRE)?.parameters ?? {})

  it('el cierre NO referencia `Compute Handoff Score`', () => {
    expect(cuerpoCierre).not.toContain("$('Compute Handoff Score')")
  })

  it('el cierre NO referencia `Notify MC Inbox`', () => {
    expect(cuerpoCierre).not.toContain("$('Notify MC Inbox')")
  })

  it('el cierre SÍ conserva lo que necesita de la primera mitad', () => {
    expect(cuerpoCierre).toContain("$('Validate Deal Data')")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAS · lo que el re-cableado NO puede romper. Verde hoy y después.
// ─────────────────────────────────────────────────────────────────────────────
describe('guardias · el recorte desconecta, no borra', () => {
  it('los 4 nodos de fase B SIGUEN EXISTIENDO (Emilio: «no se borra»)', () => {
    for (const n of FASE_B) expect(nodeByName(n), `se borró ${n}`).toBeDefined()
  })

  it('los 5 nodos de la cascada SIGUEN EXISTIENDO', () => {
    for (const n of CASCADA) expect(nodeByName(n), `se borró ${n}`).toBeDefined()
  })

  it('`Spell Check Pass` es un marcador sin parámetros (no revisa nada · se va con la cascada)', () => {
    const n = nodeByName('Spell Check Pass (in-cascade)')
    expect(n?.type).toBe('n8n-nodes-base.noOp')
    expect(Object.keys(n?.parameters ?? {})).toHaveLength(0)
  })

  it('la cascada DESEMBOCA en `Build Success Plan Template` (no cuelga de ella)', () => {
    // por eso sacar la cascada no corta la cola: el otro predecesor la sostiene.
    expect(targets('Trigger Master Journey ugK3')).toContain(PLAN_TPL)
    expect(targets(WORKSPACE)).toContain(PLAN_TPL)
  })
})
