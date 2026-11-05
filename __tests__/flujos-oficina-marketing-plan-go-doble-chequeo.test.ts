/**
 * 05-nov · GO de Lenovo tras el doble chequeo: una sola cuenta de tiempos alrededor del redactor, en planeación y segunda mitad.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOPE_DE_INFORMES_EN_EL_PEDIDO, N_ALTO_CUAL, N_REABRIR, ROJOS, ALTOS, CODIGO_ALTO_ARMAR, CODIGO_ALTO_ROJO, N_ALTO_ARMAR, N_ALTO_CERRAR, N_ALTO_ROJO, N_ALTO_SI, REINTENTOS_DE_TURNO, CODIGO_MAS, CODIGO_PREPARAR, CODIGO_VALIDAR_ARMAR, CODIGO_VIVA, N_VALIDAR_ARMAR, N_VALIDAR_CERRAR, N_VALIDAR_SI, ESPERA_S, MAX_VUELTAS_DE_MESA, N_BRIEF_VIVA, N_ESTADO, N_MAS, N_OTRA, N_PREPARAR, N_RENOVAR, N_SI_MAS, N_SI_RENUEVA, N_VIVA, RELECTURAS, RELECTURA_S, construirGoDobleChequeo, construirGoDobleChequeoMitad } from '../scripts/ops/oficina-marketing/plan-go-doble-chequeo.mjs'

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
    const conFallos = (fallos: number) => ({ ...mapa, [n]: { encargo_id: 'e', fallos } })
    it(n + ': un corte o un 5xx tiene otra oportunidad, hasta 2 veces seguidas', async () => {
      for (const r of [{ statusCode: 500 }, { statusCode: 504 }, { error: { message: 'timeout' } }]) {
        expect(await correr(c(), mapa, r, 5)).toEqual({ fin: false, encargo_id: 'e', fallos: 1 })
        expect(await correr(c(), conFallos(1), r, 6)).toEqual({ fin: false, encargo_id: 'e', fallos: 2 })
        expect(await correr(c(), conFallos(2), r, 7)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
      }
    })
    it(n + ': un rechazo 4xx no se reintenta', async () => {
      for (const statusCode of [400, 401, 404]) expect(await correr(c(), mapa, { statusCode }, 5)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
    })
    it(n + ': el reintento también respeta el tope de vueltas', async () => {
      expect(await correr(c(), mapa, { statusCode: 500 }, MAX_VUELTAS_DE_MESA - 1)).toMatchObject({ fin: false })
      expect(await correr(c(), mapa, { statusCode: 500 }, MAX_VUELTAS_DE_MESA)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
    })
    it(n + ': esperar un turno en vuelo no borra la cuenta de fallos; un turno hecho sí', async () => {
      expect(await correr(c(), conFallos(2), { statusCode: 409, body: { error: 'paso_en_vuelo' } }, 6)).toEqual({ fin: false, encargo_id: 'e', fallos: 2 })
      expect((await correr(c(), conFallos(2), { statusCode: 200, body: { paso: 'aporte' } }, 6)).fallos).toBeUndefined()
    })
    it(n + ': el acta se entrega', async () => {
      expect(await correr(c(), mapa, { statusCode: 200, body: { terminado: true, estado: 'x', acta: 'a' } }, 5)).toMatchObject({ fin: true, acta: 'a' })
    })
  }
  it('el tope de vueltas alcanza para esperar a un empleado en vuelo (35 min)', () => {
    expect(MAX_VUELTAS_DE_MESA).toBe(120)
    expect((MAX_VUELTAS_DE_MESA * 20) / 60).toBeGreaterThan(35)
    expect(cod(hecho(), 'MESA · decidir')).toContain('const MAX_PASOS = 120')
    expect(cod(hecho(), 'MESA · decidir la devolución')).toContain('const MAX_PASOS = 120')
  })
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

describe('los altos deliberados cierran la corrida', () => {
  const armar = (s: unknown, j: unknown = { error: 'PLAN_MESA_SIN_ACTA · la mesa no entregó acta' }) => correr(CODIGO_ALTO_ARMAR, { [WEB]: { body: s } }, j)
  it('cierra como fallida; el motivo sin el código y el error entero para volver a lanzarlo', async () => {
    const r = await armar(SOBRE)
    expect(r.aplica).toBe(true)
    expect(r.mensaje).toBe('PLAN_MESA_SIN_ACTA · la mesa no entregó acta')
    expect(r.cuerpo).toEqual({ accion: 'cerrar', client_id: 'c1', corrida: 'r1', estado: 'fallida', motivo: 'el plan se detuvo: la mesa de estrategia no entregó su acta' })
  })
  it('cada alto dice su razón en palabras de la empresa, sin códigos', async () => {
    for (const [codigo, razon] of [['PLAN_VALIDADOR_NO_LEGIBLE', /chequeo de forma/], ['PLAN_PAUSA_NO_GUARDADA', /guardar la pausa/], ['PLAN_REANUDAR_SIN_MATERIAL', /material guardado/]] as const) {
      const { cuerpo } = await armar(SOBRE, { error: codigo + ' · HTTP 500 [line 4]' })
      expect(cuerpo.motivo).toMatch(razon)
      expect(cuerpo.motivo).not.toMatch(/PLAN_|HTTP|line/)
    }
    expect((await armar(SOBRE, { error: 'PLAN_OTRO · algo raro' })).cuerpo.motivo).toBe('el plan se detuvo: algo raro')
  })
  it('el error que se vuelve a lanzar no acumula la marca de línea', async () => {
    expect((await armar(SOBRE, { error: 'PLAN_X · algo [line 4] [line 1]' })).mensaje).toBe('PLAN_X · algo')
    expect((await armar(SOBRE, { error: 'PLAN_X · algo [line 4] sigue' })).mensaje).toBe('PLAN_X · algo [line 4] sigue')
  })
  it('entiende el error como objeto y no se queda sin mensaje', async () => {
    expect((await armar(SOBRE, { error: { message: 'PLAN_X · algo' } })).mensaje).toBe('PLAN_X · algo')
    expect((await armar(SOBRE, { message: 'otro' })).mensaje).toBe('otro')
    expect((await armar(SOBRE, {})).mensaje).toBe('el plan se detuvo')
  })
  it('sin corrida del plan nuevo no pretende cerrar', async () => {
    for (const s of [{}, { ...SOBRE, plan_v3: false }, { ...SOBRE, corrida: '' }, { ...SOBRE, client_id: 5 }]) {
      const r = await armar(s)
      expect(r.aplica).toBe(false)
      expect(r.cuerpo).toBeNull()
    }
  })
  it('vuelve a lanzar el mismo error, para que el aviso siga llegando', async () => {
    await expect(correr(CODIGO_ALTO_ROJO, { [N_ALTO_ARMAR]: { mensaje: 'PLAN_X · algo' } }, {})).rejects.toThrow('PLAN_X · algo')
  })
  it('son los 4 altos, por su salida de error, y lo que ya hacían sigue igual', () => {
    const f = hecho()
    expect(ALTOS).toEqual(['MESA · cerrar el acta', 'Validar · ¿qué dijo?', 'FIN · la pausa quedó guardada', 'Reanudar · poner el material guardado'])
    for (const a of ALTOS) {
      expect(nodo(f, a).onError).toBe('continueErrorOutput')
      expect(destinos(f, a, 1)).toEqual([N_ALTO_ARMAR])
      expect(destinos(f, a, 0)).toEqual(PLAN.connections[a]?.main[0]?.map((x: any) => x.node) ?? [])
      expect(cod(f, a)).toBe(cod(PLAN, a))
    }
  })
  it('el cableado: armar → ¿cerrar? → cerrar → rojo; sin corrida va directo al rojo', () => {
    const f = hecho()
    expect(destinos(f, N_ALTO_ARMAR)).toEqual([N_ALTO_SI])
    expect(destinos(f, N_ALTO_SI, 0)).toEqual([N_ALTO_CERRAR])
    expect(destinos(f, N_ALTO_SI, 1)).toEqual([N_ALTO_CUAL])
    expect(destinos(f, N_ALTO_CERRAR)).toEqual([N_ALTO_CUAL])
    expect(nodo(f, N_ALTO_CERRAR).parameters.url).toBe(nodo(f, 'V9 · cerrar la corrida').parameters.url)
    expect(nodo(f, N_ALTO_CERRAR).parameters.jsonBody).toContain('$json.cuerpo')
    expect(nodo(f, N_ALTO_CERRAR).onError).toBe('continueRegularOutput')
    expect(nodo(f, N_ALTO_ROJO).onError).toBeUndefined()
  })
  it('son 2 reintentos', () => { expect(REINTENTOS_DE_TURNO).toBe(2) })
})

describe('la mesa con latido', () => {
  const MESAS = [
    ['MESA · decidir', 'MESA · avanzar un paso', { 'MESA · decidir': { encargo_id: 'e' } }],
    ['MESA · decidir la devolución', 'MESA · avanzar la devolución', { 'MESA · preparar la devolución': { encargo_id: 'e', t0: 1 } }],
  ] as const
  for (const [n, h, base] of MESAS) {
    const c = () => cod(hecho(), n).replace('const ESPERA_MS = 20000', 'const ESPERA_MS = 1')
    const mapa = { [n]: { encargo_id: 'e' }, ...base }
    it(h + ' pide el latido, y lo demás de sus cabeceras sigue', () => {
      const v = nodo(hecho(), h).parameters.headerParameters.parameters
      expect(v).toContainEqual({ name: 'x-zr-latido', value: '1' })
      for (const x of nodo(PLAN, h).parameters.headerParameters.parameters) expect(v).toContainEqual(x)
      const { headerParameters: _a, ...resto } = nodo(hecho(), h).parameters
      const { headerParameters: _b, ...antes } = nodo(PLAN, h).parameters
      expect(resto).toEqual(antes)
    })
    it(n + ': un 5xx dentro del cuerpo se vuelve a pedir', async () => {
      expect(await correr(c(), mapa, { statusCode: 200, body: { error: 'turno_cortado', estado_http: 503 } }, 5)).toEqual({ fin: false, encargo_id: 'e', fallos: 1 })
    })
    it(n + ': un 4xx dentro del cuerpo no se repite', async () => {
      expect(await correr(c(), mapa, { statusCode: 200, body: { error: 'x', estado_http: 400 } }, 5)).toMatchObject({ fin: true, motivo: 'sin_contestar' })
    })
    it(n + ': turno en vuelo dentro del cuerpo se espera', async () => {
      expect((await correr(c(), mapa, { statusCode: 200, body: { error: 'paso_en_vuelo', estado_http: 409 } }, 5)).fin).toBe(false)
    })
    it(n + ': un 200 sin cuerpo es una conexión que murió, no un turno hecho', async () => {
      for (const body of ['', '\n\n', undefined]) expect(await correr(c(), mapa, { statusCode: 200, body }, 5)).toEqual({ fin: false, encargo_id: 'e', fallos: 1 })
    })
    it(n + ': el 200 de verdad sigue, y su acta se entrega', async () => {
      expect((await correr(c(), mapa, { statusCode: 200, body: { paso: 'x' } }, 5)).fallos).toBeUndefined()
      expect(await correr(c(), mapa, { statusCode: 200, body: { terminado: true, estado: 'cerrado', acta: 'a' } }, 5)).toMatchObject({ fin: true, acta: 'a' })
    })
  }
})

describe('abrir la mesa tiene otra oportunidad', () => {
  const c = () => cod(hecho(), 'MESA · decidir').replace('const ESPERA_MS = 20000', 'const ESPERA_MS = 1')
  const abierta = { statusCode: 200, body: { encargo_id: 'e' } }
  it('un corte o un 5xx vuelve a pedirla, hasta 2 veces', async () => {
    for (const r of [{ statusCode: 500 }, { statusCode: 504 }, { error: { message: 'x' } }]) {
      expect(await correr(c(), {}, r, 0)).toEqual({ fin: false, reabrir: true, fallos: 1 })
      expect(await correr(c(), { 'MESA · decidir': { reabrir: true, fallos: 1 } }, r, 1)).toEqual({ fin: false, reabrir: true, fallos: 2 })
      expect(await correr(c(), { 'MESA · decidir': { reabrir: true, fallos: 2 } }, r, 2)).toMatchObject({ fin: true, motivo: 'sin_abrir' })
    }
  })
  it('un rechazo no se repite, y la apagada se respeta', async () => {
    expect(await correr(c(), {}, { statusCode: 400, body: {} }, 0)).toMatchObject({ fin: true, motivo: 'sin_abrir' })
    expect(await correr(c(), {}, { statusCode: 409, body: { error: 'mesa_apagada' } }, 0)).toEqual({ fin: true, resultado: 'apagada' })
  })
  it('la vuelta en que abre, sigue con su id, también en el reintento', async () => {
    expect(await correr(c(), {}, abierta, 0)).toEqual({ fin: false, encargo_id: 'e' })
    expect(await correr(c(), { 'MESA · decidir': { reabrir: true, fallos: 1 } }, abierta, 1)).toEqual({ fin: false, encargo_id: 'e' })
  })
  it('ya abierta, una vuelta posterior no vuelve a abrir', async () => {
    expect((await correr(c(), { 'MESA · decidir': { encargo_id: 'e' } }, { statusCode: 500 }, 3)).reabrir).toBeUndefined()
  })
  it('el cableado vuelve a abrir, y abrir lee la semilla de su nodo', () => {
    const f = hecho()
    expect(destinos(f, 'MESA · decidir')).toEqual([N_REABRIR])
    expect(destinos(f, N_REABRIR, 0)).toEqual(['MESA · abrir la mesa'])
    expect(destinos(f, N_REABRIR, 1)).toEqual(['MESA · ¿sigue la reunión?'])
    expect(nodo(f, N_REABRIR).parameters.conditions.conditions[0].leftValue).toBe('={{ $json.reabrir === true }}')
    const b = nodo(f, 'MESA · abrir la mesa').parameters.jsonBody
    expect(b).not.toContain('$json.')
    for (const k of ['client_id', 'dry_run', 'semilla']) expect(b).toContain(k + ": $('MESA · armar la semilla').first().json." + k)
  })
})

describe('cada parada muere en su nodo', () => {
  it('cada código va a su nodo, y uno desconocido al general', () => {
    const f = hecho(); const s = nodo(f, N_ALTO_CUAL)
    const reglas = s.parameters.rules.values
    expect(reglas.map((r: any) => r.conditions.conditions[0].rightValue)).toEqual(Object.keys(ROJOS))
    for (const r of reglas) expect(r.conditions.conditions[0].leftValue).toBe("={{ $('" + N_ALTO_ARMAR + "').last().json.codigo }}")
    Object.values(ROJOS).forEach((n, i) => expect(destinos(f, N_ALTO_CUAL, i)).toEqual([n]))
    expect(destinos(f, N_ALTO_CUAL, Object.keys(ROJOS).length)).toEqual([N_ALTO_ROJO])
    expect(s.parameters.options.fallbackOutput).toBe('extra')
  })
  it('todos vuelven a lanzar el error, sin manejarlo', () => {
    const f = hecho()
    for (const n of [...Object.values(ROJOS), N_ALTO_ROJO]) {
      expect(cod(f, n)).toBe(CODIGO_ALTO_ROJO)
      expect(nodo(f, n).onError).toBeUndefined()
    }
    expect(new Set(Object.values(ROJOS)).size).toBe(4)
  })
  it('el cierre arma el código de la parada', async () => {
    const r = await correr(CODIGO_ALTO_ARMAR, { [WEB]: { body: SOBRE } }, { error: 'PLAN_PAUSA_NO_GUARDADA · algo' })
    expect(r.codigo).toBe('PLAN_PAUSA_NO_GUARDADA')
    expect((await correr(CODIGO_ALTO_ARMAR, { [WEB]: { body: SOBRE } }, { error: 'algo sin código' })).codigo).toBe('')
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

describe('los informes de la mesa de análisis llegan a finanzas y al redactor', () => {
  const FICHA = { id: 'c1', industry: 'bar', country: 'EC', config: {} }
  const hecho1 = (texto: string, tipo = 'competencia') => ({ brazo: 'analisis', estado: 'trajo', objetivo: 'x', fuente: 'mesa', datos: { tipo, agente: 'analista-' + tipo, informe: texto, rotulo: 'propuesta', es_dato_del_cliente: false, citas: ['ficha-1'] } })
  const carpeta = (informes: unknown[]) => ({ brazo: 'cerebro', estado: 'trajo', objetivo: 'y', fuente: 'portero', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'resumen' }, informes } } })
  const vigente = (texto: string, extra: object = {}) => ({ tipo: 'mercado', texto, autor: { mesa: 'analisis', agente: 'a' }, fecha_de_corte: '2026-11-01', citas: ['ficha-2'], ...extra })

  describe('finanzas', () => {
    const semilla = async (material: unknown[]) => (await correr(cod(hecho(), 'FIN · armar la semilla'), { [WEB]: { body: { client_id: 'c1' } }, 'Unir lo del dueño al paquete': { ficha: FICHA, material, descartados: [] } }, {})).semilla
    it('recibe los vigentes y los de esta corrida, marcados como análisis', async () => {
      const s = await semilla([carpeta([vigente('el viejo')]), hecho1('el nuevo')])
      expect(s.informes_de_analisis).toEqual([
        { de: 'vigente del cerebro', tipo: 'mercado', autor: 'a', fecha_de_corte: '2026-11-01', informe: 'el viejo', citas: ['ficha-2'], es_dato_del_cliente: false },
        { de: 'hecho en esta corrida', tipo: 'competencia', autor: 'analista-competencia', informe: 'el nuevo', citas: ['ficha-1'], rotulo: 'propuesta', es_dato_del_cliente: false },
      ])
    })
    it('un autor sin agente queda con su mesa; uno en texto, tal cual; sin autor, nada', async () => {
      const s = await semilla([carpeta([vigente('a', { autor: { mesa: 'analisis' } }), vigente('b', { autor: 'alguien' }), vigente('c', { autor: null })])])
      expect(s.informes_de_analisis.map((i: { autor: unknown }) => i.autor)).toEqual(['analisis', 'alguien', null])
    })
    it('si algo revienta, el plan sigue y queda escrito en la semilla', async () => {
      const malo = { brazo: 'analisis', estado: 'trajo', datos: { informe: { toString() { throw new Error('informe ilegible') } } } }
      const s = await semilla([malo])
      expect(s.informes_de_analisis).toBeUndefined()
      expect(s.informes_de_analisis_fallo).toBe('informe ilegible')
      const largo = { brazo: 'analisis', estado: 'trajo', datos: { informe: { toString() { throw new Error('y'.repeat(1000)) } } } }
      expect((await semilla([largo])).informes_de_analisis_fallo).toBe('y'.repeat(300))
    })
    it('sin problema no deja rastro de fallo', async () => { expect((await semilla([hecho1('x')])).informes_de_analisis_fallo).toBeUndefined() })
    it('avisa si el vigente puede estar atrasado', async () => {
      const s = await semilla([carpeta([vigente('v', { hay_material_nuevo_desde_el_corte: true })])])
      expect(s.informes_de_analisis[0].aviso).toContain('material nuevo')
    })
    it('un informe largo llega entero', async () => {
      const largo = 'x'.repeat(50_000)
      const s = await semilla([hecho1(largo)])
      expect(s.informes_de_analisis[0].informe).toBe(largo)
      expect(s.informes_de_analisis[0].recorte_declarado).toBeUndefined()
    })
    it('justo en el tope no se recorta; por encima se recorta en proporción y se declara', async () => {
      const justo = await semilla([hecho1('a'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO))])
      expect(justo.informes_de_analisis[0].recorte_declarado).toBeUndefined()
      const s = await semilla([hecho1('a'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO * 1.5)), hecho1('b'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO * 0.5), 'mercado')])
      const [a, b] = s.informes_de_analisis
      expect(a.informe.length + b.informe.length).toBeLessThanOrEqual(TOPE_DE_INFORMES_EN_EL_PEDIDO)
      expect(a.informe.length).toBe(TOPE_DE_INFORMES_EN_EL_PEDIDO * 0.75)
      expect(b.informe.length).toBe(TOPE_DE_INFORMES_EN_EL_PEDIDO * 0.25)
      expect(a.recorte_declarado).toContain(a.informe.length + ' de ' + TOPE_DE_INFORMES_EN_EL_PEDIDO * 1.5)
    })
    it('sin informes el campo no aparece, y lo que no es informe no entra', async () => {
      for (const m of [[], [carpeta([])], [carpeta([{ tipo: 'x', texto: '  ' }, null])], [{ ...hecho1('x'), estado: 'sin_dato' }], [hecho1('  ')], [null, { brazo: 'analisis' }]]) expect(await semilla(m)).not.toHaveProperty('informes_de_analisis')
    })
  })

  describe('el redactor', () => {
    const pedido = async (material: unknown[]) => (await correr(cod(hecho(), 'Redactor (B4)'), {}, { ficha: FICHA, material, descartados: [], manual: {}, referencia: 'ref' })).pedido as string
    const FRASE = 'No hay informes de análisis vigentes'
    it('un informe de más de 6.000 llega entero, con sus citas', async () => {
      const t = 'hallazgo '.repeat(2000)
      const q = await pedido([carpeta([]), hecho1(t)])
      expect(q).toContain(t.trim())
      expect(q).toContain('ficha-1')
      expect(q).not.toContain('recorte_declarado')
    })
    it('los demás brazos siguen con su recorte de 2.500', async () => {
      const q = await pedido([{ brazo: 'seo', estado: 'trajo', objetivo: 'o', fuente: 'f', datos: { largo: 'z'.repeat(9000) } }])
      expect(q).not.toContain('z'.repeat(2600))
      expect(q).toContain('z'.repeat(2400))
    })
    it('con informes recién hechos la frase «no hay informes» no sale, y dice dónde están', async () => {
      const q = await pedido([carpeta([]), hecho1('el nuevo')])
      expect(q).not.toContain(FRASE)
      expect(q).toContain('Los de ESTA corrida están más abajo, en TRAJO DATO')
    })
    it('sin informes de ningún tipo la frase sigue saliendo', async () => {
      for (const m of [[carpeta([])], [carpeta([]), { ...hecho1('x'), estado: 'sin_dato', motivo: 'nada' }], [carpeta([]), { ...hecho1(''), estado: 'trajo' }]]) {
        const q = await pedido(m)
        expect(q).toContain(FRASE)
        expect(q).not.toContain('Los de ESTA corrida')
      }
    })
    it('con vigentes no sale ninguna de las dos frases', async () => {
      const q = await pedido([carpeta([vigente('el viejo')]), hecho1('el nuevo')])
      expect(q).not.toContain(FRASE)
      expect(q).not.toContain('Los de ESTA corrida')
    })
    it('la carpeta vacía del cerebro aclara que habla de corridas anteriores, solo si hay informes nuevos', async () => {
      const vacio = { ...carpeta([]), estado: 'sin_dato', motivo: 'ni resumen vivo ni informes vigentes de la mesa de análisis' }
      const OJO = 'eso habla de corridas anteriores'
      expect(await pedido([vacio, hecho1('el nuevo')])).toContain(OJO)
      expect(await pedido([vacio])).not.toContain(OJO)
      expect(await pedido([{ ...hecho1('x'), estado: 'sin_dato', motivo: 'm' }, hecho1('el nuevo', 'mercado')])).not.toContain('m · ojo')
    })
    it('si los informes no caben se recortan en proporción y el pedido lo declara', async () => {
      const q = await pedido([carpeta([]), hecho1('a'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO * 2))])
      expect(q).toContain('este informe llega recortado para caber en el pedido: ' + TOPE_DE_INFORMES_EN_EL_PEDIDO + ' de ' + TOPE_DE_INFORMES_EN_EL_PEDIDO * 2 + ' caracteres')
      expect(q).toContain('a'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO))
      expect(q).not.toContain('a'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO + 1))
    })
    it('los vigentes, que van enteros, gastan primero el tope; en el tope justo nada se recorta', async () => {
      const q = await pedido([carpeta([vigente('v'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO - 100))]), hecho1('b'.repeat(400))])
      expect(q).toContain('v'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO - 100))
      expect(q).toContain('recortado para caber en el pedido: 100 de 400')
      expect(await pedido([carpeta([vigente('v'.repeat(TOPE_DE_INFORMES_EN_EL_PEDIDO - 100))]), hecho1('b'.repeat(100))])).not.toContain('recortado para caber')
    })
  })
})

describe('el resto queda igual', () => {
  it('no cambia ningún otro nodo', () => {
    const f = hecho(); const toca = new Set([...ALTOS, 'FIN · armar la semilla', 'Redactor (B4)', 'MESA · abrir la mesa', 'MESA · avanzar un paso', 'MESA · avanzar la devolución', 'Esperar al redactor', 'Redactor · ¿aceptó el pedido?', 'Vuelta · completar', 'MESA · decidir', 'MESA · decidir la devolución', 'JEF · armar', 'Segunda mitad · sobre', 'V9 · pre-vuelo', 'FIN2 · armar la semilla'])
    for (const v of PLAN.nodes) if (!toca.has(v.name)) expect(nodo(f, v.name), v.name).toEqual(v)
    expect(f.nodes.length).toBe(PLAN.nodes.length + 21)
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
