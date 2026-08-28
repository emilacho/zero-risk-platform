/**
 * Tests · Segunda fase del alta · flujo NUEVO (CC#3 2026-08-28).
 *
 * SUPERSEDE el plan de empalmes (b2a1bd9). Emilio: «SIMPLEMENTE ARMA OTRO WORKFLOW».
 * En vez de 3 empalmes dentro del worker de 73 nodos, se arma un flujo aparte con los
 * 9 nodos elegidos (+ el cierre del recorrido) y en `LyVoK` UN SOLO nodo que lo llama.
 *
 * 🔴 EL RIESGO REAL es la CARGA DEL LLAMADO: hoy esos nodos leen datos de nodos que
 * quedan atrás. En el flujo nuevo no existen. La carga está ENUMERADA, no muestreada:
 *
 *   LLEGAN HOY (6) · client_id · client_name · industry · contract_scope ·
 *                    _journey_id · _sala_correlation_id
 *   NO LLEGAN (4)  · tenant_id · primary_contact_id · contact_email · contact_name
 *                    (el worker VIEJO ya los lee vacíos · 87/87 filas del registro
 *                     tienen tenant_id == client_id, o sea el respaldo actuando;
 *                     y las 15 reservas de agenda tienen client_id NULO)
 *   NUEVO (1)      · discovery_result · lo lee `Build Success Plan Template` con la
 *                    sintaxis `$node['...']`, que la primera enumeración NO vio.
 *
 * §148 honest · esta suite lee JSON exportado/armado · NO toca producción.
 * 🔴 El bloque «falta» DEBE DAR ROJO: el flujo nuevo no está creado en n8n y `LyVoK`
 * todavía no lo llama. Las dos cosas esperan firma.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu/segunda-fase')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8'))

type Flujo = {
  id?: string
  name: string
  nodes: Array<{ name: string; type: string; disabled?: boolean; parameters: Record<string, unknown> }>
  connections: Record<string, { main?: Array<Array<{ node: string }> | null> }>
}

const vivo: Flujo = leer('live-worker-2026-08-28.json')
const nuevo: Flujo = leer('segunda-fase-workflow.json')
const llamador = leer('nodo-que-llama.json') as {
  parameters: { workflowId?: string; workflowInputs?: { value?: Record<string, string> } }
}

const salidas = (f: Flujo, de: string): string[] =>
  (f.connections[de]?.main ?? []).flatMap((rama) => (rama ?? []).map((c) => c.node))
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)

const PROMOVIDO = '[MODELB] Emit · cimiento.promoted'
const DISPARADOR = 'Datos del alta'

/** Los 9 de Emilio + el cierre del recorrido, en orden. */
const ORDEN = [
  'Create Notion Client Workspace',
  '[MODELB] Phase-boundary Emit · notion_workspace_created',
  'Build Success Plan Template',
  'Create Success Plan in Notion',
  '[MODELB] Phase-boundary Emit · success_plan_built',
  'Schedule Kickoff Call (Cal.com)',
  '[MODELB] Phase-boundary Emit · kickoff_scheduled',
  'Alert Slack: Onboarding Initiated',
  '[MODELB] Write-back Callback · run terminal',
  '[MODELB] Phase-boundary Emit · journey_completed',
]

/** La carga enumerada · los 11 datos que deben viajar. */
const CARGA = [
  'client_id', 'client_name', 'industry', 'contract_scope',
  '_journey_id', '_sala_correlation_id',
  'tenant_id', 'primary_contact_id', 'contact_email', 'contact_name',
  'discovery_result',
]

/** Nodos que NO existen en el flujo nuevo · nadie puede leerlos. */
const AFUERA = [
  'Validate Deal Data',
  'Call Onboarding Specialist: Auto-Discovery',
  'Compute Handoff Score',
  'Notify MC Inbox',
]

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL POSITIVO · si esto falla, el instrumento está roto y ningún rojo vale.
// ─────────────────────────────────────────────────────────────────────────────
describe('control positivo · las fotos se leen y son las que creemos', () => {
  it('el worker vivo tiene 73 nodos', () => {
    expect(vivo.nodes.length).toBe(73)
  })

  it('la primera mitad del worker SÍ está cableada (el instrumento ve aristas reales)', () => {
    expect(salidas(vivo, 'Webhook: Deal Won').length).toBeGreaterThan(0)
    expect(salidas(vivo, '[JEFATURA] Execute Cimiento Track')).toContain(
      'IF track_pass (¿el cimiento pasó de verdad?)'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EL FLUJO NUEVO · lo construido en este commit. Verde.
// ─────────────────────────────────────────────────────────────────────────────
describe('el flujo nuevo · los 9 nodos de Emilio + el cierre', () => {
  it('tiene el disparador y los 10 nodos', () => {
    expect(nodo(nuevo, DISPARADOR)?.type).toBe('n8n-nodes-base.executeWorkflowTrigger')
    for (const n of ORDEN) expect(nodo(nuevo, n), `falta ${n}`).toBeDefined()
    expect(nuevo.nodes.length).toBe(11)
  })

  it('está encadenado en el orden que eligió Emilio', () => {
    expect(salidas(nuevo, DISPARADOR)).toEqual(['Create Notion Client Workspace'])
    expect(salidas(nuevo, 'Create Notion Client Workspace')).toContain('Build Success Plan Template')
    expect(salidas(nuevo, 'Build Success Plan Template')).toEqual(['Create Success Plan in Notion'])
    expect(salidas(nuevo, 'Create Success Plan in Notion')).toContain('Schedule Kickoff Call (Cal.com)')
    expect(salidas(nuevo, 'Schedule Kickoff Call (Cal.com)')).toContain('Alert Slack: Onboarding Initiated')
    expect(salidas(nuevo, 'Alert Slack: Onboarding Initiated')).toEqual([
      '[MODELB] Write-back Callback · run terminal',
    ])
    expect(salidas(nuevo, '[MODELB] Write-back Callback · run terminal')).toEqual([
      '[MODELB] Phase-boundary Emit · journey_completed',
    ])
  })

  it('NO trae los 4 de fase B ni los 5 de la cascada', () => {
    for (const n of ['Compute Handoff Score', 'Notify MC Inbox', 'Spell Check Pass (in-cascade)']) {
      expect(nodo(nuevo, n), `no debería estar ${n}`).toBeUndefined()
    }
  })

  it('NINGÚN nodo lee de un nodo que no existe en este flujo', () => {
    // sólo `parameters` · es lo que se EJECUTA. Las `notes` son prosa y pueden nombrar
    // el cableado viejo para explicarlo (de hecho lo hacen, a propósito).
    const ejecutable = JSON.stringify(nuevo.nodes.map((n) => n.parameters))
    for (const n of AFUERA) expect(ejecutable, `sigue leyendo ${n}`).not.toContain(n)
    for (const campo of ['handoff_score', 'mc_inbox']) {
      expect(ejecutable, `el cierre sigue armando ${campo}`).not.toContain(campo)
    }
  })

  it('los 11 datos de la carga se USAN de verdad (no sobra ninguno)', () => {
    const ejecutable = JSON.stringify(nuevo.nodes.map((n) => n.parameters))
    for (const c of CARGA) {
      expect(ejecutable, `la carga manda ${c} pero el flujo no lo lee`).toContain(`item.json.${c}`)
    }
  })

  it('todo lo que necesita sale del disparador', () => {
    expect(JSON.stringify(nuevo)).toContain(`$('${DISPARADOR}')`)
  })

  it('el nombre se crea BIEN codificado (no se arrastra el mojibake de n8n)', () => {
    expect(nuevo.name).not.toMatch(/â€|Ã/)
    expect(vivo.name).toMatch(/â€/) // el viejo sigue mal · no se toca
  })

  it('no lleva credenciales embebidas', () => {
    expect(nuevo.nodes.some((n) => 'credentials' in n)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LA CARGA · el único riesgo real. Enumerada, no muestreada.
// ─────────────────────────────────────────────────────────────────────────────
describe('la carga del llamado · los 11 datos enumerados', () => {
  const enviados = Object.keys(llamador.parameters.workflowInputs?.value ?? {})

  it('el nodo que llama manda LOS 11, sin faltar ninguno', () => {
    for (const c of CARGA) expect(enviados, `falta ${c} en la carga`).toContain(c)
  })

  it('no manda de más (la lista es exacta)', () => {
    expect(enviados.sort()).toEqual([...CARGA].sort())
  })

  it('los 4 que hoy NO llegan van con respaldo explícito (para no reventar)', () => {
    const v = llamador.parameters.workflowInputs?.value ?? {}
    for (const c of ['tenant_id', 'primary_contact_id', 'contact_email', 'contact_name']) {
      expect(v[c], `${c} debería llevar respaldo ||`).toContain('||')
    }
  })

  it('`discovery_result` viaja · era el dato que la primera enumeración se perdió', () => {
    expect(enviados).toContain('discovery_result')
    expect(JSON.stringify(nuevo)).toContain('discovery_result')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE FALTA · espera firma. Contra el estado de HOY tiene que dar ROJO.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 falta · el flujo nuevo no está creado en n8n', () => {
  it('el flujo nuevo tiene id asignado por n8n (ROJO hasta que se cree)', () => {
    expect(nuevo.id, 'el flujo todavía es un plan, no existe en n8n').toBeDefined()
  })

  it('el nodo que llama apunta a un workflowId real (ROJO hasta que exista)', () => {
    expect(llamador.parameters.workflowId, 'sin id: el flujo nuevo no existe aún').toBeTruthy()
  })
})

describe('🔴 falta · el alta todavía no llama a la segunda fase', () => {
  it('`cimiento.promoted` TIENE salida (hoy es TERMINAL · ahí se corta el alta)', () => {
    expect(salidas(vivo, PROMOVIDO).length).toBeGreaterThan(0)
  })

  it('`cimiento.promoted` cuelga del nodo que llama a la segunda fase', () => {
    expect(salidas(vivo, PROMOVIDO)).toContain('Llamar · Segunda Fase del alta')
  })

  it('el worker vivo tiene el nodo que llama', () => {
    expect(nodo(vivo, 'Llamar · Segunda Fase del alta')).toBeDefined()
  })
})
