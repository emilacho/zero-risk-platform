/**
 * 05-nov (GO de Lenovo, «informes disponibles») · los informes REALES de la corrida 210273 del 01-nov, tal como los escribieron los analistas (traza de Braintrust).
 *   · retención: citó las fichas que leyó en el resumen vivo; ese día la consulta no le trajo fichas y sus citas no contaban. Esto fija el arreglo: las fichas del resumen cuentan.
 *   · escucha de X: «sin dato» honesto, porque el cerebro no tiene nada de X. No es una falla y no se archiva.
 *   · y un solo informe de mercado por corrida: el paso 0 se apaga solo si la mesa corre para ese cliente.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ANALISTAS, armarMaterial, cuerpoDelInforme, leerInforme } from '../src/lib/planeacion/mesa-de-analisis'
import { brazoAnalisis } from '../src/lib/planeacion/brazos'
import { conUnSoloMercado, pedirPlanDelManual, sobreDelPlan } from '../src/lib/manual/pedir-plan'
import { esPasoFueraDelCorteDelPlan } from '../src/lib/run-sdk-spend-gate'

const RETENCION = readFileSync('__tests__/fixtures/mesa-de-analisis/informe-retencion-210273.md', 'utf8')
const ESCUCHA_X = readFileSync('__tests__/fixtures/mesa-de-analisis/informe-escucha-x-210273.md', 'utf8')
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const cortosDe = (t: string) => [...new Set([...t.matchAll(/ficha:([0-9a-f]{8})/g)].map((m) => m[1]))]
const completo = (c: string) => `${c}-0000-4000-8000-000000000000`
const cuerpo = (tipo: 'retencion' | 'escucha_x', informe: ReturnType<typeof leerInforme>) => cuerpoDelInforme({ client_id: C, analista: ANALISTAS[tipo], informe, fecha_de_corte: '2026-11-01T16:32:00Z', workflow_id: 'w', workflow_execution_id: 'e' })

describe('retención: se pagaba y no se archivaba', () => {
  const sinFichas = (ids: string[] | undefined) => armarMaterial({ resumen_vivo: 'RESUMEN VIVO', fichas: [], ids_del_resumen: ids })

  it('🔴 la causa: sin fichas de la consulta y sin contar las del resumen, sus 7 hallazgos no se sostienen y no hay qué archivar', () => {
    const leido = leerInforme(RETENCION, ANALISTAS.retencion, sinFichas(undefined).ids)
    expect(leido).toMatchObject({ hallazgos: 0, lineas_sin_sosten: 7, citas: [] })
    expect(cuerpo('retencion', leido)).toBeNull()
  })
  it('🔴 el arreglo: las fichas que cita el resumen vivo cuentan, y el mismo informe se archiva', () => {
    const leido = leerInforme(RETENCION, ANALISTAS.retencion, sinFichas(cortosDe(RETENCION).map(completo)).ids)
    expect(leido).toMatchObject({ hallazgos: 7, lineas_sin_sosten: 0, declara_sin_dato: false })
    expect(cuerpo('retencion', leido)?.citas).toHaveLength(cortosDe(RETENCION).length)
  })
  it('🔴 hoy además le llegan las métricas, las reseñas y las horas de más gente', () => {
    expect(ANALISTAS.retencion.clases).toBe('horas_de_mas_gente,metrica,resenas')
  })
})

describe('escucha de X: «sin dato» honesto, no una falla', () => {
  it('🔴 no cuenta sus viñetas de «qué habría que mirar» como hallazgos y no se archiva', () => {
    const leido = leerInforme(ESCUCHA_X, ANALISTAS.escucha_x, ['036f1bcd-7b99-4e1a-99a8-f8d7e6953e0b'])
    expect(leido).toMatchObject({ hallazgos: 0, declara_sin_dato: true })
    expect(cuerpo('escucha_x', leido)).toBeNull()
  })
  it('🔴 la mesa lo dice como falta de material, no como que no se miró', async () => {
    const archivar = vi.fn()
    const pedido = brazoAnalisis({
      objetivo: 'informe de escucha_x', fuente: 'prueba', tipo: 'escucha_x', agente: ANALISTAS.escucha_x.agente, rotulo: 'r', dry_run: false, esperados: { min: 3, max: 8 },
      pedir: async () => ({ ok: true, salida: ESCUCHA_X, costo_usd: 0.13 }),
      leer: (s: string) => leerInforme(s, ANALISTAS.escucha_x, []), archivar,
    } as never)
    const r = (await pedido) as unknown as Record<string, unknown>
    expect(r.estado).toBe('sin_dato')
    expect(String(r.motivo)).toMatch(/sin material de X todavía.*no es una falla/)
    expect(archivar).not.toHaveBeenCalled()
  })
})

describe('un solo informe de mercado por corrida', () => {
  const sobre = sobreDelPlan({ client_id: C, manual_id: 'm1' })
  const encendida = async () => ({ encendida: true, clientes: [C] })
  const mercado = (s: Record<string, unknown>) => (s.payload as Record<string, unknown>).con_mercado

  it('🔴 con la mesa encendida para este cliente, el paso 0 no se pide: lo trae el analista de la mesa', async () => {
    expect(mercado(await conUnSoloMercado(sobre, encendida))).toBe(false)
  })
  it('🔴 con la mesa apagada, o encendida para otro cliente, el paso 0 sigue: ningún cliente se queda sin informe de mercado', async () => {
    for (const config of [undefined, null, { encendida: false, clientes: [C] }, { encendida: true, clientes: ['otro'] }]) {
      expect(mercado(await conUnSoloMercado(sobre, async () => config)), JSON.stringify(config)).toBeUndefined()
    }
  })
  it('🔴 si la palanca no se puede leer, el paso 0 sigue', async () => {
    const errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mercado(await conUnSoloMercado(sobre, async () => { throw new Error('base caída') }))).toBeUndefined()
    expect(errorDeConsola).toHaveBeenCalled()
    errorDeConsola.mockRestore()
  })
  it('🔴 si la base no contesta, no se queda colgado: el paso 0 sigue', async () => {
    vi.useFakeTimers()
    const errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = conUnSoloMercado(sobre, () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(5000)
    expect(mercado(await p)).toBeUndefined()
    errorDeConsola.mockRestore()
    vi.useRealTimers()
  })
  it('🔴 lo que pide quien dispara manda, y sin análisis ni se lee la palanca', async () => {
    const leer = vi.fn(encendida)
    const conPedido = (p: Record<string, unknown>) => ({ ...sobre, payload: { ...(sobre.payload as object), ...p } })
    expect(mercado(await conUnSoloMercado(conPedido({ con_mercado: true }), leer))).toBe(true)
    expect(mercado(await conUnSoloMercado(conPedido({ con_analisis: false }), leer))).toBeUndefined()
    expect(leer).not.toHaveBeenCalled()
  })
  it('🔴 el sobre que de verdad sale a la sala lo lleva, con la misma clave', async () => {
    const f = vi.fn(async (_u: string, _i: { body: string }) => new Response(JSON.stringify({ ok: true, kind: 'accepted', event_id: 'e1' }), { status: 200 }))
    await pedirPlanDelManual({ client_id: C, manual_id: 'm1' }, { url: 'https://x', llave: 'k', fetchImpl: f as never, leerConfig: encendida })
    const salio = JSON.parse(f.mock.calls[0][1].body) as Record<string, unknown>
    expect(mercado(salio)).toBe(false)
    expect(salio.idempotency_key).toBe(sobre.idempotency_key)
  })
})

describe('el corte de US$ 15 distingue el rótulo exacto', () => {
  it('🔴 «analisis» a secas o sin guion no queda fuera del corte', () => {
    expect(esPasoFueraDelCorteDelPlan('analisis-retencion')).toBe(true)
    for (const p of ['analisis', 'analisisfoo', 'redactor', null]) expect(esPasoFueraDelCorteDelPlan(p), String(p)).toBe(false)
  })
})
