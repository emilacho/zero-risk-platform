/**
 * PLANEACIÓN · EL MODO SECO LLEGA DE VERDAD A TODO EL FLUJO · pruebas a costo cero · CC#1 · 2026-09-30 · decisión de Emilio.
 * El agujero: el flujo real sólo mandaba `dry_run` a los 3 brazos; el redactor (paga), «Guardar el plan», Drive y la sala NO lo respetaban.
 *
 * 🔴 Cada rojo se prueba contra el defecto real: el mismo caso con el flujo de ANTES tiene que dar el resultado viejo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'X9F0zp6LQ2xGEYVS')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
type Nodo = { name: string; type: string; parameters: Record<string, any>; position: number[] }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; settings: Record<string, unknown> }
const ANTES: Flujo = JSON.parse(readFileSync(join(DIR, 'planeacion-antes-modo-seco-2026-09-30.json'), 'utf8'))
const M = await import(pathToFileURL(join(DIR, 'construir-modo-seco-2026-09-30.mjs')).href)
const { construir, GUARDA, PEDIR, VUELTA, HAY_PLAN, REPETIDA, SECO_IF, SECO_CIERRE } = M
const DESPUES: Flujo = construir(ANTES)
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

/** ejecuta el código de un nodo con el contexto simulado de n8n */
async function correr(js: string, entrada: unknown, refs: Record<string, unknown>) {
  const items = [{ json: entrada }]
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => {
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
  }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', js)($input, $, {}, items[0].json, { id: 'WF' }, { id: '1' })
}
/** evalúa una expresión n8n `={{ … }}` con `$`, `$json`, `$workflow`, `$execution` simulados */
function evaluar(expr: string, ctx: { json?: unknown; sobre?: unknown }) {
  const cuerpo = expr.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
  const $ = (n: string) => { if (n !== 'Webhook · planeacion') throw new Error('nodo no simulado: ' + n); return { first: () => ({ json: { body: ctx.sobre } }) } }
  return new Function('$', '$json', '$workflow', '$execution', 'return (' + cuerpo + ')')($, ctx.json ?? {}, { id: 'WF' }, { id: '9', resumeUrl: 'https://n8n.test/wait/9' })
}
const MANUAL = [{ id: 'm1', gate_outcome: 'paso_la_vara' }]
const guarda = (f: Flujo, dry: unknown, ausente = false) =>
  correr(String(nodo(f, GUARDA).parameters.jsCode), MANUAL[0], { 'Webhook · planeacion': { body: ausente ? { client_id: 'c1' } : { client_id: 'c1', dry_run: dry } } })

describe('① la guarda valida dry_run ANTES de gastar', () => {
  it('ausente ⇒ corre real como hoy (la sala NO lo manda y no se le rompe nada)', async () => {
    const [{ json }] = await guarda(DESPUES, undefined, true)
    expect(json).toMatchObject({ client_id: 'c1', manual_aprobado: true })
  })
  it.each([[true], [false]])('booleano %s ⇒ pasa', async (v) => {
    const [{ json }] = await guarda(DESPUES, v)
    expect(json.manual_aprobado).toBe(true)
  })
  it.each([['"true" (string)', 'true'], ['"false" (string)', 'false'], ['1', 1], ['0', 0], ['null', null], ['objeto', {}], ['"yes"', 'yes']])(
    '🔴 %s ⇒ SE DETIENE con PLANEACION_DRY_RUN_INVALIDO · el flujo de ANTES lo dejaba pasar y pagaba creyendo que era seco',
    async (_n, v) => {
      await expect(guarda(DESPUES, v)).rejects.toThrow(/PLANEACION_DRY_RUN_INVALIDO/)
      const [{ json }] = await guarda(ANTES, v) // ANTES: no valida nada
      expect(json.manual_aprobado).toBe(true)
    },
  )
  it('las reglas de siempre siguen: sin cliente / sin manual / manual no aprobado', async () => {
    const js = String(nodo(DESPUES, GUARDA).parameters.jsCode)
    await expect(correr(js, MANUAL[0], { 'Webhook · planeacion': { body: {} } })).rejects.toThrow(/PLANEACION_SIN_CLIENTE/)
    await expect(correr(js, {}, { 'Webhook · planeacion': { body: { client_id: 'c1' } } })).rejects.toThrow(/PLANEACION_SIN_MANUAL/)
    await expect(correr(js, { id: 'm2', gate_outcome: 'no' }, { 'Webhook · planeacion': { body: { client_id: 'c1' } } })).rejects.toThrow(/PLANEACION_MANUAL_NO_APROBADO/)
  })
})

describe('② el nodo que paga recibe dry_run SIEMPRE explícito', () => {
  const cuerpoDe = (f: Flujo, sobre: Record<string, unknown>) =>
    JSON.parse(evaluar(nodo(f, PEDIR).parameters.jsonBody, { json: { pedido: 'P', cliente_id: 'c1' }, sobre }))
  it('🔴 dry_run:true en el sobre ⇒ el cuerpo del redactor trae dry_run:true · ANTES no traía el campo (por eso pagaba)', () => {
    expect(cuerpoDe(ANTES, { dry_run: true })).not.toHaveProperty('dry_run')
    expect(cuerpoDe(DESPUES, { dry_run: true })).toMatchObject({ dry_run: true, agent: 'campaign-brief-agent', client_id: 'c1' })
  })
  it.each([[{ dry_run: false }], [{}]])('sobre %j ⇒ dry_run:false EXPLÍCITO (nunca ausente: no depende de un valor por defecto)', (sobre) => {
    const c = cuerpoDe(DESPUES, sobre)
    expect(c).toHaveProperty('dry_run', false)
  })
  it('el resto del cuerpo NO cambia (agente, tarea, cliente, workflow, callback, force_restart)', () => {
    const a = cuerpoDe(ANTES, { force_restart: true, dry_run: true }) as Record<string, unknown>
    const d = { ...cuerpoDe(DESPUES, { force_restart: true, dry_run: true }) } as Record<string, unknown>
    delete d.dry_run
    expect(d).toEqual(a)
  })
})

describe('③ el interruptor está ANTES de todo lo que escribe, avisa o paga', () => {
  const hijos = (f: Flujo, n: string, salida?: number) => (f.connections[n]?.main ?? []).flatMap((a, i) => (salida === undefined || salida === i ? a.map((x) => x.node) : []))
  const alcanzables = (f: Flujo, desde: string[], sinAristas: Array<[string, number]> = []) => {
    const vistos = new Set<string>()
    const pila = [...desde]
    while (pila.length) {
      const n = pila.pop()!
      if (vistos.has(n)) continue
      vistos.add(n)
      ;(f.connections[n]?.main ?? []).forEach((a, i) => {
        if (sinAristas.some(([x, s]) => x === n && s === i)) return
        a.forEach((h) => pila.push(h.node))
      })
    }
    return vistos
  }
  // los que PAGAN o ESCRIBEN o AVISAN (medido en el flujo vivo)
  const ESCRIBEN = ['Guardar el plan', 'Plan → Drive (PDF)', 'Cable de vuelta · sala', 'Cable de vuelta · repetida', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', '⑥ AVISO · #alertas', 'Campana · plan sin PDF']

  it('«¿Llegó la vuelta?» va SÓLO al interruptor · verdadero ⇒ cierre en seco · falso ⇒ «¿Hay plan?» como siempre', () => {
    expect(hijos(DESPUES, VUELTA)).toEqual([SECO_IF])
    expect(hijos(DESPUES, SECO_IF, 0)).toEqual([SECO_CIERRE])
    expect(hijos(DESPUES, SECO_IF, 1)).toEqual([HAY_PLAN])
    expect(hijos(ANTES, VUELTA)).toEqual([HAY_PLAN])
  })
  it('🔴 desde el ramal SECO no se alcanza NINGÚN nodo que escriba, suba, avise o pague · el cierre en seco es terminal', () => {
    const desdeSeco = alcanzables(DESPUES, [SECO_CIERRE])
    for (const e of ESCRIBEN) expect(desdeSeco.has(e), e).toBe(false)
    expect(hijos(DESPUES, SECO_CIERRE)).toEqual([])
  })
  it('🔴 con el interruptor y la rama de aviso por repetida CERRADOS en seco, ningún nodo que escriba es alcanzable desde el webhook', () => {
    const sinSeco = alcanzables(DESPUES, ['Webhook · planeacion'], [[SECO_IF, 0], [REPETIDA, 0]])
    // los que sí quedan alcanzables son los del camino REAL (IF falso) · y ése es el único camino
    expect(sinSeco.has(SECO_CIERRE)).toBe(false)
    // …y el único enlace hacia los escritores pasa por «¿Hay plan?», que SÓLO cuelga de la salida FALSA del interruptor
    const padresDe = (n: string) => Object.keys(DESPUES.connections).filter((k) => DESPUES.connections[k].main.some((a) => a.some((h) => h.node === n)))
    expect(padresDe(HAY_PLAN)).toEqual([SECO_IF])
    expect(padresDe('Guardar el plan')).toEqual([HAY_PLAN])
    expect(padresDe('Cable de vuelta · sala')).toEqual(['IF · ¿hay PDF?'])
    // ningún escritor cuelga de otro lado que no sea la cadena que nace en «¿Hay plan?»
    const desdeHayPlan = alcanzables(DESPUES, [HAY_PLAN])
    for (const e of ESCRIBEN.filter((x) => x !== '⑥ AVISO · #alertas' && x !== 'Cable de vuelta · repetida')) expect(desdeHayPlan.has(e), e).toBe(true)
  })
  it('🔴 la rama de aviso por «corrida repetida» (Slack + sala) NO sale en seco · ANTES sí salía', () => {
    const cond = (f: Flujo) => nodo(f, REPETIDA).parameters.conditions.conditions
    expect(cond(ANTES)).toHaveLength(2)
    expect(cond(DESPUES)).toHaveLength(3)
    // se evalúa: repetida = existe plan previo Y no forzado Y no seco
    const es = (f: Flujo, sobre: Record<string, unknown>, id: string | undefined) =>
      cond(f).every((c: { leftValue: string; operator: { operation: string } }, i: number) => {
        const v = evaluar(c.leftValue, { json: { id }, sobre })
        return c.operator.operation === 'exists' ? v !== undefined && v !== null && v !== '' : c.operator.operation === 'true' ? v === true : v === false
      })
    expect(es(ANTES, { dry_run: true }, 'plan-previo')).toBe(true) // ANTES: un ensayo con plan previo AVISABA a #alertas y a la sala
    expect(es(DESPUES, { dry_run: true }, 'plan-previo')).toBe(false)
    expect(es(DESPUES, { dry_run: false }, 'plan-previo')).toBe(true) // real repetida: sigue avisando como siempre
    expect(es(DESPUES, {}, 'plan-previo')).toBe(true)
    expect(es(DESPUES, { forzar: true }, 'plan-previo')).toBe(false)
    expect(es(DESPUES, {}, undefined)).toBe(false)
  })
  it('el interruptor mira el sobre con `=== true` (un «true» string NO enciende el seco… y la guarda ya lo habría detenido)', () => {
    const expr = nodo(DESPUES, SECO_IF).parameters.conditions.conditions[0].leftValue
    expect(evaluar(expr, { sobre: { dry_run: true } })).toBe(true)
    expect(evaluar(expr, { sobre: { dry_run: false } })).toBe(false)
    expect(evaluar(expr, { sobre: {} })).toBe(false)
    expect(evaluar(expr, { sobre: { dry_run: 'true' } })).toBe(false)
  })
})

describe('④ el cierre en seco declara lo que habría pasado y no toca nada', () => {
  const cierre = (v: unknown, sobre: Record<string, unknown> = { client_id: 'c1', dry_run: true }) =>
    correr(String(nodo(DESPUES, SECO_CIERRE).parameters.jsCode), v, { 'Webhook · planeacion': { body: sobre } })
  const llega = { llego_la_vuelta: true, texto: '# PLAN\n\n## Lo que NO se buscó y por qué (lo declara el sistema, no el redactor)\n- x — y\n', caracteres: 90, client_id: 'c1', client_name: 'Náufrago', descartados_declarados: 4 }
  it('con vuelta ⇒ declara escrituras_reales:0, lo que no se escribió y lo que habría guardado/subido/avisado', async () => {
    const [{ json }] = await cierre(llega)
    expect(json).toMatchObject({ seco: true, escrituras_reales: 0, dry_run_enviado_al_nodo_que_paga: true, client_id: 'c1' })
    expect(json.no_se_escribio_en.join(' ')).toMatch(/client_historical_outputs/)
    expect(json.no_se_escribio_en.join(' ')).toMatch(/Drive/)
    expect(json.no_se_escribio_en.join(' ')).toMatch(/sala/)
    expect(json.no_se_escribio_en.join(' ')).toMatch(/#alertas/)
    expect(json.habria_guardado).toMatchObject({ tabla: 'client_historical_outputs', output_type: 'campaign_plan_90d', status: 'draft' })
    expect(json.la_vuelta_del_redactor).toMatchObject({ llego: true, bloque_de_lo_que_no_se_busco: true, descartados_declarados: 4 })
  })
  it('🔴 sin vuelta del redactor ⇒ el ensayo TERMINA EN ERROR con el motivo (no se lee como éxito)', async () => {
    await expect(cierre({ llego_la_vuelta: false, texto: '', motivo: 'se agotó la espera' })).rejects.toThrow(/PLANEACION_SECO_SIN_VUELTA.*se agotó la espera/)
  })
  it('no hace ninguna llamada: el código no usa httpRequest, fetch ni helpers de red', () => {
    const js = String(nodo(DESPUES, SECO_CIERRE).parameters.jsCode)
    expect(js).not.toMatch(/httpRequest|fetch\(|helpers|\$env/)
  })
})

describe('el flujo · sólo cambia lo previsto', () => {
  it('44 nodos (+2) · 3 nodos cambiados · sólo cambia la conexión de «¿Llegó la vuelta?» y las del interruptor', () => {
    expect(DESPUES.nodes).toHaveLength(ANTES.nodes.length + 2)
    const cambiados = DESPUES.nodes.filter((n) => { const a = ANTES.nodes.find((x) => x.name === n.name); return a && JSON.stringify([a.parameters, a.position]) !== JSON.stringify([n.parameters, n.position]) }).map((n) => n.name)
    expect(cambiados.sort()).toEqual([GUARDA, PEDIR, REPETIDA].sort())
    const conexCambiadas = Object.keys(DESPUES.connections).filter((k) => JSON.stringify(DESPUES.connections[k]) !== JSON.stringify(ANTES.connections[k]))
    expect(conexCambiadas.sort()).toEqual([VUELTA, SECO_IF].sort())
    expect(Object.keys(DESPUES.settings)).toEqual(['executionOrder'])
  })
  it('los tres brazos siguen recibiendo dry_run del sobre como antes', () => {
    for (const b of ['Brazo · Apify', 'Brazo · PostHog', 'Brazo · cerebro']) {
      expect(nodo(DESPUES, b).parameters.jsonBody).toBe(nodo(ANTES, b).parameters.jsonBody)
      expect(nodo(DESPUES, b).parameters.jsonBody).toContain('dry_run:')
    }
  })
  it('todo el código compila · y no se puede construir dos veces', () => {
    for (const n of DESPUES.nodes.filter((x) => x.type.endsWith('.code'))) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', String(n.parameters.jsCode)), n.name).not.toThrow()
    }
    expect(() => construir(DESPUES)).toThrow(/ya está construido/)
  })
  it('toda referencia $(…) de los nodos nuevos apunta a un nodo que existe', () => {
    const existen = new Set(DESPUES.nodes.map((n) => n.name))
    for (const nombre of [SECO_IF, SECO_CIERRE, GUARDA, PEDIR, REPETIDA]) {
      const t = JSON.stringify(nodo(DESPUES, nombre).parameters)
      for (const m of t.matchAll(/\$\(\\?["']([^"'\\]+)\\?["']\)/g)) expect(existen.has(m[1]), `${nombre} → ${m[1]}`).toBe(true)
    }
  })
})
