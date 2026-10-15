/**
 * Intento 1 de la oficina financiera (PEDIDO-CC2-a-CC1-arreglo-intento-1 · 16-oct): `FINANZAS_RUN_SDK_BASE` no existe en producción y los 3 turnos dieron `modelo_no_configurado` (0 gasto).
 * Ahora la base tiene respaldo: FINANZAS_RUN_SDK_BASE → ZERO_RISK_API_URL → producción. US$ 0: `fetch` simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baseFalsa } from './_helpers/base-falsa-finanzas'
import { baseDeRunSdk, modeloRunSdk } from '../src/lib/finanzas/conversa/modelo-run-sdk'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))
import { POST } from '../src/app/api/finanzas/conversa/route'

const LLAVE = 'llave-interna-de-prueba-base'
const CLIENTE = 'prueba-finanzas-seco-local-con-entrega'
const PRODUCCION = 'https://zero-risk-platform.vercel.app'
const ENV0 = { ...process.env }

async function llamar(cuerpo: unknown) {
  const r = await POST(new Request('http://local/api/finanzas/conversa', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': LLAVE }, body: JSON.stringify(cuerpo) }))
  return { status: r.status, json: (await r.json().catch(() => null)) as any }
}
/** abre un encargo, avanza el paso de código y el primer turno de agente; devuelve las URL a las que salió el modelo */
async function primerTurno(): Promise<{ urls: string[]; error: string | undefined }> {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ error: 'x' }), { status: 503 }) }))
  const a = await llamar({ accion: 'abrir', client_id: CLIENTE, dry_run: true, semilla: { evento: 'mensaje', dias_activos_por_semana: 5 } })
  await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, workflow_id: 'wf-cadena-de-prueba', workflow_execution_id: 'ex-1' })
  await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, workflow_id: 'wf-cadena-de-prueba', workflow_execution_id: 'ex-1' })
  const l = await llamar({ accion: 'leer', encargo_id: a.json.encargo_id })
  return { urls, error: l.json.turnos.find((t: { paso: string }) => t.paso === 'planteo')?.error }
}

beforeEach(() => {
  h.db = baseFalsa({ estado: 'ensayo', clientes_ensayo: [CLIENTE], preguntas_slack: 'apagado', conversa: 'ensayo' }).db
  process.env.INTERNAL_API_KEY = LLAVE
  delete process.env.FINANZAS_RUN_SDK_BASE
  delete process.env.ZERO_RISK_API_URL
  delete process.env.SALA_DISPATCH_KEY
})
afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV0 } })

describe('baseDeRunSdk (pura)', () => {
  it('orden: FINANZAS_RUN_SDK_BASE → ZERO_RISK_API_URL → producción; vacío o espacios no cuentan', () => {
    expect(baseDeRunSdk({})).toBe(PRODUCCION)
    expect(baseDeRunSdk({ FINANZAS_RUN_SDK_BASE: '  ', ZERO_RISK_API_URL: '' })).toBe(PRODUCCION)
    expect(baseDeRunSdk({ ZERO_RISK_API_URL: 'https://api.ejemplo.invalid' })).toBe('https://api.ejemplo.invalid')
    expect(baseDeRunSdk({ FINANZAS_RUN_SDK_BASE: 'https://propia.invalid', ZERO_RISK_API_URL: 'https://api.ejemplo.invalid' })).toBe('https://propia.invalid')
  })
  it('el adaptador sigue exigiendo llave y fetch (la base ya no es lo que falta)', async () => {
    const sinLlave = await modeloRunSdk({ base: baseDeRunSdk({}), llave: undefined, fetch: vi.fn() as never, workflow_id: 'wf-x' }).invocar({ agente: 'a', tarea: 't', client_id: 'c', ejecucion_id: 'e' } as never)
    expect(sinLlave).toMatchObject({ ok: false, error: 'modelo_no_configurado' })
  })
})

describe('por la ruta real: con las dos variables vacías el modelo SÍ sale a run-sdk', () => {
  it('sin FINANZAS_RUN_SDK_BASE ni ZERO_RISK_API_URL: llama a «…/api/agents/run-sdk» de producción y el turno ya NO dice modelo_no_configurado', async () => {
    const r = await primerTurno()
    expect(r.urls).toEqual([`${PRODUCCION}/api/agents/run-sdk`])
    expect(r.error).toBe('run_sdk_503')
    expect(r.error).not.toMatch(/modelo_no_configurado/)
  })
  it('con ZERO_RISK_API_URL puesta, la usa', async () => {
    process.env.ZERO_RISK_API_URL = 'https://api.ejemplo.invalid/'
    const r = await primerTurno()
    expect(r.urls).toEqual(['https://api.ejemplo.invalid/api/agents/run-sdk'])
  })
  it('con FINANZAS_RUN_SDK_BASE puesta, gana esa', async () => {
    process.env.ZERO_RISK_API_URL = 'https://api.ejemplo.invalid'
    process.env.FINANZAS_RUN_SDK_BASE = 'https://propia.invalid'
    const r = await primerTurno()
    expect(r.urls).toEqual(['https://propia.invalid/api/agents/run-sdk'])
  })
  it('mutación: sin el respaldo (solo FINANZAS_RUN_SDK_BASE) el mismo escenario quedaría en modelo_no_configurado', async () => {
    const mutante = (env: Record<string, string | undefined>) => env.FINANZAS_RUN_SDK_BASE // la versión de ayer
    const r = await modeloRunSdk({ base: mutante({}), llave: LLAVE, fetch: vi.fn() as never, workflow_id: 'wf-x' }).invocar({ agente: 'a', tarea: 't', client_id: 'c' } as never)
    expect(r).toMatchObject({ ok: false, error: 'modelo_no_configurado' })
    // y el real, con el mismo entorno vacío, sí tiene base
    expect(baseDeRunSdk({})).not.toBe('')
  })
})
