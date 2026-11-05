/**
 * GO de Lenovo tras el doble chequeo (05-nov): lo que corta el plan completo, lo que exige el pre-vuelo, lo que pide el botón y el plan que toma la cadena.
 * $0 · sin red · sin base real · sin modelo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sobreDelPlan } from '../src/lib/manual/pedir-plan'
import { sumaDeTopes } from '../src/lib/planeacion/prevuelo'
import { TOPE_DEL_PLAN_COMPLETO_USD } from '../src/lib/planeacion/mesa/plantilla'
import { planParaLaCadena } from '../src/lib/cadena/almacen-supabase'
import { debePausar } from '../src/lib/finanzas/conversa/orquestador'
import type { CatalogoSnapshot } from '../src/lib/planeacion/dato-v1/catalogo'
import type { EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'

const CLIENTE = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

// ── la vara por plan ───────────────────────────────────────────────────────────────
type Fila = { cost_usd: number; workflow_execution_id?: string | null; trabajo_tipo?: string; trabajo_id?: string }
let filas: Fila[] = []
let fallaLaLecturaDelPlan = false
function supabaseFalso() {
  return {
    from: () => ({
      select: () => {
        const filtros: Array<[string, unknown]> = []
        const q: Record<string, unknown> = {}
        q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
        q.in = () => q
        q.is = () => q
        q.gte = () => Promise.resolve({ data: filas, error: null })
        q.maybeSingle = () => Promise.resolve({ data: null, error: null })
        // la suma del plan se espera sobre los dos `eq`, sin ventana de tiempo
        q.then = (ok: (r: unknown) => unknown) => {
          const delPlan = filtros.some(([c]) => c === 'trabajo_tipo')
          if (delPlan && fallaLaLecturaDelPlan) return Promise.resolve({ data: null, error: { message: 'caida' } }).then(ok)
          return Promise.resolve({ data: filas.filter((f) => filtros.every(([c, v]) => c === 'client_id' || (f as Record<string, unknown>)[c] === v)), error: null }).then(ok)
        }
        return q
      },
    }),
  } as never
}
async function medir(opts: Record<string, unknown>) {
  const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
  const avisos: Array<Record<string, unknown>> = []
  const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, { runId: 'ejecucion-actual', notify: ((a: Record<string, unknown>) => { avisos.push(a) }) as never, ...opts })
  return { r, avisos }
}
const DEL_PLAN = { trabajo_tipo: 'plan', trabajo_id: 'corrida-1' }

describe('el tope del plan completo corta de verdad', () => {
  beforeEach(() => { filas = []; fallaLaLecturaDelPlan = false; process.env.RUN_SPEND_CAP_ENFORCE = 'true'; process.env.RUN_SPEND_CAP_USD = '1000'; delete process.env.PLAN_CAP_USD })
  afterEach(() => { delete process.env.RUN_SPEND_CAP_ENFORCE; delete process.env.RUN_SPEND_CAP_USD })

  it('🔴 son US$ 15', () => { expect(TOPE_DEL_PLAN_COMPLETO_USD).toBe(15) })
  it('🔴 suma todas las ejecuciones de la corrida: ninguna llega sola al tope de ejecución', async () => {
    filas = [0, 1, 2, 3].map((i) => ({ cost_usd: 3.75, workflow_execution_id: `ej-${i}`, ...DEL_PLAN }))
    const { r } = await medir({ trabajo: DEL_PLAN })
    expect(r).toMatchObject({ blocked: true, reason: 'plan_over_cap', plan_cap_usd: 15, plan_spent_usd: 15 })
  })
  it('🔴 por debajo sigue', async () => {
    filas = [{ cost_usd: 14.99, workflow_execution_id: 'ej', ...DEL_PLAN }]
    expect((await medir({ trabajo: DEL_PLAN })).r.blocked).toBe(false)
  })
  it('🔴 lo de otra corrida no cuenta', async () => {
    filas = [{ cost_usd: 40, workflow_execution_id: 'ej', trabajo_tipo: 'plan', trabajo_id: 'otra' }]
    expect((await medir({ trabajo: DEL_PLAN })).r.blocked).toBe(false)
  })
  it('🔴 una llamada que no es de un plan no se frena por esta vara, aunque el plan haya pasado', async () => {
    filas = [{ cost_usd: 40, workflow_execution_id: 'ej', ...DEL_PLAN }]
    expect((await medir({ trabajo: { trabajo_tipo: 'pieza', trabajo_id: 'corrida-1' } })).r.blocked).toBe(false)
    expect((await medir({})).r.blocked).toBe(false)
  })
  it('🔴 si la suma no se puede leer, pasa y avisa: no se inventa un cero en silencio', async () => {
    fallaLaLecturaDelPlan = true
    const { r, avisos } = await medir({ trabajo: DEL_PLAN })
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe('query_error')
    expect(avisos.length).toBeGreaterThan(0)
  })
  it('🔴 la puerta de los empleados le pasa el rótulo de la llamada', () => {
    expect(readFileSync('src/app/api/agents/run-sdk/route.ts', 'utf8')).toMatch(/runId: wfAttr\.workflow_execution_id,[\s\S]{0,160}trabajo: trabajoDeLaLlamada\(body/)
  })
})

// ── lo que exige el pre-vuelo ──────────────────────────────────────────────────────
const TOPES: Record<string, number> = { mesa: 4, analisis: 5, recoleccion: 0.4, oficina: 5, redaccion: 2.5, jefatura: 0.7 }
const snap = { tope: (t: string) => TOPES[t] ?? null } as unknown as CatalogoSnapshot

describe('el pre-vuelo cuenta lo que el plan puede gastar', () => {
  it('🔴 sin mesa ni análisis: una pasada de finanzas', () => { expect(sumaDeTopes(snap)).toBe(8.6) })
  it('🔴 con mesa cuenta la segunda pasada, y el tope del plan pone el límite a lo de los agentes', () => {
    // mesa 4 + oficina 5 × 2 + redacción 2,5 + jefatura 0,7 = 17,2 → corta a 15; más recolección, que no pasa por el freno
    expect(sumaDeTopes(snap, true)).toBe(15.4)
  })
  it('🔴 el análisis va aparte del tope del plan', () => { expect(sumaDeTopes(snap, true, true)).toBe(20.4) })
})

// ── el botón ───────────────────────────────────────────────────────────────────────
describe('el botón pide el plan completo', () => {
  it('🔴 siempre con análisis y chequeo de forma', () => {
    expect(sobreDelPlan({ client_id: CLIENTE, manual_id: 'm1' }).payload).toMatchObject({ force_restart: true, con_analisis: true, validar_forma: true })
  })
})

// ── el plan que toma la cadena ─────────────────────────────────────────────────────
const plan = (id: string, created_at: string, status: string, tag: Record<string, unknown> = {}) => ({ id, client_id: CLIENTE, status, created_at, provenance_tag: tag })
// como quedó Náufrago tras el cierre del 05-nov
const COMO_NAUFRAGO = [
  plan('r3', '2026-11-04T13:49:27Z', 'rejected', { vigente: true }),
  plan('a', '2026-11-04T13:39:14Z', 'draft', { vigente: false, superseded_por: 'r3' }),
  plan('viejo', '2026-11-03T13:18:47Z', 'draft', { vigente: false, superseded_por: 'r3' }),
]

describe('la cadena no arranca sobre un plan rechazado', () => {
  it('🔴 sin plan vigente no toma ninguno: ni el rechazado ni los reemplazados', () => {
    expect(planParaLaCadena(COMO_NAUFRAGO, CLIENTE)).toBeNull()
  })
  it('🔴 con un plan nuevo, toma ese', () => {
    expect(planParaLaCadena([plan('nuevo', '2026-11-06T10:00:00Z', 'draft'), ...COMO_NAUFRAGO], CLIENTE)).toEqual({ plan_id: 'nuevo', fecha: '2026-11-06' })
  })
  it('🔴 la ruta real usa esta regla', () => {
    expect(readFileSync('src/lib/cadena/almacen-supabase.ts', 'utf8')).toContain('return planParaLaCadena(planes, clientId)')
  })
})

// ── la segunda pasada no detiene el plan ───────────────────────────────────────────
describe('una pregunta en la segunda pasada no frena (D4)', () => {
  const encargo = (semilla: Record<string, unknown>) => ({ id: 'e', client_id: 'c', estado: 'en_curso', dry_run: false, semilla }) as unknown as EncargoDeConversa
  const pregunta = { clave: 'whatsapp', texto: '¿Tienes el número de WhatsApp?', recomendacion: 'r', supuesto_si_no_responde: 's', impacto: 'alto', frena_la_firma: true }
  const arts = { acuerdo: { criticos: 1, requiere_ronda_2: true, preguntas_a_emilio: [pregunta], hallazgos: [] } } as never
  it('🔴 la primera pasada sí pausa: es la prueba de control', () => { expect(debePausar(encargo({}), arts)).toBe(true) })
  it('🔴 la segunda pasada no pausa', () => { expect(debePausar(encargo({ segunda_pasada: true }), arts)).toBe(false) })
})
