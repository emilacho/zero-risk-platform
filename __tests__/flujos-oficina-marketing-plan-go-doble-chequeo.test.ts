/**
 * 05-nov · GO de Lenovo tras el doble chequeo: una sola cuenta de tiempos alrededor del redactor, en planeación y segunda mitad.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODIGO_MAS, CODIGO_PREPARAR, CODIGO_VALIDAR_ARMAR, CODIGO_VIVA, N_VALIDAR_ARMAR, N_VALIDAR_CERRAR, N_VALIDAR_SI, ESPERA_S, MAX_VUELTAS_DE_MESA, N_BRIEF_VIVA, N_ESTADO, N_MAS, N_OTRA, N_PREPARAR, N_RENOVAR, N_SI_MAS, N_SI_RENUEVA, N_VIVA, RELECTURAS, RELECTURA_S, construirGoDobleChequeo, construirGoDobleChequeoMitad } from '../scripts/ops/oficina-marketing/plan-go-doble-chequeo.mjs'

type Nodo = { name: string; type: string; onError?: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const leer = (n: string) => { const j = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado', n), 'utf8')); return (j.workflow || j) as Flujo }
const PLAN = leer('X9F0zp6LQ2xGEYVS-go-doble-chequeo-ANTES-2026-11-05.json')
const MITAD = leer('mdhgiJeCkLV2bTxL-go-doble-chequeo-ANTES-2026-11-05.json')
const hecho = () => { const f = structuredClone(PLAN); construirGoDobleChequeo(f); return f }
const mitad = () => { const f = structuredClone(MITAD); construirGoDobleChequeoMitad(f); return f }
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const cod = (f: Flujo, n: string) => nodo(f, n).parameters.jsCode as string
const destinos = (f: Flujo, n: string, salida = 0) => (f.connections[n].main[salida] ?? []).map((x: any) => x.node)
const sel = (mapa: Record<string, any>) => (n: string) => {
  if (!(n in mapa)) throw new Error('no corrió: ' + n)
  return { first: () => ({ json: mapa[n] }), last: () => ({ json: mapa[n] }), all: () => [{ json: mapa[n] }] }
}
const ent = (j: unknown) => ({ first: () => ({ json: j }) })
const correr = async (c: string, mapa: Record<string, any>, input: unknown, runIndex = 0) => (await new Function('$', '$input', '$runIndex', 'return (async () => {' + c + '\n})()')(sel(mapa), ent(input), runIndex))[0].json
const WEB = 'Webhook · planeacion'
const SOBRE = { plan_v3: true, corrida: 'r1', client_id: 'c1' }
const MIN = 60_000

describe('el plazo se renueva justo antes de pagar al redactor', () => {
  const prep = (s: unknown, j: unknown = { redactor_elegido: 'e', pedido: 'p', cliente_id: 'c1' }) => correr(CODIGO_PREPARAR, { [WEB]: { body: s } }, j)
  it('arma la renovación y anota la hora, sin perder lo que trae el pedido', async () => {
    const r = await prep(SOBRE)
    expect(r).toMatchObject({ redactor_elegido: 'e', pedido: 'p', cliente_id: 'c1' })
    expect(r.renovar).toEqual({ aplica: true, cuerpo: { accion: 'renovar', client_id: 'c1', corrida: 'r1' } })
    expect(Math.abs(Date.now() - new Date(r.pedido_en).getTime())).toBeLessThan(5000)
  })
  it('sin corrida del plan nuevo no renueva, pero igual anota la hora', async () => {
    for (const s of [{}, { ...SOBRE, plan_v3: false }, { ...SOBRE, corrida: '' }, { ...SOBRE, client_id: 5 }]) {
      const r = await prep(s)
      expect(r.renovar.aplica).toBe(false)
      expect(r.pedido_en).toBeTruthy()
    }
  })
  const viva = (r: unknown) => correr(CODIGO_VIVA, { [N_PREPARAR]: { pedido: 'p' } }, r)
  it('corrida muerta: para en rojo y dice que no pagó', async () => {
    await expect(viva({ statusCode: 409, body: { error: 'corrida_no_viva', estado: 'vencida' } })).rejects.toThrow(/PLAN_CORRIDA_NO_VIVA.*no se pagó.*vencida/)
  })
  it('cualquier otra respuesta sigue, y devuelve el pedido original', async () => {
    for (const r of [{ statusCode: 200, body: { ok: true } }, { statusCode: 409, body: { error: 'otra' } }, { statusCode: 500 }, { statusCode: 400, body: { error: 'corrida_no_viva' } }, { error: { message: 'socket hang up' } }, {}]) {
      expect(await viva(r)).toEqual({ pedido: 'p' })
    }
  })
  it('el cableado: las 3 entradas pasan por preparar, y solo después se pide', () => {
    const f = hecho()
    expect(Object.entries(f.connections).flatMap(([d, c]: any) => (c.main ?? []).flat().filter((x: any) => x?.node === 'Pedir el plan al redactor').map(() => d)).sort()).toEqual([N_SI_RENUEVA, N_VIVA].sort())
    for (const [de, s] of [['Validar · ¿reintenta?', 0], ['② IF · ¿copia · reintentar?', 0], ['Redactor · elegir', 0]] as const) expect(destinos(f, de, s)).toEqual([N_PREPARAR])
    expect(destinos(f, N_PREPARAR)).toEqual([N_SI_RENUEVA])
    expect(destinos(f, N_SI_RENUEVA, 0)).toEqual([N_RENOVAR])
    expect(destinos(f, N_SI_RENUEVA, 1)).toEqual(['Pedir el plan al redactor'])
    expect(destinos(f, N_RENOVAR)).toEqual([N_VIVA])
    expect(destinos(f, N_VIVA)).toEqual(['Pedir el plan al redactor'])
  })
  it('renovar usa la ruta de V9, con su cuerpo y un corte corto, y si falla no tumba', () => {
    const f = hecho(); const n = nodo(f, N_RENOVAR); const v9 = nodo(f, 'V9 · cerrar la corrida')
    expect(n.parameters.url).toBe(v9.parameters.url)
    expect(n.parameters.headerParameters).toEqual(v9.parameters.headerParameters)
    expect(n.parameters.jsonBody).toContain('$json.renovar.cuerpo')
    expect(n.parameters.options.timeout).toBe(60000)
    expect(n.onError).toBe('continueRegularOutput')
    expect(v9.parameters.jsonBody).toContain('$json.cuerpo')
  })
})

describe('la espera y lo que llega tarde', () => {
  const mas = (j: unknown, pasado: number, body: unknown = SOBRE) => correr(CODIGO_MAS, { [WEB]: { body }, 'Redactor · ¿aceptó el pedido?': { esperando_desde: Date.now() - pasado } }, j)
  it('60 min y 2 relecturas de 10', () => {
    const f = hecho()
    expect(ESPERA_S).toBe(3600)
    expect(nodo(f, 'Esperar al redactor').parameters.resumeAmount).toBe(3600)
    expect(nodo(f, N_OTRA).parameters).toMatchObject({ resume: 'timeInterval', amount: RELECTURA_S, unit: 'seconds' })
    expect(RELECTURA_S * RELECTURAS).toBe(1200)
  })
  it('venció sin texto: relee 2 veces más y luego declara', async () => {
    expect((await mas({}, 60 * MIN + 1000)).esperar_mas).toBe(true)
    expect((await mas({}, 70 * MIN + 1000)).esperar_mas).toBe(true)
    expect((await mas({}, 80 * MIN + 1000)).esperar_mas).toBe(false)
  })
  it('la vuelta llegó antes y vacía: no espera más', async () => { expect((await mas({ body: {} }, 15 * MIN)).esperar_mas).toBe(false) })
  it('con texto no espera más', async () => {
    expect((await mas({ body: { response: 'plan' } }, 60 * MIN + 1000)).esperar_mas).toBe(false)
    expect((await mas({ response: 'plan' }, 60 * MIN + 1000)).esperar_mas).toBe(false)
  })
  it('en ensayo no espera más', async () => { expect((await mas({}, 60 * MIN + 1000, { dry_run: true })).esperar_mas).toBe(false) })
  it('sin hora del pedido no espera más', async () => {
    const r = await correr(CODIGO_MAS, { [WEB]: { body: SOBRE } }, {})
    expect(r.esperar_mas).toBe(false)
  })
  it('no pierde lo que trae', async () => { expect(await mas({ body: { response: 'x' } }, 0)).toMatchObject({ body: { response: 'x' } }) })
  it('el cableado: completar → ¿más? → otra espera → relee; si no, a ¿Llegó la vuelta?', () => {
    const f = hecho()
    expect(destinos(f, 'Vuelta · completar')).toEqual([N_MAS])
    expect(destinos(f, N_MAS)).toEqual([N_SI_MAS])
    expect(destinos(f, N_SI_MAS, 0)).toEqual([N_OTRA])
    expect(destinos(f, N_SI_MAS, 1)).toEqual(['¿Llegó la vuelta?'])
    expect(destinos(f, N_OTRA)).toEqual(['Vuelta · leer el punto de control'])
  })
  const completar = (f: Flujo, ack: unknown, pedido: unknown, creado: string) => correr(cod(f, 'Vuelta · completar'), {
    'Esperar al redactor': {}, [WEB]: { body: SOBRE }, 'Pedir el plan al redactor': { ack_timestamp: ack }, [N_PREPARAR]: { pedido_en: pedido },
  }, { statusCode: 200, body: [{ step_status: 'completed', created_at: creado, texto: 'plan tardío', truncado: 'false' }] })
  it('corte dudoso sin acuse: recoge desde la hora del pedido, sin pagar', async () => {
    const r = await completar(hecho(), null, '2026-11-05T10:00:00Z', '2026-11-05T10:30:00Z')
    expect(r.body).toMatchObject({ response: 'plan tardío', recuperada_del_punto_de_control: true })
  })
  it('un texto anterior a este intento no se recoge', async () => {
    const r = await completar(hecho(), null, '2026-11-05T10:00:00Z', '2026-11-05T09:00:00Z')
    expect(r.body).toBeUndefined()
  })
  it('con acuse manda el acuse', async () => {
    const r = await completar(hecho(), '2026-11-05T11:00:00Z', '2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z')
    expect(r.body).toBeUndefined()
  })
})

describe('lo que no arrancó avisa al momento', () => {
  const acuse = (f: Flujo, r: unknown) => correr(cod(f, 'Redactor · ¿aceptó el pedido?'), { [WEB]: { body: SOBRE } }, r)
  it('sin configurar: rechazo aunque traiga upstream_status 0', async () => {
    for (const e of ['agent-runner not configured', 'agent-runner auth not configured']) expect((await acuse(hecho(), { error: e, upstream_status: 0 })).redactor_rechazado).toBe(true)
  })
  it('conexión rechazada: rechazo, con motivo', async () => {
    for (const e of [{ code: 'ECONNREFUSED' }, { message: 'The service refused the connection - perhaps it is offline' }, { code: 'ENOTFOUND' }]) {
      const r = await acuse(hecho(), { error: e })
      expect(r.redactor_rechazado).toBe(true)
      expect(r.detalle).toMatch(/no se pudo conectar/)
    }
  })
  it('el freno no afirma cuál de sus topes fue', async () => {
    const r = await acuse(hecho(), { error: 'cost_cap_exceeded', code: 'E-CAP-150' })
    expect(r.redactor_rechazado).toBe(true)
    expect(r.motivo).toMatch(/freno de gasto/)
    expect(r.motivo).not.toMatch(/24 h/)
  })
  it('lo dudoso sigue esperando y anota desde cuándo', async () => {
    for (const r of [{ error: 'agent-runner timeout' }, { error: 'agent-runner upstream failed', upstream_status: 0 }, { error: { message: 'socket hang up' } }, {}, { accepted: true }]) {
      const s = await acuse(hecho(), r)
      expect(s.redactor_rechazado).toBe(false)
      expect(Math.abs(Date.now() - s.esperando_desde)).toBeLessThan(5000)
    }
  })
})

describe('la mesa llega al acta aunque pase el plazo', () => {
  const MESAS = [
    ['MESA · decidir', { 'MESA · decidir': { encargo_id: 'e' }, 'MESA · armar la semilla': { t0: 1 } }],
    ['MESA · decidir la devolución', { 'MESA · preparar la devolución': { encargo_id: 'e', t0: 1 } }],
  ] as const
  for (const [n, mapa] of MESAS) {
    const c = () => cod(hecho(), n).replace('const ESPERA_MS = 20000', 'const ESPERA_MS = 1')
    it(n + ': con el reloj vencido y un turno en vuelo, sigue', async () => { expect((await correr(c(), mapa, { statusCode: 409, body: { error: 'paso_en_vuelo' } }, 5)).fin).toBe(false) })
    it(n + ': con el reloj vencido y un turno recién hecho, sigue', async () => { expect((await correr(c(), mapa, { statusCode: 200, body: { paso: 'aporte' } }, 5)).fin).toBe(false) })
    it(n + ': el tope de vueltas sí frena', async () => {
      for (const r of [{ statusCode: 409, body: { error: 'paso_en_vuelo' } }, { statusCode: 200, body: {} }]) {
        expect(await correr(c(), mapa, r, MAX_VUELTAS_DE_MESA - 1)).toMatchObject({ fin: false })
        expect(await correr(c(), mapa, r, MAX_VUELTAS_DE_MESA)).toMatchObject({ fin: true, motivo: 'vencido' })
      }
    })
    it(n + ': sin contestar sigue cortando, y el acta se entrega', async () => {
      expect(await correr(c(), mapa, { statusCode: 500 }, 5)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
      expect(await correr(c(), mapa, { statusCode: 200, body: { terminado: true, estado: 'x', acta: 'a' } }, 5)).toMatchObject({ fin: true, acta: 'a' })
    })
  }
  it('el tope de vueltas es 80', () => { expect(MAX_VUELTAS_DE_MESA).toBe(80); expect(cod(hecho(), 'MESA · decidir')).toContain('const MAX_PASOS = 80') })
  it('los plazos de finanzas no se tocan', () => {
    const f = hecho()
    for (const n of ['FIN · decidir', 'FIN2 · decidir']) expect(cod(f, n)).toBe(cod(PLAN, n))
  })
})

describe('un plan sin forma cierra su corrida', () => {
  const armar = (s: unknown) => correr(CODIGO_VALIDAR_ARMAR, { [WEB]: { body: s } }, { parado_en: 'validar_forma', plan_guardado_id: 'p' })
  it('cierra como fallida, con motivo, y no pierde el resumen', async () => {
    const r = await armar(SOBRE)
    expect(r).toMatchObject({ aplica: true, parado_en: 'validar_forma', plan_guardado_id: 'p', cuerpo: { accion: 'cerrar', client_id: 'c1', corrida: 'r1', estado: 'fallida' } })
    expect(r.cuerpo.motivo).toMatch(/chequeo de forma/)
  })
  it('sin corrida del plan nuevo no pretende cerrar', async () => {
    for (const s of [{}, { ...SOBRE, plan_v3: false }, { ...SOBRE, corrida: '' }, { ...SOBRE, client_id: 5 }]) expect((await armar(s)).aplica).toBe(false)
  })
  it('el cableado: resumen → armar → ¿cerrar? → cerrar, con la ruta de V9', () => {
    const f = hecho()
    expect(destinos(f, 'Validar · resumen')).toEqual([N_VALIDAR_ARMAR])
    expect(destinos(f, N_VALIDAR_ARMAR)).toEqual([N_VALIDAR_SI])
    expect(destinos(f, N_VALIDAR_SI, 0)).toEqual([N_VALIDAR_CERRAR])
    expect(nodo(f, N_VALIDAR_CERRAR).parameters.url).toBe(nodo(f, 'V9 · cerrar la corrida').parameters.url)
    expect(nodo(f, N_VALIDAR_CERRAR).parameters.jsonBody).toContain('$json.cuerpo')
    expect(nodo(f, N_VALIDAR_CERRAR).onError).toBe('continueRegularOutput')
  })
})

describe('los dos cables que pidió la plataforma', () => {
  it('el pre-vuelo recibe con_analisis tal como llega, y no lo inventa si no vino', () => {
    const b = nodo(hecho(), 'V9 · pre-vuelo').parameters.jsonBody.replace(/^=\{\{|\}\}$/g, '')
    const pv = (body: unknown) => JSON.parse(new Function('$', 'return ' + b)(sel({ [WEB]: { body } })))
    expect(pv({ client_id: 'c', corrida: 'r', con_analisis: true }).con_analisis).toBe(true)
    expect(pv({ client_id: 'c', corrida: 'r', con_analisis: false }).con_analisis).toBe(false)
    expect('con_analisis' in pv({ client_id: 'c', corrida: 'r' })).toBe(false)
  })
  it('la segunda pasada lo dice en su semilla, y la primera no', () => {
    const f = hecho()
    expect(cod(f, 'FIN2 · armar la semilla')).toContain('semilla.segunda_pasada = true')
    expect(cod(f, 'FIN · armar la semilla')).not.toContain('segunda_pasada')
  })
})

describe('sobre una corrida muerta no se paga', () => {
  const previo = (estado: unknown) => ({
    [N_ESTADO]: estado, [WEB]: { body: SOBRE }, '¿Llegó la vuelta?': { llego_la_vuelta: true, texto: 'plan', client_id: 'no-uuid' }, 'Guardar el plan': { id: 'a', provenance_tag: { x: 1 } },
  })
  const jef = async (estado: unknown) => (await correr(cod(hecho(), 'JEF · armar'), previo(estado), {})).jef
  it('fallida o vencida: no abre, y lo marca', async () => {
    for (const e of ['fallida', 'vencida']) {
      const j = await jef({ statusCode: 200, body: [{ estado: e }] })
      expect(j).toMatchObject({ fase: 'no_abre', corrida_muerta: true })
      expect(j.motivo).toContain(e)
    }
  })
  it('viva, sin fila o sin poder leer: sigue su camino', async () => {
    for (const r of [{ statusCode: 200, body: [{ estado: 'corriendo' }] }, { statusCode: 200, body: [{ estado: 'hecha' }] }, { statusCode: 200, body: [] }, { statusCode: 500, body: [{ estado: 'fallida' }] }, { error: {} }]) {
      expect((await jef(r)).corrida_muerta).toBeUndefined()
    }
  })
  it('lee antes de la jefatura, por cliente y corrida, y una lectura caída no tumba', () => {
    const f = hecho(); const n = nodo(f, N_ESTADO)
    expect(destinos(f, 'Parar · ¿corta aquí?', 1)).toEqual([N_ESTADO])
    expect(destinos(f, N_ESTADO)).toEqual(['JEF · armar'])
    expect(n.parameters.url).toMatch(/plan_corridas\?client_id=eq\..*&corrida=eq\..*select=estado/)
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.parameters.options.timeout).toBe(60000)
  })
  const sobre = (f: Flujo, mapa: Record<string, any>) => correr(cod(f, 'Segunda mitad · sobre'), { 'Ciclo · armar cierres': { sobre: { client_id: 'c1' } }, ...mapa }, {})
  it('la segunda mitad recibe el aviso, y sin dato queda en falso', async () => {
    const f = hecho()
    expect(await sobre(f, { 'JEF · armar': { jef: { corrida_muerta: true } } })).toMatchObject({ client_id: 'c1', corrida_muerta: true, origen: 'planeacion/directo' })
    expect((await sobre(f, { 'JEF · armar': { jef: {} } })).corrida_muerta).toBe(false)
    expect((await sobre(f, {})).corrida_muerta).toBe(false)
  })
  it('la segunda mitad: el aviso pasa por «Sobre», y con corrida muerta se salta solo el parte a la sala', async () => {
    const f = mitad()
    const U = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
    expect((await correr(cod(f, 'Sobre'), {}, { client_id: U, plan_id: U, corrida_muerta: true })).body.corrida_muerta).toBe(true)
    expect((await correr(cod(f, 'Sobre'), {}, { client_id: U, plan_id: U })).body.corrida_muerta).toBe(false)
    const BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
    expect(destinos(f, 'Cable · ¿volvió? · plan').sort()).toEqual([N_BRIEF_VIVA, 'V9 · armar el cierre'].sort())
    expect(destinos(f, N_BRIEF_VIVA, 0)).toEqual([])
    expect(destinos(f, N_BRIEF_VIVA, 1)).toEqual([BRIEF])
    expect(nodo(f, N_BRIEF_VIVA).parameters.conditions.conditions[0].leftValue).toContain("$('Sobre').first().json.body.corrida_muerta === true")
  })
})

describe('el resto queda igual', () => {
  it('no cambia ningún otro nodo', () => {
    const f = hecho(); const toca = new Set(['Esperar al redactor', 'Redactor · ¿aceptó el pedido?', 'Vuelta · completar', 'MESA · decidir', 'MESA · decidir la devolución', 'JEF · armar', 'Segunda mitad · sobre', 'V9 · pre-vuelo', 'FIN2 · armar la semilla'])
    for (const v of PLAN.nodes) if (!toca.has(v.name)) expect(nodo(f, v.name), v.name).toEqual(v)
    expect(f.nodes.length).toBe(PLAN.nodes.length + 11)
  })
  it('todo nodo de código compila', () => {
    for (const f of [hecho(), mitad()]) for (const n of f.nodes) if (n.parameters.jsCode) expect(() => new Function('$', '$input', '$runIndex', '$execution', '$workflow', '$env', '$json', 'return (async () => {' + n.parameters.jsCode + '\n})()'), n.name).not.toThrow()
  })
  it('no aplica a ciegas si el flujo cambió', () => {
    const f = structuredClone(PLAN); nodo(f, 'Esperar al redactor').parameters.resumeAmount = 86400
    expect(() => construirGoDobleChequeo(f)).toThrow(/cambió de forma/)
    const g = structuredClone(PLAN); g.connections['Redactor · elegir'].main[0] = []
    expect(() => construirGoDobleChequeo(g)).toThrow(/cambió de entradas/)
  })
})
