/**
 * 🔴 E109 · EL MANUAL SE ESCRIBE CON LA MATERIA DEL CLIENTE (sitio + Instagram propio + idioma).
 *
 * Medido en E107 (alta 146532 · cimiento 146544) y confirmado en la versión viva (Paso 0):
 *   1. el Gate de objetivos corría en «todos los ítems» leyendo `$input.item` ⇒ de 2 objetivos pasó sólo el primero
 *      (se perdió instagram_scraper @naufrago.ec);
 *   2. ese primero era `own_web` (apify_function null) y el Servicio Apify lo rechazó («apify_function invalid»);
 *   3. el sitio se leyó (16.006 caracteres) y el paquete al cimiento no llevaba texto alguno ⇒ las lentes sin materia.
 *
 * Fija con los datos REALES de esas corridas (costo cero): el Gate deja pasar todos los válidos y filtra own_web ·
 * el Transform mete `discovery_package.materia_cliente` (sitio con tope · Instagram propio · idioma) · el Fan-out prep
 * del cimiento la pone en el grounding de las tres lentes sin ceder competidores ni resumen · y NADA más cambió.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any>; disabled?: boolean }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const ALTA_VIVO = leer('LyVoKcrypS5uLyuu/alta-antes-e109-ea4a3486.json') as Flujo
const ALTA_HOY = leer('LyVoKcrypS5uLyuu/alta-construida-e109.json') as Flujo
const CIM_VIVO = leer('ssLtwYPt7zxuvnM2/cimiento-antes-e109-36871fc3.json') as Flujo
const CIM_HOY = leer('ssLtwYPt7zxuvnM2/cimiento-construido-e109.json') as Flujo
const EV32 = leer('LyVoKcrypS5uLyuu/evidencia-146532-e109.json') as { nodos: Record<string, any>; split_targets: any[]; gate_out_antes: any[]; calls: any[] }
const EV44 = leer('ssLtwYPt7zxuvnM2/evidencia-146544-e109.json') as { nodos: Record<string, any>; todos: Record<string, any[]> }

const GATE = '[APIFY-WIRE] Gate · drop skip-markers (lazo)'
const TRANSFORM = '[JEFATURA] Transform discovery→package'
const SITIO = 'El texto del sitio, o el hueco'
const CALL = '[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)'
const FANOUT = '[BB] Fan-out prep'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
const codigo = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode)

/** el motor, en miniatura: $('nodo').first()/.all() salen de las salidas REALES grabadas · $input · $json · $workflow · $execution */
function correr(code: string, ctx: { nodos: Record<string, any>; todos?: Record<string, any[]>; input?: any[]; json?: any }) {
  const $ = (n: string) => {
    if (!(n in ctx.nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: ctx.nodos[n] }), all: () => (ctx.todos?.[n] ?? [ctx.nodos[n]]).map((j) => ({ json: j })), item: { json: ctx.nodos[n] } }
  }
  const items = (ctx.input ?? []).map((j) => ({ json: j }))
  const $input = { all: () => items, first: () => items[0], item: items[0] }
  return new Function('$', '$input', '$json', '$workflow', '$execution', code)($, $input, ctx.json ?? items[0]?.json ?? {}, { id: 'LyVoKcrypS5uLyuu' }, { id: '146532' }) as Array<{ json: any }>
}

describe('el rojo · lo que corrió en E107', () => {
  it('Gate (ea4a3486): 2 objetivos entran (own_web · instagram propio) y pasa SÓLO el primero, el own_web', () => {
    expect(EV32.split_targets.map((t) => t.target_label + '/' + t.apify_function)).toEqual(['own:webfetch:naufrago.ec/null', 'own:web:instagram.com/naufrago.ec/instagram_scraper'])
    const out = correr(codigo(ALTA_VIVO, GATE), { nodos: {}, input: EV32.split_targets })
    expect(out.map((o) => o.json.target_label)).toEqual(['own:webfetch:naufrago.ec'])
    expect(EV32.gate_out_antes.map((t) => t.target_label)).toEqual(['own:webfetch:naufrago.ec'])
  })
  it('el Servicio Apify rechazó ese own_web («apify_function invalid») · y el sitio SÍ se había leído (16.006 chars)', () => {
    expect(EV32.calls[0]).toMatchObject({ ok: false, validation_error: true, apify_function: null })
    expect(EV32.calls[0].errors).toContain('apify_function invalid')
    expect(EV32.nodos[SITIO]).toMatchObject({ sitio_estado: 'trajo', sitio_caracteres: 16006, sitio_guardado_en: 'client_web_pages' })
  })
  it('el paquete al cimiento (Transform ea4a3486) no lleva ninguna materia del cliente', () => {
    const pkg = EV32.nodos[TRANSFORM].discovery_package
    expect(Object.keys(pkg)).not.toContain('materia_cliente')
    expect(JSON.stringify(pkg)).not.toMatch(/sitio_texto|instagram_propio|sin voseo/)
  })
})

describe('① + ② el Gate · todos los válidos pasan · own_web no va al Servicio', () => {
  it('con los 2 objetivos reales de 146532 pasa SÓLO instagram_scraper @naufrago.ec', () => {
    const out = correr(codigo(ALTA_HOY, GATE), { nodos: {}, input: EV32.split_targets })
    expect(out.map((o) => o.json.target_label)).toEqual(['own:web:instagram.com/naufrago.ec'])
    expect(out[0].json).toMatchObject({ apify_function: 'instagram_scraper', target_kind: 'own', _discovery_ok: true })
  })
  it('con muchos objetivos: pasan TODOS los que tienen función · los marcados «saltar» no · los own_web no', () => {
    const entrada = [
      { target_label: 'own:webfetch:x', apify_function: null, _discovery_ok: true },
      { target_label: 'own:ig', apify_function: 'instagram_scraper', _discovery_ok: true },
      { target_label: 'comp:ig:a', apify_function: 'instagram_scraper', _discovery_ok: true },
      { target_label: 'comp:tt:b', apify_function: 'tiktok_profile_scraper', _discovery_ok: true },
      { target_label: 'salta', apify_function: 'instagram_scraper', _discovery_ok: false },
      { target_label: 'salta2', apify_function: 'instagram_scraper', _skip_reason: 'x' },
    ]
    const out = correr(codigo(ALTA_HOY, GATE), { nodos: {}, input: entrada })
    expect(out.map((o) => o.json.target_label)).toEqual(['own:ig', 'comp:ig:a', 'comp:tt:b'])
  })
  it('sin objetivos válidos devuelve vacío (no revienta)', () => {
    expect(correr(codigo(ALTA_HOY, GATE), { nodos: {}, input: [] })).toEqual([])
    expect(correr(codigo(ALTA_HOY, GATE), { nodos: {}, input: [{ apify_function: null }] })).toEqual([])
  })
})

describe('③ el Transform · discovery_package.materia_cliente', () => {
  const IG_DATOS = '## Record 1\n- **username**: naufrago.ec\n- **followersCount**: 1228\n- **biography**: 📍Olon · Encebollado y ceviche\n'
  const ctx = (): { nodos: Record<string, any>; todos: Record<string, any[]>; json: any } => ({
    nodos: { ...EV32.nodos, [GATE]: EV32.split_targets[1], [CALL]: { ok: true, apify_function: 'instagram_scraper', datos: IG_DATOS } },
    todos: { [GATE]: [EV32.split_targets[1]], [CALL]: [{ ok: true, apify_function: 'instagram_scraper', datos: IG_DATOS }] },
    json: EV32.nodos['[JEFATURA] Load landscape_summary (canon)'],
  })
  it('con la corrida real: sitio_texto (con tope 3.500 de 16.006) · instagram propio · idioma sin voseo', () => {
    const [out] = correr(codigo(ALTA_HOY, TRANSFORM), ctx())
    const m = out.json.discovery_package.materia_cliente
    expect(m.sitio_estado).toBe('trajo')
    expect(m.sitio_caracteres_total).toBe(16006)
    expect(m.sitio_texto.length).toBe(3500)
    expect(m.sitio_texto).toBe(String(EV32.nodos[SITIO].sitio_texto).slice(0, 3500))
    expect(m.instagram_estado).toBe('trajo')
    expect(m.instagram_propio).toContain('followersCount**: 1228')
    expect(m.idioma).toMatch(/español de Ecuador · sin voseo/)
  })
  it('el resto del paquete es byte-idéntico al de hoy (mismo discovery_package + materia)', () => {
    const [hoy] = correr(codigo(ALTA_HOY, TRANSFORM), ctx())
    const [antes] = correr(codigo(ALTA_VIVO, TRANSFORM), ctx())
    const { materia_cliente: _m, ...pkgHoy } = hoy.json.discovery_package
    expect(pkgHoy).toEqual(antes.json.discovery_package)
    expect({ ...hoy.json, discovery_package: null }).toEqual({ ...antes.json, discovery_package: null })
  })
  it('sin Instagram propio pedido · sin sitio: se declara, no se inventa, y el paquete sale igual', () => {
    const sinIg = ctx(); sinIg.nodos[GATE] = EV32.split_targets[0]; sinIg.todos![GATE] = [EV32.split_targets[0]]; sinIg.nodos[CALL] = EV32.calls[0]; sinIg.todos![CALL] = [EV32.calls[0]]
    const [a] = correr(codigo(ALTA_HOY, TRANSFORM), sinIg)
    expect(a.json.discovery_package.materia_cliente.instagram_estado).toBe('no_pedido')
    expect(a.json.discovery_package.materia_cliente.instagram_propio).toBe('')
    const sinSitio = ctx(); delete sinSitio.nodos[SITIO]
    const [b] = correr(codigo(ALTA_HOY, TRANSFORM), sinSitio)
    expect(b.json.discovery_package.materia_cliente).toMatchObject({ sitio_estado: 'no_disponible', sitio_texto: '' })
  })
})

describe('③ el cimiento · Fan-out prep pone la materia en el grounding de las 3 lentes', () => {
  const materia = { idioma: 'español de Ecuador · sin voseo', sitio_estado: 'trajo', sitio_texto: String(EV32.nodos[SITIO].sitio_texto).slice(0, 3500), sitio_caracteres_total: 16006, instagram_propio: '## Record 1\n- **followersCount**: 1228\n', instagram_estado: 'trajo' }
  const ctx = (conMateria: boolean) => {
    const nodos = JSON.parse(JSON.stringify(EV44.nodos)); const todos = JSON.parse(JSON.stringify(EV44.todos))
    if (conMateria) { nodos['Confirm barato · competitor list'].discovery_package.materia_cliente = materia; todos['Confirm barato · competitor list'][0].discovery_package.materia_cliente = materia }
    return { nodos, todos, json: nodos['[BB] Load ICP (canon)'] }
  }
  it('rojo: con el Fan-out prep de hoy (36871fc3) las lentes NO reciben el sitio aunque el paquete lo traiga', () => {
    const [out] = correr(codigo(CIM_VIVO, FANOUT), ctx(true))
    expect(out.json._grounding_refs.materia_cliente).toBeUndefined()
    expect(out.json.tasks['brand-strategist']).not.toContain('sitio_texto')
  })
  it('verde: las TRES lentes reciben sitio_texto + instagram + idioma · nada cedido · margen positivo', () => {
    const [out] = correr(codigo(CIM_HOY, FANOUT), ctx(true))
    expect(out.json._grounding_refs.materia_cliente).toEqual(materia)
    for (const lente of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      const task = out.json.tasks[lente] as string
      expect(task).toContain('"sitio_texto"')
      expect(task).toContain('followersCount')
      expect(task).toContain('sin voseo')
      expect(task.length).toBeLessThanOrEqual(14000)
    }
    expect(out.json._corte.evidencia_omitida).toEqual([])
    expect(out.json._corte.hubo).toBe(false)
    expect(Math.min(...Object.values(out.json._corte.margen_por_lente as Record<string, number>))).toBeGreaterThan(0)
  })
  it('sin materia (cliente viejo) el grounding sale como hoy · y si la materia no cabe, cede ANTES que competidores y resumen', () => {
    const [sin] = correr(codigo(CIM_HOY, FANOUT), ctx(false))
    expect(sin.json._grounding_refs.materia_cliente).toBeNull()
    const [antes] = correr(codigo(CIM_VIVO, FANOUT), ctx(false))
    const { materia_cliente: _n, ...gSin } = sin.json._grounding_refs
    expect(gSin).toEqual(antes.json._grounding_refs)
    for (const l of Object.keys(antes.json.tasks)) expect((sin.json.tasks[l] as string).replace(',"materia_cliente":null', '')).toBe(antes.json.tasks[l])
    const c = ctx(true); c.nodos['Confirm barato · competitor list'].discovery_package.materia_cliente = { ...materia, sitio_texto: 'x'.repeat(20000) }
    const [grande] = correr(codigo(CIM_HOY, FANOUT), c)
    expect(grande.json._corte.evidencia_omitida).toContain('materia_cliente')
    expect(grande.json._corte.evidencia_omitida).not.toContain('competitors')
    expect(grande.json._corte.evidencia_omitida).not.toContain('discovery_summary')
    expect(codigo(CIM_HOY, FANOUT)).toMatch(/_SACRIFICIO_EV = \['apify_sources', 'materia_cliente', 'competitors', 'discovery_summary'\]/)
  })
})

describe('④ nada más cambió', () => {
  it('alta: 98 nodos · sólo Gate y Transform · conexiones y settings iguales', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length)
    for (const v of ALTA_VIVO.nodes) {
      if (v.name === GATE || v.name === TRANSFORM) continue
      expect(nodo(ALTA_HOY, v.name).parameters, v.name).toEqual(v.parameters)
    }
    expect(nodo(ALTA_HOY, GATE).parameters.mode).toBeUndefined()
    expect(ALTA_HOY.connections).toEqual(ALTA_VIVO.connections)
    expect(ALTA_HOY.settings.errorWorkflow).toBe(ALTA_VIVO.settings.errorWorkflow)
    expect(codigo(ALTA_HOY, TRANSFORM)).toContain(codigo(ALTA_VIVO, TRANSFORM).slice(0, 400)) // la cabecera vieja sigue ahí
  })
  it('cimiento: 30 nodos · sólo Fan-out prep (2 líneas) · lentes, juez, redes y conexiones intactos', () => {
    expect(CIM_HOY.nodes.length).toBe(CIM_VIVO.nodes.length)
    for (const v of CIM_VIVO.nodes) {
      if (v.name === FANOUT) continue
      expect(nodo(CIM_HOY, v.name).parameters, v.name).toEqual(v.parameters)
    }
    expect(CIM_HOY.connections).toEqual(CIM_VIVO.connections)
    const a = codigo(CIM_VIVO, FANOUT).split('\n'), b = codigo(CIM_HOY, FANOUT).split('\n')
    const nuevas = b.filter((l) => !a.includes(l))
    expect(nuevas.length).toBe(3) // comentario + materia_cliente + orden de sacrificio
    expect(a.filter((l) => !b.includes(l)).length).toBe(1) // sólo la línea vieja del orden de sacrificio
  })
})
