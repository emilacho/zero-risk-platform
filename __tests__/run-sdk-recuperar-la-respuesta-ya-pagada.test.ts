/**
 * 🔴 E92 · CC#3 · el almacén sano y la recuperación (arreglo A de E86 · decisión de Lenovo: opción A).
 *
 * Medido el 17-sep (E91): el almacén recortaba a 2.000 caracteres · **39 de 115 filas (34 %)**,
 * el descubridor **18 de 18**, peor caso 22.888 → 2.001. Sobre eso no se podía recuperar nada.
 * Y las dos respuestas que se cortaron en la bolita **estaban enteras** (1.730 y 190 caracteres),
 * con la fila apareciendo **20 s** y **58 s** después del corte.
 *
 * Esta prueba fija: ① que ya no se recorta a 2.000 y que un recorte se DECLARA ·
 * ② que una respuesta pagada se recupera, que una recortada NUNCA se entrega, y que
 * pasado el tope es «no sé». NO toca producción · sin red.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  filaEstaEntera,
  respuestaDesdeLaFila,
  recuperarRespuestaPagada,
  RECUPERACION_TOPE_MS,
  type FilaInvocacion,
} from '../src/app/api/agents/run-sdk/route'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }),
}))

const fuente = readFileSync(join(process.cwd(), 'src/app/api/agents/log-invocation/route.ts'), 'utf8')

const fila = (over: Partial<FilaInvocacion> = {}): FilaInvocacion => ({
  status: 'completed',
  output_summary: 'x'.repeat(1730),
  session_id: 'ses-1',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.073322,
  duration_ms: 46035,
  tokens_input: 3,
  tokens_output: 1200,
  metadata: { response_length_real: 1730, response_stored_length: 1730, response_truncated: false, step_name: 'x' },
  ...over,
})

describe('① el almacén sano · ya no se recorta a 2.000 y un recorte se declara', () => {
  it('el tope viejo (2.000) ya no está en el código', () => {
    expect(fuente).not.toMatch(/responseText\.length > 2000/)
    expect(fuente).toMatch(/RESPONSE_MAX_CHARS = 100_000/)
  })

  it('el tope nuevo deja pasar entera la respuesta más larga medida (27.750) y declara si recorta', () => {
    expect(fuente).toMatch(/response_truncated: responseTruncated/)
    expect(fuente).toMatch(/response_length_real: responseText\.length/)
    expect(fuente).toMatch(/response_stored_length/)
    const tope = Number(/RESPONSE_MAX_CHARS = ([\d_]+)/.exec(fuente)![1].replace(/_/g, ''))
    expect(tope).toBeGreaterThan(27_750)
  })
})

describe('② «está entera» se PRUEBA, no se supone', () => {
  it('🔴 una fila recortada (el caso real 22.888 → 2.001) NO se da por entera', () => {
    const r = filaEstaEntera(
      fila({ output_summary: 'y'.repeat(2001), metadata: { response_length: 22888 } }),
    )
    expect(r.entera).toBe(false)
    expect(r.motivo).toMatch(/recortada · medía 22888 y se guardaron 2001/)
  })

  it('la fila que se declara recortada tampoco', () => {
    expect(filaEstaEntera(fila({ metadata: { response_truncated: true, response_length_real: 1730 } })).entera).toBe(false)
  })

  it('sin declaración no se puede probar ⇒ no se entrega', () => {
    const r = filaEstaEntera(fila({ metadata: { step_name: 'x' } }))
    expect(r.entera).toBe(false)
    expect(r.motivo).toMatch(/no declara/)
  })

  it('la fila entera (1.730 · el veredicto real de la bolita) sí', () => {
    expect(filaEstaEntera(fila()).entera).toBe(true)
  })

  it('vale la declaración vieja del corredor (`response_length`) y la nueva', () => {
    expect(filaEstaEntera(fila({ metadata: { response_length: 1730 } })).entera).toBe(true)
  })
})

describe('② la recuperación', () => {
  const ctx = { agent: 'competitive-intelligence-agent', step: null, executionId: '140135', desdeIso: '2026-09-17T04:47:00Z' }

  it('la fila aparece a los 20 s (caso real) ⇒ devuelve la respuesta REAL y lo deja escrito', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let t = 0
    const r = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => (t >= 20_000 ? fila() : null),
      esperar: async (ms) => { t += ms },
      ahora: () => t,
    })
    expect(r?.success).toBe(true)
    expect(r?.response.length).toBe(1730)
    expect(r?.costUsd).toBe(0.073322)
    expect(r?.model).toBe('claude-sonnet-4-6')
    const linea = aviso.mock.calls.map((c) => String(c[0])).find((l) => l.includes('respuesta_recuperada'))!
    expect(linea).toContain('caracteres=1730')
    expect(linea).toMatch(/espera=2[05]\.0s/)
    aviso.mockRestore()
  })

  it('la fila aparece a los 58 s (el otro caso real) ⇒ también la alcanza', async () => {
    let t = 0
    const r = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => (t >= 58_000 ? fila({ output_summary: 'z'.repeat(190), metadata: { response_length_real: 190 } }) : null),
      esperar: async (ms) => { t += ms },
      ahora: () => t,
    })
    expect(r?.response.length).toBe(190)
  })

  it('el tope son 120 s, no 20 · pasado el tope ⇒ «no sé» (null), nunca un valor', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(RECUPERACION_TOPE_MS).toBeGreaterThanOrEqual(90_000)
    let t = 0
    const r = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => null,
      esperar: async (ms) => { t += ms },
      ahora: () => t,
    })
    expect(r).toBeNull()
    expect(t).toBeLessThanOrEqual(RECUPERACION_TOPE_MS)
    expect(t).toBeGreaterThanOrEqual(RECUPERACION_TOPE_MS - 5_000)
    expect(aviso.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/respuesta_no_recuperada.*nunca apareció/)
    aviso.mockRestore()
  })

  it('🔴 una respuesta RECORTADA nunca se entrega · corta la espera y dice por qué', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let t = 0
    let vueltas = 0
    const r = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => { vueltas++; return fila({ output_summary: 'y'.repeat(2001), metadata: { response_length: 22888 } }) },
      esperar: async (ms) => { t += ms },
      ahora: () => t,
    })
    expect(r).toBeNull()
    expect(vueltas).toBe(1) // no insiste: una recortada no se vuelve entera
    expect(aviso.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/motivo=recortada · medía 22888/)
    aviso.mockRestore()
  })

  it('si el empleado falló, no se inventa una respuesta', async () => {
    const r = await recuperarRespuestaPagada(ctx, { buscarFila: async () => fila({ status: 'failed' }), esperar: async () => {}, ahora: () => 0 })
    expect(r).toBeNull()
  })

  it('si el registro no se puede leer, sigue intentando y termina en «no sé»', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let t = 0
    const r = await recuperarRespuestaPagada(ctx, {
      buscarFila: async () => { throw new Error('PostgREST caído') },
      esperar: async (ms) => { t += ms },
      ahora: () => t,
    })
    expect(r).toBeNull()
    expect(aviso.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/motivo=no se pudo leer el registro · PostgREST caído/)
    aviso.mockRestore()
  })

  it('arma la respuesta con la forma del corredor · incluye la sección del manual si la fila la tiene', () => {
    const brand = { lens: 'jefe-client-success', mision: { valor: 'm' } }
    const r = respuestaDesdeLaFila(fila({ metadata: { response_length_real: 1730, brand_section: brand } }))
    expect(r.brandSectionToolCall).toEqual({ input: brand, emission_count: 1 })
    expect(r.sessionId).toBe('ses-1')
    expect(r.durationMs).toBe(46035)
    expect(r.outputTokens).toBe(1200)
  })
})
