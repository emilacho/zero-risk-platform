/**
 * 🔴 E99 · EL ALTA LEE LA RESPUESTA EQUIVOCADA · lo que mató la segunda bolita (E98 · 2026-09-18 · US$ 3,86).
 *
 * El cimiento (141335) funcionó entero: lentes · juez 0,89 · Lazo A · juez 0,915 · canon 2176f143 · PDF en Drive.
 * Y el alta (141329) murió un nodo después: «Promote → canon» abría en DOS ramas terminales, «Return scores a
 * parent» y «Manual → Drive (PDF)». El motor devuelve al padre la salida del ÚLTIMO nodo que corre, y ese era el
 * del PDF: {"message":"Workflow was started"} ⇒ track_published = undefined ⇒ «cimiento no promovido» (FALSO).
 * Encima, el «Stop and Error» reventó con un TypeError propio y el aviso a #alertas no trajo la causa.
 *
 * Fija con la evidencia REAL: (①) en el cimiento construido el ÚNICO terminal después de promover es «Return
 * scores», el PDF corre antes, y el contrato sale con track_published aunque $json sea el acuse del PDF;
 * (②) en el alta construida el Stop imprime una causa armada por un Code node que distingue los tres casos.
 * NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any>; disabled?: boolean }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main?: Array<Array<{ node: string }> | null> }>; settings?: any }

const CIM = join(process.cwd(), 'scripts/worker-staging/ssLtwYPt7zxuvnM2')
const ALTA = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu')
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const CIM_VIVO = leer(join(CIM, 'cimiento-VIVO-2026-09-18-e99.json')) as Flujo // 7e0b4ff9 · lo que corrió en E98
const CIM_HOY = leer(join(CIM, 'cimiento-construido-e99.json')) as Flujo
const ALTA_VIVO = leer(join(ALTA, 'alta-antes-e99-fae3046f.json')) as Flujo // fae3046f · lo que corrió en E98
const ALTA_HOY = leer(join(ALTA, 'alta-construida-e99.json')) as Flujo

const PROMOTE = '[BB] Promote → canon'
const PDF = '[BB] Manual → Drive (PDF)'
const RETURN = 'Return scores a parent (grade-cimiento gate)'
const EXECUTE = '[JEFATURA] Execute Cimiento Track'
const EMIT = '[MODELB] Emit · cimiento.failed (honesto)'
const STOP = 'Stop and Error · cimiento no promovido'
const ARMAR = 'Armar la causa · cimiento'

/** la evidencia real: lo que el alta recibió del cimiento en 141329 */
const ACUSE_PDF = { message: 'Workflow was started' }
/** lo que «Return scores» devolvió de verdad en 141335 (recortado a lo que importa) */
const CONTRATO_REAL = { fidelity_scores: { positioning: 0.93, icp_summary: 0.9 }, client_id: 'e388a370-910f-4ee7-9a48-4a79393b8cb4', track_pass: true, track_published: true, track_exhausted: false }

const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
const salidas = (f: Flujo, n: string, i = 0) => (f.connections[n]?.main?.[i] ?? []).map((x) => x.node)
const terminales = (f: Flujo, desde: string) => {
  const vistos = new Set<string>()
  const fin: string[] = []
  const pila = [desde]
  while (pila.length) {
    const n = pila.pop()!
    if (vistos.has(n)) continue
    vistos.add(n)
    const s = (f.connections[n]?.main ?? []).flatMap((o) => (o ?? []).map((x) => x.node))
    if (!s.length) fin.push(n)
    pila.push(...s)
  }
  return fin.sort()
}
/** «último nodo» como lo hace el motor sobre una cadena lineal · si hay bifurcación terminal, devuelve las dos */
const ultimoTrasPromover = (f: Flujo) => terminales(f, PROMOTE)

/** corre «Return scores» como n8n: $json = lo que le llega · $('…') = nodos ya corridos */
function returnScores(f: Flujo, $json: any, corridos: Record<string, any>) {
  const code = String(nodo(f, RETURN).parameters.jsCode)
  const $ = (n: string) => ({
    first: () => {
      if (!(n in corridos)) throw new Error(`Node '${n}' hasn't been executed`)
      return { json: corridos[n] }
    },
  })
  return new Function('$json', '$', code)($json, $)[0].json as Record<string, any>
}
const PROMOTE_PREP = { fidelity: { pass: true, scores: CONTRATO_REAL.fidelity_scores, threshold: 0.85 }, brand_book_draft: { client_id: CONTRATO_REAL.client_id }, promote_body: { brand_book: {} } }

describe('el rojo · el cimiento publicado en E98 (7e0b4ff9)', () => {
  it('«Promote → canon» abre en DOS terminales · el motor devuelve el ÚLTIMO y ese es el del PDF', () => {
    expect(salidas(CIM_VIVO, PROMOTE).sort()).toEqual([PDF, RETURN].sort())
    expect(ultimoTrasPromover(CIM_VIVO)).toEqual([PDF, RETURN].sort()) // dos finales · el padre lee el que corra último
    expect(salidas(CIM_VIVO, PDF)).toEqual([])
  })
  it('el acuse del PDF NO trae el contrato ⇒ el alta leía track_published vacío', () => {
    expect((ACUSE_PDF as any).track_published).toBeUndefined()
    expect((ACUSE_PDF as any)._cimiento_return).toBeUndefined()
  })
})

describe('① el arreglo · el resultado es lo ÚLTIMO que sale del cimiento', () => {
  it('Promote → PDF → Return · un solo terminal después de promover, y es «Return scores»', () => {
    expect(salidas(CIM_HOY, PROMOTE)).toEqual([PDF])
    expect(salidas(CIM_HOY, PDF)).toEqual([RETURN])
    expect(CIM_HOY.connections[RETURN]).toBeUndefined()
    expect(ultimoTrasPromover(CIM_HOY)).toEqual([RETURN])
  })
  it('manual promovido ⇒ el padre lee track_published con contenido, aunque $json sea el acuse del PDF', () => {
    const out = returnScores(CIM_HOY, ACUSE_PDF, { '[BB] Promote prep': PROMOTE_PREP, [PDF]: ACUSE_PDF })
    expect(out.track_published).toBe(true)
    expect(out.track_pass).toBe(true)
    expect(out._cimiento_return).toBe(true)
    expect(out.client_id).toBe(CONTRATO_REAL.client_id)
    expect(out._return_source).toBe('promote_prep')
    expect(out.pdf_manual).toEqual({ solicitado: true, acuse: ACUSE_PDF })
  })
  it('si el nodo del PDF no corrió (o falló), el contrato sale igual y lo dice · el PDF no decide', () => {
    const sin = returnScores(CIM_HOY, {}, { '[BB] Promote prep': PROMOTE_PREP })
    expect(sin.track_published).toBe(true)
    expect(sin.pdf_manual.solicitado).toBe(false)
    expect(sin.pdf_manual.nota).toMatch(/no corrió/)
    const fallo = returnScores(CIM_HOY, { error: 'ECONNREFUSED' }, { '[BB] Promote prep': PROMOTE_PREP, [PDF]: { error: 'ECONNREFUSED' } })
    expect(fallo.track_published).toBe(true)
    expect(fallo.pdf_manual.solicitado).toBe(false)
  })
  it('el camino honesto de «no alcanzó» sigue igual: $json del juez (json_directo) ⇒ track_pass false y motivo', () => {
    const juez = { fidelity: { pass: false, exhausted: true, scores: { positioning: 0.7 } }, brand_book_draft: { client_id: 'c1' } }
    const out = returnScores(CIM_HOY, juez, { [PDF]: ACUSE_PDF })
    expect(out.track_pass).toBe(false)
    expect(out.track_published).toBe(true) // al tope también sale, marcado (2026-08-28 e)
    expect(out.track_reason).toBe('ciclos_agotados')
    expect(out._return_source).toBe('json_directo')
  })
  it('no cambió nada más: mismos 30 nodos · sólo «Return scores» (código) y las salidas de Promote/PDF', () => {
    expect(CIM_HOY.nodes.length).toBe(CIM_VIVO.nodes.length)
    for (const v of CIM_VIVO.nodes) {
      const h = nodo(CIM_HOY, v.name)
      if (v.name === RETURN) continue
      expect(h.parameters, v.name).toEqual(v.parameters)
      expect(h.disabled ?? false, v.name).toBe(v.disabled ?? false)
    }
    for (const [from, c] of Object.entries(CIM_VIVO.connections)) {
      if (from === PROMOTE) continue
      expect(CIM_HOY.connections[from], from).toEqual(c)
    }
    const red3 = '[BB] Rescate · red 3 · fusionar o PARAR'
    expect(nodo(CIM_HOY, red3).parameters.jsCode).toBe(nodo(CIM_VIVO, red3).parameters.jsCode)
    expect(CIM_HOY.settings).toEqual({ executionOrder: 'v1', saveDataErrorExecution: 'all', saveManualExecutions: true })
  })
})

/** corre «Armar la causa» como n8n: $input.first() = lo que le llega · $('Execute…') = lo que devolvió el cimiento */
function armar(inp: any, ret: any | 'NO_CORRIO') {
  const code = String(nodo(ALTA_HOY, ARMAR).parameters.jsCode)
  const $ = (n: string) => ({
    first: () => {
      if (n !== EXECUTE || ret === 'NO_CORRIO') throw new Error(`Node '${n}' hasn't been executed`)
      return { json: ret }
    },
  })
  return new Function('$input', '$', code)({ first: () => ({ json: inp }) }, $)[0].json as { causa: string }
}
/** evalúa el mensaje del Stop como lo haría el motor con `={{ … }}` */
const mensajeDelStop = ($json: any) => {
  const expr = String(nodo(ALTA_HOY, STOP).parameters.errorMessage)
  const m = expr.match(/^=\{\{([\s\S]*)\}\}$/)
  if (!m) throw new Error('el Stop ya no es una expresión simple')
  return String(new Function('$json', `return (${m[1]})`)($json))
}

describe('el rojo · el alta publicada en E98 (fae3046f) avisaba sin la causa', () => {
  it('el Stop armaba el mensaje con una expresión larga que leía campos de otro nodo', () => {
    const s = nodo(ALTA_VIVO, STOP)
    expect(String(s.parameters.errorMessage)).toMatch(/\$\('\[JEFATURA\] Execute Cimiento Track'\)\.first\(\)\.json\.track_pass/)
    expect(salidas(ALTA_VIVO, EXECUTE, 1)).toEqual([STOP])
    expect(salidas(ALTA_VIVO, EMIT)).toEqual([STOP])
  })
})

describe('② el arreglo · el aviso trae la causa real', () => {
  it('Execute#1 y Emit#0 pasan por «Armar la causa» y el Stop sólo imprime $json.causa', () => {
    expect(salidas(ALTA_HOY, EXECUTE, 1)).toEqual([ARMAR])
    expect(salidas(ALTA_HOY, EMIT)).toEqual([ARMAR])
    expect(salidas(ALTA_HOY, ARMAR)).toEqual([STOP])
    expect(salidas(ALTA_HOY, EXECUTE, 0)).toEqual(salidas(ALTA_VIVO, EXECUTE, 0)) // el camino bueno no se toca
    expect(nodo(ALTA_HOY, STOP).parameters.errorType).toBe('errorMessage')
    expect(nodo(ALTA_HOY, ARMAR).type).toBe('n8n-nodes-base.code')
  })
  it('el caso exacto de 141329: el cimiento devolvió el acuse del PDF ⇒ la causa lo dice y muestra qué llegó', () => {
    const { causa } = armar({ ok: false, code: 'invalid_body', detail: 'phase_state must be "started" or "completed"' }, ACUSE_PDF)
    expect(causa).toMatch(/^EL CIMIENTO NO DEVOLVIÓ SU CONTRATO/)
    expect(causa).toContain('"message":"Workflow was started"')
    expect(causa).toMatch(/NO se sabe si el manual se promovió/)
    expect(mensajeDelStop({ causa })).toBe(causa)
  })
  it('el caso de E83: el cimiento MURIÓ (salida de error del Execute) ⇒ la causa es el error real', () => {
    const { causa } = armar({ error: 'LENTE_SIN_SECCION · brand-strategist, editor-en-jefe, jefe-client-success', discovery_package: {} }, 'NO_CORRIO')
    expect(causa).toMatch(/^CIMIENTO MURIÓ · LENTE_SIN_SECCION · brand-strategist/)
    expect(causa).toMatch(/ssLtwYPt7zxuvnM2/)
    const obj = armar({ error: { message: 'timeout 800s' }, discovery_package: {} }, 'NO_CORRIO')
    expect(obj.causa).toMatch(/^CIMIENTO MURIÓ · timeout 800s/)
  })
  it('el cimiento contestó honesto y no promovió ⇒ track_pass · track_published · motivo · ciclos · fuente', () => {
    const { causa } = armar({ ok: true }, { _cimiento_return: true, track_pass: false, track_published: false, track_reason: 'juez_incompleto', track_exhausted: false, _return_source: 'juez_referencia' })
    expect(causa).toBe('CIMIENTO NO PROMOVIDO · track_pass=false · track_published=false · motivo=juez_incompleto · ciclos_agotados=false · fuente=juez_referencia · el manual NO se escribió · retención para revisión humana (nada se despacha).')
  })
  it('nunca sale sin causa: si el Execute no se puede leer, igual es una cadena con motivo · y el Stop tiene respaldo', () => {
    const { causa } = armar({}, 'NO_CORRIO')
    expect(typeof causa).toBe('string')
    expect(causa).toMatch(/NO DEVOLVIÓ SU CONTRATO · llegó \(nada · Node/)
    expect(mensajeDelStop({})).toBe('CIMIENTO NO PROMOVIDO · sin causa legible (E99)')
  })
  it('no cambió nada más: +1 nodo · el resto de nodos y conexiones idénticos', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length + 1)
    for (const v of ALTA_VIVO.nodes) {
      const h = nodo(ALTA_HOY, v.name)
      if (v.name === STOP) continue
      expect(h.parameters, v.name).toEqual(v.parameters)
      expect(h.disabled ?? false, v.name).toBe(v.disabled ?? false)
    }
    for (const [from, c] of Object.entries(ALTA_VIVO.connections)) {
      if (from === EXECUTE || from === EMIT) continue
      expect(ALTA_HOY.connections[from], from).toEqual(c)
    }
    expect(ALTA_HOY.settings.errorWorkflow).toBe('5fkPLbZvQsQa1bcd') // el avisador sigue colgado
  })
})
