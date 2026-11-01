/**
 * 01-nov · la vuelta del redactor que no llega por cable se recoge del PUNTO DE CONTROL (corrida corta 209744: el plan se escribió, la ruta de 800 s murió 32 s antes, el flujo dijo «sin plan»). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «Vuelta · leer el punto de control», «Vuelta · completar» y «¿Llegó la vuelta?» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Lo que fija: con la vuelta por cable, todo idéntico a hoy; sin ella, solo un punto de control `completed`, no truncado, con texto y de ESTE pedido rescata el plan;
 * cualquier otra cosa (running, truncado, de un pedido anterior, vacío, lectura caída, ensayo) sigue siendo «sin plan». Nunca se inventa un plan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const ENV = { SALA_DISPATCH_KEY: 'k-sala', SUPABASE_URL: 'https://supa.test' }
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const ACK = '2026-11-01T11:12:00.100Z'
const PLAN = '# Plan de 90 días\n\nPrimera: arreglar el embudo.\n'
const previos = (extra: Record<string, any[]> = {}, body: Record<string, unknown> = { client_id: CLIENTE, dry_run: false }) => ({
  'Webhook · planeacion': [web(body)],
  'Redactor · elegir': [{ redactor_elegido: 'jefe-marketing' }],
  'Pedir el plan al redactor': [{ accepted: true, ack_timestamp: ACK }],
  'Esperar al redactor': [{}],
  ...extra,
})
const punto = (o: Record<string, unknown> = {}) => ({ statusCode: 200, body: [{ step_status: 'completed', created_at: '2026-11-01T11:12:00.042Z', texto: PLAN, truncado: 'false', ...o }] })
const completar = (entrada: any, pv = previos()) => recorrer(nuevo, 'Vuelta · completar', entrada, { previos: pv, env: ENV, hasta: ['¿Llegó la vuelta?'] })

describe('el cableado', () => {
  it('«Esperar al redactor» → leer el punto de control → completar → «¿Llegó la vuelta?» (y nada más entra a «¿Llegó la vuelta?»)', () => {
    const s = (n: string) => (nuevo.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))
    expect(s('Esperar al redactor')).toEqual([['Vuelta · leer el punto de control']])
    expect(s('Vuelta · leer el punto de control')).toEqual([['Vuelta · completar']])
    expect(s('Vuelta · completar')).toEqual([['¿Llegó la vuelta?']])
    const entran = Object.entries(nuevo.connections).filter(([, c]: any) => JSON.stringify(c).includes('"¿Llegó la vuelta?"')).map(([de]) => de)
    expect(entran).toEqual(['Vuelta · completar'])
  })
  it('la lectura pide ESTA ejecución, el redactor elegido y el más reciente, solo el texto', async () => {
    let url = ''
    await recorrer(nuevo, 'Vuelta · leer el punto de control', {}, { previos: previos(), env: ENV, hasta: ['Vuelta · completar'], http: async (u: string) => { url = u; return punto() } })
    expect(url).toContain('https://supa.test/rest/v1/workflow_checkpoints?')
    expect(url).toContain('workflow_execution_id=eq.ex-1')
    expect(url).toContain('step_name=eq.jefe-marketing')
    expect(url).toContain('order=created_at.desc&limit=1')
    expect(url).toContain('texto:output_ref->>response')
  })
})

describe('«Vuelta · completar»', () => {
  it('con la vuelta por cable pasa EXACTAMENTE la entrada del Wait', async () => {
    const orig = { body: { response: 'EL PLAN POR CABLE' } }
    const r = await completar(punto(), previos({ 'Esperar al redactor': [orig] }))
    expect(r.item).toEqual(orig)
  })
  it('sin la vuelta y con el punto de control completo y de este pedido, arma la vuelta', async () => {
    const r = await completar(punto())
    expect(r.item).toEqual({ body: { response: PLAN, recuperada_del_punto_de_control: true } })
  })
  it('en ensayo NO recupera nada', async () => {
    const r = await completar(punto(), previos({}, { client_id: CLIENTE, dry_run: true }))
    expect(r.item).toEqual({})
  })
  const NO = [
    ['paso aún running', punto({ step_status: 'running' })],
    ['paso fallido', punto({ step_status: 'failed' })],
    ['respuesta truncada', punto({ truncado: 'true' })],
    ['sin texto', punto({ texto: '   ' })],
    ['texto nulo', punto({ texto: null })],
    ['de un pedido ANTERIOR (creado 3 min antes del ack)', punto({ created_at: '2026-11-01T11:09:00.000Z' })],
    ['sin filas', { statusCode: 200, body: [] }],
    ['la lectura falló (500)', { statusCode: 500, body: { message: 'x' } }],
    ['cuerpo que no es lista', { statusCode: 200, body: { x: 1 } }],
  ] as const
  for (const [caso, entrada] of NO) it(`${caso} → sigue como hoy (sin plan)`, async () => {
    expect((await completar(entrada as any)).item).toEqual({})
  })
  it('sin ack del pedido no se puede probar que es de este pedido → sin plan', async () => {
    expect((await completar(punto(), previos({ 'Pedir el plan al redactor': [{ accepted: true }] }))).item).toEqual({})
  })
  it('el margen de 10 s deja pasar un punto creado justo antes del ack', async () => {
    expect((await completar(punto({ created_at: '2026-11-01T11:11:55.000Z' }))).item).toEqual({ body: { response: PLAN, recuperada_del_punto_de_control: true } })
    expect((await completar(punto({ created_at: '2026-11-01T11:11:45.000Z' }))).item).toEqual({})
  })
})

describe('«¿Llegó la vuelta?» con lo recuperado', () => {
  const seguir = (entrada: any, completado: any) => recorrer(nuevo, '¿Llegó la vuelta?', entrada, {
    previos: { ...previos(), 'Vuelta · completar': [completado] }, env: ENV, hasta: ['⑤ ¿Modo seco?'],
  })
  it('recuperada: llegó, con el texto y declarándolo', async () => {
    const c = { body: { response: PLAN, recuperada_del_punto_de_control: true } }
    const r = await seguir(c, c)
    expect(r.item).toMatchObject({ llego_la_vuelta: true, vuelta_recuperada: true, motivo: null })
    expect(String(r.item.texto)).toContain('Primera: arreglar el embudo.')
    expect(r.item.registro_interno.vuelta).toContain('recuperada del punto de control')
  })
  it('por cable: llegó y NO se declara recuperada', async () => {
    const c = { body: { response: PLAN } }
    const r = await seguir(c, c)
    expect(r.item).toMatchObject({ llego_la_vuelta: true, vuelta_recuperada: false })
    expect(r.item.registro_interno.vuelta).toBeNull()
  })
  it('espera agotada sin nada que recoger: sigue siendo «no llegó»', async () => {
    const r = await seguir({}, {})
    expect(r.item).toMatchObject({ llego_la_vuelta: false, vuelta_recuperada: false })
    expect(String(r.item.motivo)).toContain('NO llegó')
  })
})
