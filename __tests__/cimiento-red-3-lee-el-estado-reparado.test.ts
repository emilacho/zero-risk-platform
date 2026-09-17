/**
 * 🔴 E84 · la red 3 del cimiento · lo que mató la bolita (E83 · 2026-09-17 · cimiento 140150 · US$ 2,72).
 *
 * La lente de cliente perdió su respuesta HTTP a los 40 s; la red 1 recuperó 2 de 3; la red 2
 * reintentó bien la tercera. La red 3 leía `secciones` e `_lente` del ítem que le llega, que por el
 * camino del reintento es la respuesta CRUDA del HTTP ⇒ «faltan las TRES» ⇒ paró con las tres en la mano.
 *
 * Datos: la evidencia REAL de la corrida (recortada), no un caso inventado.
 * NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Item = { json: any; pairedItem?: any }
type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: unknown }

const DIR = join(process.cwd(), 'scripts/worker-staging/ssLtwYPt7zxuvnM2')
const ALTA = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu')
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const VIVO = leer(join(DIR, 'cimiento-VIVO-2026-09-17.json')) as Flujo
const HOY = leer(join(DIR, 'cimiento-construido.json')) as Flujo
const EV = leer(join(DIR, 'evidencia-140150-rescate.json')) as { red1_triaje: Item[]; red2_reintento: Item[]; error_real: string }

const RED1 = '[BB] Rescate · red 1 · triaje'
const RED3 = '[BB] Rescate · red 3 · fusionar o PARAR'
const codigo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return String(x.parameters.jsCode)
}

/** corre la red 3 como la corre n8n: $input = lo que le llega · $('red 1') = el triaje */
function red3(jsCode: string, triaje: Item[], entrada: Item[]) {
  const $input = { all: () => entrada }
  const $ = (n: string) => {
    if (n !== RED1) throw new Error(`Node '${n}' hasn't been executed`)
    return { all: () => triaje, first: () => triaje[0] }
  }
  return new Function('$input', '$', jsCode)($input, $) as Array<{ json: any }>
}

const SLUGS = ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']
const seccion = (lens: string) => ({ lens, mision: { valor: `m-${lens}` } })

describe('el rojo · la red 3 publicada (c7c67a95) con la evidencia real de 140150', () => {
  it('es el mismo código que corrió y da por perdidas las TRES lentes', () => {
    expect(() => red3(codigo(VIVO, RED3), EV.red1_triaje, EV.red2_reintento)).toThrow(
      /LENTE_SIN_SECCION · brand-strategist, editor-en-jefe, jefe-client-success/,
    )
    expect(EV.error_real).toMatch(/LENTE_SIN_SECCION · brand-strategist, editor-en-jefe, jefe-client-success/)
  })
})

describe('① el arreglo · la red 3 lee el estado REPARADO', () => {
  it('el caso exacto de 140150: red 2 reintenta ⇒ la red 3 ve las TRES', () => {
    const [out] = red3(codigo(HOY, RED3), EV.red1_triaje, EV.red2_reintento)
    expect(Object.keys(out.json.secciones).sort()).toEqual([...SLUGS].sort())
    expect(out.json.origen).toEqual({ 'brand-strategist': 'http', 'editor-en-jefe': 'http', 'jefe-client-success': 'reintento' })
    expect(out.json.secciones['jefe-client-success']).toEqual(EV.red2_reintento[0].json.brand_section)
    expect(out.json._rescate_ok).toBe(true)
  })

  it('camino directo (no faltaba ninguna): la entrada es el triaje y pasa igual', () => {
    const t: Item[] = [{ json: { secciones: Object.fromEntries(SLUGS.map((s) => [s, seccion(s)])), origen: {}, _faltan: [] } }]
    const [out] = red3(codigo(HOY, RED3), t, t)
    expect(Object.keys(out.json.secciones).sort()).toEqual([...SLUGS].sort())
  })

  it('dos faltantes, respuestas SIN `agent`: se atribuyen por el ítem emparejado, no por adivinanza', () => {
    const base = { secciones: { 'brand-strategist': seccion('brand-strategist') }, origen: { 'brand-strategist': 'http' } }
    const t: Item[] = [
      { json: { ...base, _lente: 'editor-en-jefe' } },
      { json: { ...base, _lente: 'jefe-client-success' } },
    ]
    const e: Item[] = [
      { json: { success: true, brand_section: { mision: 'de-cliente' } }, pairedItem: { item: 1 } },
      { json: { success: true, brand_section: { mision: 'de-editor' } }, pairedItem: { item: 0 } },
    ]
    const [out] = red3(codigo(HOY, RED3), t, e)
    expect(out.json.secciones['editor-en-jefe']).toEqual({ mision: 'de-editor' })
    expect(out.json.secciones['jefe-client-success']).toEqual({ mision: 'de-cliente' })
  })

  it('respuesta con `agent`: manda el agente que contestó', () => {
    const base = { secciones: { 'brand-strategist': seccion('brand-strategist'), 'editor-en-jefe': seccion('editor-en-jefe') }, origen: {} }
    const t: Item[] = [{ json: { ...base, _lente: 'jefe-client-success' } }]
    const e: Item[] = [{ json: { success: true, agent: 'jefe-client-success', brand_section: seccion('jefe-client-success') } }]
    const [out] = red3(codigo(HOY, RED3), t, e)
    expect(out.json.origen['jefe-client-success']).toBe('reintento')
  })

  it('un reintento que FALLA sigue parando ruidoso, y nombra SOLO la que falta', () => {
    const base = { secciones: { 'brand-strategist': seccion('brand-strategist'), 'editor-en-jefe': seccion('editor-en-jefe') }, origen: {} }
    const t: Item[] = [{ json: { ...base, _lente: 'jefe-client-success' } }]
    for (const falla of [{ error: 'terminated' }, { success: false, error: 'agent failed' }, {}]) {
      expect(() => red3(codigo(HOY, RED3), t, [{ json: falla, pairedItem: { item: 0 } }])).toThrow(
        /^LENTE_SIN_SECCION · jefe-client-success · /,
      )
    }
  })

  it('un reintento no pisa una sección que ya estaba', () => {
    const buena = seccion('editor-en-jefe')
    const t: Item[] = [{ json: { secciones: { 'brand-strategist': seccion('brand-strategist'), 'editor-en-jefe': buena }, origen: {}, _lente: 'jefe-client-success' } }]
    const e: Item[] = [
      { json: { agent: 'editor-en-jefe', brand_section: { mision: 'otra' } } },
      { json: { agent: 'jefe-client-success', brand_section: seccion('jefe-client-success') } },
    ]
    const [out] = red3(codigo(HOY, RED3), t, e)
    expect(out.json.secciones['editor-en-jefe']).toBe(buena)
  })

  it('sin triaje legible (red 1 no corrió) no inventa: para', () => {
    const $input = { all: () => [{ json: { brand_section: seccion('jefe-client-success') } }] }
    const $ = () => { throw new Error('no ejecutado') }
    expect(() => new Function('$input', '$', codigo(HOY, RED3))($input, $)).toThrow(/LENTE_SIN_SECCION/)
  })

  it('el construido cambia SÓLO la red 3 respecto del vivo', () => {
    const dif = VIVO.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(HOY.nodes.find((m) => m.name === n.name)))
    expect(dif.map((n) => n.name)).toEqual([RED3])
    expect(HOY.connections).toEqual(VIVO.connections)
    expect(HOY.nodes.length).toBe(VIVO.nodes.length)
  })
})

describe('② el alta que para por el cimiento dice POR QUÉ', () => {
  const STOP = 'Stop and Error · cimiento no promovido'
  const fotos = ['alta-antes-e84-c84f8516.json', 'alta-construida-e84.json'].map((f) => leer(join(ALTA, f)) as Flujo)
  const msg = (f: Flujo) => String(f.nodes.find((n) => n.name === STOP)!.parameters.errorMessage)
  /** evalúa `={{ expr }}` como n8n, con $json y $() simulados */
  const evaluar = (plantilla: string, $json: any, track: any = {}) => {
    const m = plantilla.match(/^=\{\{([\s\S]*)\}\}$/)
    const expr = m ? m[1] : null
    const $ = (n: string) => {
      if (n !== '[JEFATURA] Execute Cimiento Track') throw new Error(n)
      return { first: () => ({ json: track }) }
    }
    if (expr) return String(new Function('$json', '$', `return (${expr})`)($json, $))
    return plantilla.replace(/^=/, '').replace(/\{\{([^}]*)\}\}/g, (_, e) => String(new Function('$json', '$', `return (${e})`)($json, $)))
  }
  const muerte = { client_id: 'x', discovery_package: {}, error: EV.error_real }

  it('el rojo: con el cimiento muerto, el mensaje publicado sale con los campos VACÍOS', () => {
    const s = evaluar(msg(fotos[0]), muerte)
    expect(s).toMatch(/track_pass=undefined · ciclos_agotados=undefined/)
    expect(s).not.toMatch(/LENTE_SIN_SECCION/)
  })

  it('arreglado: la causa real del cimiento viaja en el mensaje (y de ahí al aviso)', () => {
    const s = evaluar(msg(fotos[1]), muerte)
    expect(s).toMatch(/^CIMIENTO MURIÓ · LENTE_SIN_SECCION · brand-strategist, editor-en-jefe, jefe-client-success/)
  })

  it('arreglado: por la rama «cimiento.failed» lee track_pass del cimiento, no de la respuesta del emisor', () => {
    const s = evaluar(msg(fotos[1]), { ok: true, accepted: true }, { track_pass: false, track_exhausted: true })
    expect(s).toMatch(/^CIMIENTO NO PROMOVIDO · track_pass=false · ciclos_agotados=true/)
  })

  it('un error del emisor de fase NO se confunde con la muerte del cimiento', () => {
    const s = evaluar(msg(fotos[1]), { error: 'ingress 500' }, { track_pass: false, track_exhausted: false })
    expect(s).toMatch(/^CIMIENTO NO PROMOVIDO/)
  })

  it('el construido cambia SÓLO ese mensaje', () => {
    const [vivo, hoy] = fotos
    const dif = vivo.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(hoy.nodes.find((m) => m.name === n.name)))
    expect(dif.map((n) => n.name)).toEqual([STOP])
    expect(hoy.connections).toEqual(vivo.connections)
  })
})
