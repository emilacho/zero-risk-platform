/**
 * 01-nov · el TURNO de la jefatura (`o8qaF7bI0PKv2XGZ` · zero-risk/jefatura-turno) recoge la vuelta del agente del PUNTO DE CONTROL cuando la del cable no llega
 * (un agente de más de ~13 min termina cuando la ruta que lleva su respuesta ya murió). US$ 0, sin red; se ejecuta el CÓDIGO REAL de los nodos del flujo nuevo.
 * Lo que fija: con la vuelta por cable o con un fallo declarado, todo idéntico a hoy; sin ella, solo un punto de control `completed`, no truncado, con texto y de ESTE pedido
 * rescata la respuesta; cualquier otra cosa sigue siendo «la vuelta llegó vacía». Nunca se inventa una respuesta. Y «② Vuelta» arma el resultado igual con la vuelta recuperada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', 'o8qaF7bI0PKv2XGZ.json'), 'utf8'))
const vivo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vivo', 'o8qaF7bI0PKv2XGZ.json'), 'utf8'))
const ENV = { SUPABASE_URL: 'https://supa.test' }
const ACK = '2026-11-01T11:12:00.100Z'
const TEXTO = '{"respuestas":[{"id":"f1","estado":"tomada","razon":"ok"}]}'
const armado = { revision_id: 'rev-1', turno: { n: 2 }, cuerpo: { agent: 'brand-guardian' } }
const previos = (extra: Record<string, any[]> = {}) => ({
  '② Armar el pedido': [armado],
  '② Agente (run-sdk)': [{ statusCode: 202, body: { accepted: true, ack_timestamp: ACK } }],
  '② Esperar al agente': [{}],
  ...extra,
})
const punto = (o: Record<string, unknown> = {}) => ({ statusCode: 200, body: [{ step_status: 'completed', created_at: '2026-11-01T11:12:00.042Z', texto: TEXTO, truncado: 'false', ...o }] })
const completar = (entrada: any, pv = previos()) => recorrer(nuevo, '② Vuelta · completar', entrada, { previos: pv, env: ENV, hasta: ['② Vuelta'] })

describe('el cableado', () => {
  it('«② Esperar al agente» → leer el punto de control → completar → ¿sigue corriendo? → «② Vuelta» (y nada más entra a «② Vuelta»)', () => {
    const s = (n: string) => (nuevo.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))
    expect(s('② Esperar al agente')).toEqual([['② Vuelta · leer el punto de control']])
    expect(s('② Vuelta · leer el punto de control')).toEqual([['② Vuelta · completar']])
    expect(s('② Vuelta · completar')).toEqual([['② Vuelta · ¿sigue corriendo?']])
    expect(s('② Vuelta · ¿sigue corriendo?')).toEqual([['② Vuelta · esperar un poco'], ['② Vuelta']])
    expect(s('② Vuelta · esperar un poco')).toEqual([['② Vuelta · leer el punto de control']])
    const entran = Object.entries(nuevo.connections).filter(([, c]: any) => JSON.stringify(c).includes('"② Vuelta"')).map(([de]) => de)
    expect(entran).toEqual(['② Vuelta · ¿sigue corriendo?'])
  })
  it('🔴 la lectura NO detiene el camino normal si la base se cae', () => {
    const n = nuevo.nodes.find((x: any) => x.name === '② Vuelta · leer el punto de control')
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.alwaysOutputData).toBe(true)
  })
  it('solo se suman cuatro nodos y lo único que cambia de los de hoy es la espera por el cable: 1800 s → 900 s', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, JSON.stringify(n)]))
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name).sort()).toEqual(['② Vuelta · completar', '② Vuelta · esperar un poco', '② Vuelta · leer el punto de control', '② Vuelta · ¿sigue corriendo?'])
    expect(nuevo.nodes.filter((n: any) => v.has(n.name) && v.get(n.name) !== JSON.stringify(n)).map((n: any) => n.name)).toEqual(['② Esperar al agente'])
    const e = (g: any) => g.nodes.find((n: any) => n.name === '② Esperar al agente').parameters
    expect(e(vivo).resumeAmount).toBe(1800)
    expect(e(nuevo)).toEqual({ ...e(vivo), resumeAmount: 900 })
    expect(nuevo.nodes.length).toBe(vivo.nodes.length + 4)
  })
  it('la lectura pide ESTA ejecución, el agente del pedido y el más reciente, solo el texto', async () => {
    let url = ''
    await recorrer(nuevo, '② Vuelta · leer el punto de control', {}, { previos: previos(), env: ENV, hasta: ['② Vuelta · completar'], http: async (u: string) => { url = u; return punto() } })
    expect(url).toContain('https://supa.test/rest/v1/workflow_checkpoints?')
    expect(url).toContain('workflow_execution_id=eq.ex-1')
    expect(url).toContain('step_name=eq.brand-guardian')
    expect(url).toContain('order=created_at.desc&limit=1')
    expect(url).toContain('texto:output_ref->>response')
  })
})

describe('«② Vuelta · completar»', () => {
  it('con la vuelta por cable pasa EXACTAMENTE la entrada del Wait', async () => {
    const orig = { body: { response: 'POR CABLE', cost_usd: 0.4 } }
    const r = await completar(punto(), previos({ '② Esperar al agente': [orig] }))
    expect(r.item).toEqual(orig)
  })
  it('un fallo declarado del agente (success:false) NO se rescata: sigue como hoy', async () => {
    const orig = { body: { success: false, error: 'tope', partial: true } }
    const r = await completar(punto(), previos({ '② Esperar al agente': [orig] }))
    expect(r.item).toEqual(orig)
  })
  it('sin la vuelta y con el punto de control completo y de este pedido, arma la vuelta', async () => {
    const r = await completar(punto())
    expect(r.item).toEqual({ body: { response: TEXTO, recuperada_del_punto_de_control: true } })
  })
  it('el ack puede venir sin envoltorio', async () => {
    const r = await completar(punto(), previos({ '② Agente (run-sdk)': [{ accepted: true, ack_timestamp: ACK }] }))
    expect(r.item.body.recuperada_del_punto_de_control).toBe(true)
  })
  const NO: Array<[string, any]> = [
    ['paso aún running', punto({ step_status: 'running' })],
    ['paso fallido', punto({ step_status: 'failed' })],
    ['truncado', punto({ truncado: 'true' })],
    ['sin texto', punto({ texto: '   ' })],
    ['de un pedido anterior (creado 5 min antes del ack)', punto({ created_at: '2026-11-01T11:07:00.000Z' })],
    ['la lectura devolvió error de la base', { statusCode: 500, body: { message: 'x' } }],
    ['la lectura cayó (error de red)', { error: { message: 'ECONNRESET' } }],
    ['sin filas', { statusCode: 200, body: [] }],
  ]
  it.each(NO)('%s: no se rescata nada', async (_n, entrada) => {
    const r = await completar(entrada)
    expect(r.item).toEqual({})
  })
  it('sin ack_timestamp del pedido no se puede probar que sea de este pedido: no se rescata', async () => {
    const r = await completar(punto(), previos({ '② Agente (run-sdk)': [{ statusCode: 202, body: { accepted: true } }] }))
    expect(r.item).toEqual({})
  })
})

describe('«② Vuelta» con la vuelta recuperada', () => {
  it('arma el mismo resultado que con la del cable (texto, sin error), sin costo reportado', async () => {
    const r = await recorrer(nuevo, '② Vuelta', { body: { response: TEXTO, recuperada_del_punto_de_control: true } }, { previos: previos(), env: ENV, hasta: ['③ Registrar el resultado'] })
    expect(r.item.resultado_body).toMatchObject({ accion: 'resultado', revision_id: 'rev-1', n: 2, texto: TEXTO, costo_usd: 0 })
    expect(r.item.resultado_body.error).toBeUndefined()
  })
})

describe('«¿sigue corriendo?» · si al despertar el agente sigue corriendo, se espera y se relee (tope 8)', () => {
  const corriendo = { statusCode: 200, body: [{ step_status: 'running', created_at: '2026-11-01T11:12:00.042Z', texto: null, truncado: null }] }
  const decide = (completo: any, lectura: any, veces = 0) => recorrer(nuevo, '② Vuelta · ¿sigue corriendo?', completo, {
    previos: previos({ '② Vuelta · completar': [completo], '② Vuelta · leer el punto de control': [lectura], '② Vuelta · ¿sigue corriendo?': Array.from({ length: veces }, () => ({})) }),
    env: ENV, hasta: ['② Vuelta', '② Vuelta · leer el punto de control'],
  })
  it('espera agotada, sin vuelta y el paso sigue «running»: espera un poco y vuelve a leer', async () => {
    const r = await decide({}, corriendo)
    expect(r.pasos).toEqual(['② Vuelta · ¿sigue corriendo?', '② Vuelta · esperar un poco', '② Vuelta · leer el punto de control'])
  })
  it('con la vuelta por cable, con un fallo declarado o ya rescatada: sigue a «② Vuelta» sin esperar', async () => {
    for (const c of [{ body: { response: 'POR CABLE' } }, { body: { success: false, error: 'tope' } }, { body: { response: TEXTO, recuperada_del_punto_de_control: true } }]) {
      const r = await decide(c, corriendo)
      expect(r.pasos).toEqual(['② Vuelta · ¿sigue corriendo?', '② Vuelta'])
    }
  })
  it.each([['completed', punto()], ['failed', punto({ step_status: 'failed' })], ['sin filas', { statusCode: 200, body: [] }], ['la lectura cayó', { error: { message: 'ECONNRESET' } }], ['error de la base', { statusCode: 500, body: { message: 'x' } }]])('el paso está en %s: no espera más', async (_n, lectura) => {
    const r = await decide({}, lectura)
    expect(r.pasos).toEqual(['② Vuelta · ¿sigue corriendo?', '② Vuelta'])
  })
  it('el tope: a la octava relectura deja de esperar y sigue a «② Vuelta» (que dirá «llegó vacía»)', async () => {
    expect((await decide({}, corriendo, 7)).pasos[1]).toBe('② Vuelta · esperar un poco')
    expect((await decide({}, corriendo, 8)).pasos).toEqual(['② Vuelta · ¿sigue corriendo?', '② Vuelta'])
  })
  it('la espera entre lecturas es de 2 minutos', () => {
    expect(nuevo.nodes.find((n: any) => n.name === '② Vuelta · esperar un poco').parameters).toEqual({ resume: 'timeInterval', amount: 120, unit: 'seconds' })
  })
})
