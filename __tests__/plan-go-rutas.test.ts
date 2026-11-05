/**
 * 05-nov · correcciones de CC7 a #928: las rutas y los lectores REALES sobre una tabla en memoria que respeta columnas y filtros. Sin base, sin n8n, sin Slack.
 * Parte de esta prueba es de CC7 (`raw/qa/2026-11-05-cert-928/zz928-rutas.test.ts`): cierra el hueco de rutas que dejaban las pruebas de lógica.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { almacenDeCorridas, sigueVivaEnN8n } from '../src/lib/planeacion/corridas-supabase'
import { MAX_PRORROGAS, PRORROGA_MIN, TECHO_DE_CORRIDA_MIN } from '../src/lib/planeacion/corridas'
import { temasDescartadosPorElDueno } from '../src/lib/direccion/decisiones'
import { loDescartoElDueno } from '../src/lib/direccion/decisiones-registro'
import { esperasDeFinanzas } from '../src/lib/finanzas/conversa/esperas-supabase'
import { cifrasDelCorte } from '../src/lib/run-sdk-spend-gate'

type Fila = Record<string, unknown>

/** una tabla en memoria: solo devuelve las columnas pedidas (una columna que no se pidió llega vacía, como en la base) */
function tabla(filas: Fila[], o: { error?: string } = {}) {
  const pedidas: string[] = []
  const consulta = () => {
    const f: Array<(x: Fila) => boolean> = []
    let cambios: Fila | null = null, columnas = '*'
    const res = () => {
      if (o.error) return { data: null, error: { message: o.error } }
      const l = filas.filter((x) => f.every((p) => p(x)))
      if (cambios) l.forEach((x) => Object.assign(x, cambios))
      pedidas.push(columnas)
      return { data: l.map((x) => (columnas === '*' ? { ...x } : Object.fromEntries(columnas.split(',').map((c) => [c.trim(), x[c.trim()]])))), error: null }
    }
    const q: Record<string, unknown> = {
      select: (c?: string) => { columnas = c ?? '*'; return q },
      update: (c: Fila) => { cambios = c; return q },
      limit: () => q,
      eq: (c: string, v: unknown) => { f.push((x) => x[c] === v); return q },
      in: (c: string, v: unknown[]) => { f.push((x) => v.includes(x[c])); return q },
      lt: (c: string, v: string) => { f.push((x) => String(x[c]) < v); return q },
      gte: (c: string, v: string) => { f.push((x) => Date.parse(String(x[c])) >= Date.parse(v)); return q },
      then: (a: (r: unknown) => unknown, b?: (e: unknown) => unknown) => Promise.resolve(res()).then(a, b),
    }
    return q
  }
  return { from: () => consulta(), pedidas } as never
}

const memoria = vi.hoisted(() => ({ filas: [] as Record<string, unknown>[], avisos: [] as string[], prevuelo: null as Record<string, unknown> | null }))
vi.mock('@/lib/supabase', async () => ({ getSupabaseAdmin: () => tabla(memoria.filas) }))
vi.mock('@/lib/portero-alimenta/avisos', () => ({ avisarAAlertas: () => async (t: string) => { memoria.avisos.push(t); return { ok: true, detalle: '' } } }))
vi.mock('@/lib/planeacion/prevuelo', () => ({ prevuelo: async (e: Record<string, unknown>) => { memoria.prevuelo = e; return { decision: 'correr' } } }))
vi.mock('@/lib/planeacion/prevuelo-supabase', () => ({ puertosDeSupabase: () => ({}) }))

const pedir = (b: unknown) => new Request('http://x/r', { method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(b) })
const n8n = (n: number) => vi.fn(async () => new Response(JSON.stringify({ data: n ? [{ id: 1 }] : [] }), { status: 200 }))
const VIEJA = '2020-01-01T00:00:00.000Z'

beforeEach(() => {
  memoria.filas.length = 0; memoria.avisos.length = 0; memoria.prevuelo = null
  process.env.INTERNAL_API_KEY = 'k'; process.env.N8N_BASE_URL = 'http://n8n'; process.env.N8N_API_KEY = 'l'
  memoria.filas.push({ id: 'i1', client_id: 'c', corrida: 'k', estado: 'corriendo', espera_desde: VIEJA, vence_en: VIEJA, intentos: 0, motivo: null, dry_run: false, actualizado_en: VIEJA, prorrogas: 0 })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('las cifras del GO', () => {
  it('🔴 techo 180 min, prórrogas de 30, hasta 4', () => {
    expect(TECHO_DE_CORRIDA_MIN).toBe(180)
    expect(PRORROGA_MIN).toBe(30)
    expect(MAX_PRORROGAS).toBe(4)
  })
})

describe('el pre-vuelo por su ruta real', () => {
  const llamar = async (extra: Fila) => {
    const { POST } = await import('../src/app/api/planeacion/prevuelo/route')
    const r = await POST(pedir({ client_id: 'c', corrida: 'k', dry_run: false, ...extra }))
    expect(r.status).toBe(200)
    return memoria.prevuelo
  }
  it('🔴 el análisis llega a la cuenta', async () => { expect((await llamar({ con_analisis: true }))?.con_analisis).toBe(true) })
  it('🔴 sin pedirlo, no aparece', async () => { expect(await llamar({})).not.toHaveProperty('con_analisis') })
})

describe('el barrido por su ruta real', () => {
  it('🔴 n8n vivo prorroga y cuenta; a la quinta libera y avisa una vez', async () => {
    const { POST } = await import('../src/app/api/planeacion/corrida/barrer/route')
    const t = n8n(1); vi.stubGlobal('fetch', t)
    for (let i = 1; i <= 4; i++) {
      const j = await (await POST(pedir({}))).json()
      expect(j.prorrogadas).toEqual(['i1'])
      expect(memoria.filas[0].prorrogas).toBe(i)
      expect(memoria.filas[0].estado).toBe('corriendo')
      memoria.filas[0].vence_en = VIEJA
    }
    const urls = t.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(urls.some((u: string) => u.includes('status=running'))).toBe(true)
    expect(urls.some((u: string) => u.includes('status=waiting'))).toBe(true)
    const j = await (await POST(pedir({}))).json()
    expect(j.falladas).toEqual(['i1'])
    expect(memoria.filas[0].estado).toBe('fallida')
    expect(memoria.avisos).toHaveLength(1)
  })
  it('🔴 n8n sin nada libera sin alarma; n8n caído libera con alarma', async () => {
    const { POST } = await import('../src/app/api/planeacion/corrida/barrer/route')
    vi.stubGlobal('fetch', n8n(0)); await POST(pedir({}))
    expect(memoria.filas[0].estado).toBe('fallida')
    expect(memoria.avisos).toHaveLength(0)
    Object.assign(memoria.filas[0], { estado: 'corriendo' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 }))); await POST(pedir({}))
    expect(memoria.filas[0].estado).toBe('fallida')
    expect(memoria.avisos).toHaveLength(1)
  })
})

describe('renovar y cerrar por su ruta real', () => {
  it('🔴 renovar alarga; sobre una fallida da 409; la entrega tardía avisa una sola vez y no reabre', async () => {
    const { POST } = await import('../src/app/api/planeacion/corrida/route')
    const r = await POST(pedir({ accion: 'renovar', client_id: 'c', corrida: 'k' }))
    expect(r.status).toBe(200)
    expect(Date.parse(String(memoria.filas[0].vence_en))).toBeGreaterThan(Date.now() + 170 * 60_000)
    memoria.filas[0].estado = 'fallida'; memoria.filas[0].motivo = 'sin cierre'
    expect((await POST(pedir({ accion: 'renovar', client_id: 'c', corrida: 'k' }))).status).toBe(409)
    expect((await POST(pedir({ accion: 'cerrar', client_id: 'c', corrida: 'k', estado: 'hecha' }))).status).toBe(409)
    expect(memoria.avisos).toHaveLength(1)
    expect(memoria.filas[0].estado).toBe('fallida')
    await POST(pedir({ accion: 'cerrar', client_id: 'c', corrida: 'k', estado: 'hecha' }))
    expect(memoria.avisos).toHaveLength(1)
  })
})

describe('la pregunta a n8n', () => {
  const respuestas = (...r: Array<[number, unknown]>) => { let i = 0; return (async () => { const [status, cuerpo] = r[i++]; return new Response(JSON.stringify(cuerpo), { status }) }) as unknown as typeof fetch }
  const preguntar = (traer: typeof fetch) => sigueVivaEnN8n({ base: 'http://n8n', llave: 'l', traer })()
  it('🔴 una mitad con error no se lee como «sin nada»', async () => { expect(await preguntar(respuestas([200, { data: [] }], [500, { data: [] }]))).toBeNull() })
  it('🔴 una mitad con respuesta rara no se lee, aunque la otra diga que sigue viva', async () => { expect(await preguntar(respuestas([200, { data: [{ id: 1 }] }], [200, { raro: true }]))).toBeNull() })
  it('🔴 una ejecución en espera cuenta como viva', async () => { expect(await preguntar(respuestas([200, { data: [] }], [200, { data: [{ id: 1 }] }]))).toBe(true) })
})

describe('el almacén de corridas', () => {
  it('🔴 la fila vencida trae sus prórrogas: sin ellas no tendrían tope', async () => {
    memoria.filas[0].prorrogas = 3
    const [f] = await almacenDeCorridas(tabla(memoria.filas)).vivasVencidas(new Date().toISOString())
    expect(f.prorrogas).toBe(3)
  })
  it('🔴 anotar la entrega tardía solo toca una corrida fallida', async () => {
    const P = almacenDeCorridas(tabla(memoria.filas))
    memoria.filas[0].estado = 'hecha'; memoria.filas[0].motivo = 'bien'
    expect(await P.anotarEntregaTardia!('c', 'k', 'tardía')).toBe(false)
    expect(memoria.filas[0].motivo).toBe('bien')
    memoria.filas[0].estado = 'fallida'
    expect(await P.anotarEntregaTardia!('c', 'k', 'tardía')).toBe(true)
    expect(memoria.filas[0].motivo).toBe('tardía')
  })
})

describe('lo que el dueño descartó, con el lector real', () => {
  const ABRIO = '2026-11-05T10:00:00.000Z', DESPUES = '2026-11-05T10:30:00.000Z'
  const DE_EMILIO = 'Emilio la descartó en Tu oficina'
  const fila = (tema: string, o: Fila = {}) => ({ client_id: 'c', tema, estado: 'obsoleta', obsoleta_en: DESPUES, motivo_descarte: DE_EMILIO, ...o })
  const leer = (filas: Fila[], temas: string[]) => temasDescartadosPorElDueno(tabla(filas), 'c', temas, ABRIO)

  it('🔴 la de esta espera, descartada por Emilio, cuenta', async () => { expect(await leer([fila('a')], ['a'])).toEqual(['a']) })
  it('🔴 con la fecha justa de abrir, también', async () => { expect(await leer([fila('a', { obsoleta_en: ABRIO })], ['a'])).toEqual(['a']) })
  it('🔴 lo archivado antes de abrir la espera no cuenta: es el caso real del 04-nov', async () => {
    expect(await leer([fila('comision_pedidosya', { obsoleta_en: '2026-11-04T19:00:00.000Z' })], ['comision_pedidosya'])).toEqual([])
  })
  it('🔴 lo que archivó el sistema no es del dueño, aunque nombre a Emilio', async () => {
    expect(await leer([fila('a', { motivo_descarte: 'las preguntas dejaron Slack y se contestan en Tu oficina (firma de Emilio, 04-nov)' }), fila('b', { motivo_descarte: 'el dueño ya contestó esta pregunta' })], ['a', 'b'])).toEqual([])
  })
  it('🔴 otra estado, otro cliente u otro tema no cuentan', async () => {
    expect(await leer([fila('a', { estado: 'pendiente' }), fila('b', { client_id: 'otro' }), fila('z')], ['a', 'b'])).toEqual([])
  })
  it('🔴 una lectura fallida lanza: no es «no descartó nada»', async () => {
    await expect(temasDescartadosPorElDueno(tabla([], { error: 'caída' }), 'c', ['a'], ABRIO)).rejects.toThrow(/caída/)
  })
  it('🔴 sin fecha de la espera, lanza: no adivina', async () => {
    await expect(temasDescartadosPorElDueno(tabla([fila('a')]), 'c', ['a'], '')).rejects.toThrow(/desde cuándo/)
  })
  it('🔴 el almacén lee la fecha de la espera y se la pasa al lector', async () => {
    const espera = { id: 'e', client_id: 'c', tipo: 'finanzas', clave: 'finanzas:enc', estado: 'esperando', sobre: {}, despertar_intentos: 0, actualizado_en: ABRIO, creado_en: ABRIO }
    const f = await esperasDeFinanzas(tabla([espera])).delEncargo('enc')
    expect(f?.creado_en).toBe(ABRIO)
    const P = esperasDeFinanzas(tabla([fila('a'), fila('b', { obsoleta_en: VIEJA })]))
    expect(await P.temasDescartados?.('c', ['a', 'b'], ABRIO)).toEqual(['a'])
  })
  it('🔴 la regla es una sola: la misma del registro de Tu oficina', () => {
    expect(loDescartoElDueno('Emilio la descartó en Tu oficina: no aplica')).toBe(true)
    expect(loDescartoElDueno('archivada, firma de Emilio')).toBe(false)
    expect(loDescartoElDueno(null)).toBe(false)
  })
})

describe('el mensaje del corte', () => {
  it('🔴 el corte del plan dice sus cifras, no las de 24 h', () => {
    const c = cifrasDelCorte({ blocked: true, reason: 'plan_over_cap', cap_usd: 30, spent_usd: 9, plan_cap_usd: 15, plan_spent_usd: 15.2 })
    expect(c).toMatchObject({ reason: 'plan_over_cap', cap_usd: 15, spent_usd: 15.2 })
    expect(c.detail).toContain('plan completo')
    expect(c.detail).not.toContain('24h')
  })
  it('🔴 el corte de 24 h sigue igual', () => {
    expect(cifrasDelCorte({ blocked: true, reason: 'over_cap', cap_usd: 30, spent_usd: 31 } as never).detail).toBe('§150 spend cap · client cumulative $31.00 >= cap $30.00 (24h window) · invocation blocked')
  })
})
