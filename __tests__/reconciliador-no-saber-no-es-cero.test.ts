/**
 * Tests · el reconciliador de colgados · «no pude leer» NO es «cero colgados».
 *
 * 🔴 EL ROJO · medido en producción el 2026-09-16 (E60 · CC#3):
 *
 *   flujo nKEU5hx0O2eMtJYP · corrida 139378 · status success
 *     Query waiting execs  →  {"message":"'X-N8N-API-KEY' header required"}
 *     Find stuck (>20min)  →  ($input.first().json.data) || []  →  stuck_count 0
 *   30 de 30 corridas del día en verde · nunca vio nada y nunca lo dijo.
 *
 * NO toca producción · el decisor se corre desde el retrato congelado · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; onError?: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }

const DIR = join(process.cwd(), 'scripts/worker-staging/nKEU5hx0O2eMtJYP')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Flujo
const VIVO = leer('reconciliador-VIVO-2026-09-16.json')
const HOY = leer('reconciliador-construido.json')

const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta el nodo ${n}`)
  return x
}

/** corre un Code node de n8n con `$input` y `$('nodo')` simulados */
function correr(jsCode: string, entrada: unknown, nodos: Record<string, unknown> = {}) {
  const $input = { first: () => ({ json: entrada }) }
  const $ = (n: string) => {
    if (!(n in nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: nodos[n] }) }
  }
  return new Function('$input', '$', jsCode)($input, $) as Array<{ json: any }>
}

const SIN_LLAVE = { statusCode: 401, body: { message: "'X-N8N-API-KEY' header required" } }
const decidir = (entrada: unknown, nodos: Record<string, unknown> = {}) =>
  correr(nodo(HOY, 'Find stuck (>20min)').parameters.jsCode, entrada, nodos)[0].json

describe('el rojo · la versión viva convierte el error en cero', () => {
  it('con el 401 del motor declara 0 colgados (lo que pasaba)', () => {
    const [r] = correr(nodo(VIVO, 'Find stuck (>20min)').parameters.jsCode, SIN_LLAVE.body)
    expect(r.json.stuck_count).toBe(0)
  })
})

describe('① un fallo de lectura es «no sé», nunca un cero', () => {
  const casos: Array<[string, unknown]> = [
    ['401 sin llave (respuesta completa)', SIN_LLAVE],
    ['sin llave, cuerpo suelto (sin respuesta completa)', SIN_LLAVE.body],
    ['500 del motor', { statusCode: 500, body: { message: 'boom' } }],
    ['error de red · onError continúa', { error: { message: 'ETIMEDOUT' } }],
    ['200 sin lista', { statusCode: 200, body: { foo: 1 } }],
    ['200 con cuerpo vacío', { statusCode: 200, body: '' }],
    ['más de una página · lectura parcial', { statusCode: 200, body: { data: [], nextCursor: 'abc' } }],
  ]
  for (const [nombre, entrada] of casos) {
    it(nombre, () => {
      const v = decidir(entrada)
      expect(v.estado).toBe('NO_SE_PUDO_LEER')
      expect(v.lectura_ok).toBe(false)
      expect(v.stuck_count).toBeNull()
    })
  }

  it('nombra la causa medida en esa corrida', () => {
    expect(decidir(SIN_LLAVE).que_hacer).toContain('N8N_API_KEY')
    expect(decidir({ statusCode: 500, body: { message: 'boom' } }).detalle).toContain('500')
  })

  it('lectura sana · cero colgados de verdad', () => {
    const v = decidir({ statusCode: 200, body: { data: [{ id: '1', startedAt: new Date().toISOString() }] } })
    expect(v).toMatchObject({ estado: 'SIN_COLGADOS', lectura_ok: true, grita: false, stuck_count: 0 })
  })

  it('lectura sana · colgado de verdad grita siempre', () => {
    const viejo = new Date(Date.now() - 45 * 60000).toISOString()
    const v = decidir({ statusCode: 200, body: { data: [{ id: '9', workflowId: 'w', startedAt: viejo }] } })
    expect(v).toMatchObject({ estado: 'HAY_COLGADOS', grita: true, stuck_count: 1 })
  })
})

describe('③④ cuándo grita el «no sé» · una vez al día, sin interruptor', () => {
  const conHora = (iso: string, fn: () => void) => {
    const Real = Date
    // @ts-expect-error reloj fijo sólo para este caso
    globalThis.Date = class extends Real {
      constructor(...a: any[]) { super(...((a.length ? a : [iso]) as [])) }
      static now() { return new Real(iso).getTime() }
    }
    try { fn() } finally { globalThis.Date = Real }
  }

  it('13:00 UTC grita', () => conHora('2026-09-17T13:00:02Z', () => expect(decidir(SIN_LLAVE).grita).toBe(true)))
  it('13:14 UTC grita (tolera retraso del reloj)', () => conHora('2026-09-17T13:14:59Z', () => expect(decidir(SIN_LLAVE).grita).toBe(true)))
  it('13:15 UTC no grita (una sola vuelta)', () => conHora('2026-09-17T13:15:00Z', () => expect(decidir(SIN_LLAVE).grita).toBe(false)))
  it('resto del día no grita', () => conHora('2026-09-17T19:45:00Z', () => expect(decidir(SIN_LLAVE).grita).toBe(false)))

  it('forzar_aviso se lee de la PUERTA, no de $input', () => {
    conHora('2026-09-17T19:45:00Z', () => {
      expect(decidir(SIN_LLAVE, { 'Puerta · preguntar a pedido': { body: { forzar_aviso: true } } }).grita).toBe(true)
      expect(decidir({ ...SIN_LLAVE, forzar_aviso: 'true' }).grita).toBe(false)
    })
  })

  it('no existe perilla para callarlo · ni settings ni staticData', () => {
    const code = (nodo(HOY, 'Find stuck (>20min)').parameters.jsCode as string)
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/settings|getWorkflowStaticData|\$env|\$vars/)
    // y el flujo no lee ninguna fila: la única consulta es al motor
    expect(HOY.nodes.filter((n) => n.type.endsWith('httpRequest')).map((n) => n.name))
      .toEqual(['Query waiting execs', 'AVISO · #alertas'])
  })
})

describe('② la corrida que no leyó NO termina en verde', () => {
  const cierre = () => nodo(HOY, 'Cierre · no saber no es verde').parameters.jsCode as string

  it('no leyó y no gritó · lanza', () => {
    const v = { estado: 'NO_SE_PUDO_LEER', lectura_ok: false, grita: false, detalle: 'x', por_que_grita: 'y' }
    expect(() => correr(cierre(), {}, { 'Find stuck (>20min)': v })).toThrow(/NO SE PUDO LEER/)
  })
  it('no leyó y gritó bien · lanza igual', () => {
    const v = { estado: 'NO_SE_PUDO_LEER', lectura_ok: false, grita: true, detalle: 'x', por_que_grita: 'y' }
    expect(() => correr(cierre(), {}, { 'Find stuck (>20min)': v, 'AVISO · #alertas': { ok: true } })).toThrow(/NO SE PUDO LEER/)
  })
  it('Slack contestó ok:false · el aviso no llegó · lanza', () => {
    const v = { estado: 'HAY_COLGADOS', lectura_ok: true, grita: true }
    expect(() => correr(cierre(), {}, { 'Find stuck (>20min)': v, 'AVISO · #alertas': { ok: false, error: 'not_in_channel' } })).toThrow(/NO llego/)
  })
  it('leyó y no hay colgados · verde', () => {
    const v = { estado: 'SIN_COLGADOS', lectura_ok: true, grita: false, por_que_grita: 'n' }
    expect(correr(cierre(), {}, { 'Find stuck (>20min)': v })[0].json.estado).toBe('SIN_COLGADOS')
  })
})

describe('el cableado', () => {
  it('la consulta sigue ante un fallo de red y trae el código HTTP', () => {
    const q = nodo(HOY, 'Query waiting execs')
    expect(q.onError).toBe('continueRegularOutput')
    expect(q.parameters.options.response.response).toMatchObject({ neverError: true, fullResponse: true })
  })
  it('avisa por #alertas, como el vigía', () => {
    expect(nodo(HOY, 'AVISO · #alertas').parameters.jsonBody).toContain('C0B7XUUEBHA')
  })
  it('las dos ramas del «¿Grita?» terminan en el cierre', () => {
    const c = HOY.connections
    expect(c['¿Grita?'].main[0][0].node).toBe('AVISO · #alertas')
    expect(c['¿Grita?'].main[1][0].node).toBe('Cierre · no saber no es verde')
    expect(c['AVISO · #alertas'].main[0][0].node).toBe('Cierre · no saber no es verde')
  })
  it('el reloj de 15 min queda igual', () => {
    expect(nodo(HOY, 'Every 15 min')).toEqual(nodo(VIVO, 'Every 15 min'))
  })
})
