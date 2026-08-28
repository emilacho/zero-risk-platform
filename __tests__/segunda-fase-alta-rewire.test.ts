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

/**
 * 🔴 Los tres se leen DESCARGADOS de n8n · no son archivos de autor.
 * `live-worker-2026-08-28.json` es el retrato PREVIO y se conserva para contraste.
 */
const previo: Flujo = leer('live-worker-2026-08-28.json')
const vivo: Flujo = leer('live-worker-POST-PUT-2026-08-28.json')
const nuevo: Flujo = leer('segunda-fase-workflow-CREADO.json')

const ARMAR = 'Armar carga · segunda fase'
const LLAMAR = 'Llamar · Segunda Fase del alta'

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
  it('el retrato PREVIO tenia 73 nodos', () => {
    expect(previo.nodes.length).toBe(73)
  })

  it('el vivo DESCARGADO tiene 75 (los 73 + los 2 nuevos)', () => {
    expect(vivo.nodes.length).toBe(75)
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
describe('la carga del llamado · los 11 datos · leída del nodo VIVO', () => {
  const armar = nodo(vivo, ARMAR)
  const codigo = String((armar?.parameters as { jsCode?: string })?.jsCode ?? '')

  it('el nodo que ARMA la carga existe en el vivo y es de código', () => {
    expect(armar?.type).toBe('n8n-nodes-base.code')
  })

  it('arma LOS 11, sin faltar ninguno', () => {
    for (const c of CARGA) expect(codigo, `falta ${c} en la carga`).toContain(`${c}:`)
  })

  it('lee de los DOS orígenes (por eso hace falta este nodo)', () => {
    expect(codigo).toContain("$('Validate Deal Data')")
    expect(codigo).toContain("$('Call Onboarding Specialist: Auto-Discovery')")
  })

  it('los 4 que hoy NO llegan van con respaldo explícito (para no reventar)', () => {
    for (const c of ['tenant_id', 'primary_contact_id', 'contact_email', 'contact_name']) {
      const linea = codigo.split(/\r?\n/).find((l) => l.trim().startsWith(`${c}:`)) ?? ''
      expect(linea, `${c} debería llevar respaldo ||`).toContain('||')
    }
  })

  it('`discovery_result` viaja · era el dato que la primera enumeración se perdió', () => {
    expect(codigo).toContain('discovery_result')
    expect(JSON.stringify(nuevo)).toContain('discovery_result')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE FALTA · espera firma. Contra el estado de HOY tiene que dar ROJO.
// ─────────────────────────────────────────────────────────────────────────────
describe('el flujo nuevo EXISTE en n8n (era ROJO)', () => {
  it('tiene id asignado por n8n', () => {
    expect(nuevo.id).toBe('wu1DUAXIuEG5nNTX')
  })

  it('queda INACTIVO · publicar no es encender', () => {
    expect((nuevo as unknown as { active: boolean }).active).toBe(false)
  })

  it('el nodo que llama apunta a ese id', () => {
    expect(JSON.stringify(nodo(vivo, LLAMAR)?.parameters)).toContain('wu1DUAXIuEG5nNTX')
  })
})

describe('el alta YA llama a la segunda fase (era ROJO)', () => {
  it('`cimiento.promoted` TIENE salida · ya no es terminal', () => {
    expect(salidas(previo, PROMOVIDO).length).toBe(0)   // antes: cortado
    expect(salidas(vivo, PROMOVIDO).length).toBeGreaterThan(0)
  })

  it('la cadena es cimiento.promoted -> armar -> llamar', () => {
    expect(salidas(vivo, PROMOVIDO)).toContain(ARMAR)
    expect(salidas(vivo, ARMAR)).toContain(LLAMAR)
  })

  it('el vivo tiene los dos nodos nuevos', () => {
    expect(nodo(vivo, ARMAR)).toBeDefined()
    expect(nodo(vivo, LLAMAR)).toBeDefined()
  })

  it('nada de los 73 anteriores se borró', () => {
    for (const n of previo.nodes) expect(nodo(vivo, n.name), `se borró ${n.name}`).toBeDefined()
  })

  it('el alta sigue PAUSADA · publicar no es encender', () => {
    expect((vivo as unknown as { active: boolean }).active).toBe(false)
  })
})
