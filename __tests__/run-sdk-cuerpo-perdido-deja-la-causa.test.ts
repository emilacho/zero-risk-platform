/**
 * 🔴 E88 · CC#3 · la línea de registro de la causa.
 *
 * Bolita E83 (17-sep): dos llamadas en línea a `/api/agents/run-sdk` se cortaron (28 s y 40 s),
 * el empleado terminó y cobró igual, y en los registros quedó un **500 sin mensaje** — porque
 * `railwayResponse.text()` se leía FUERA del `try` del salto y el `catch` final sólo imprime
 * `error.message` (`terminated`), tirando `err.cause`.
 *
 * Esta prueba fija que la lectura deja UNA línea con: segundo en que se perdió, bytes leídos y
 * el error exacto con su cadena de causas · y que el comportamiento NO cambia (mismo error sube).
 * NO toca producción · sin red.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { leerCuerpoRegistrandoLaCausa } from '../src/app/api/agents/run-sdk/route'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  withScope: (fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setExtra: vi.fn() }),
}))

const trozo = (s: string) => new TextEncoder().encode(s)

/** cuerpo que entrega trozos y después se cae · la forma del corte medido */
function cuerpoQueSeCae(trozos: string[], err: unknown): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < trozos.length) {
        controller.enqueue(trozo(trozos[i++]))
        return
      }
      controller.error(err)
    },
  })
}

function cuerpoEntero(texto: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(trozo(texto))
      controller.close()
    },
  })
}

const CTX = {
  agent: 'jefe-client-success',
  step: 'bb-lens-jefe-client-success',
  workflowId: 'ssLtwYPt7zxuvnM2',
  executionId: '140150',
  intento: 1,
  intentoEmpezoEnMs: Date.now() - 40_000,
  status: 200,
}

afterEach(() => vi.restoreAllMocks())

describe('E88 · el cuerpo se lee dentro de la protección y la causa queda escrita', () => {
  it('camino feliz · devuelve el cuerpo entero y NO registra nada', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cuerpo = JSON.stringify({ success: true, agent: 'x', cost_usd: 0.1 })
    const texto = await leerCuerpoRegistrandoLaCausa(
      { body: cuerpoEntero(cuerpo), text: async () => cuerpo },
      CTX,
    )
    expect(texto).toBe(cuerpo)
    expect(err).not.toHaveBeenCalled()
  })

  it('cuerpo en varios trozos (el latido) · los junta bien', async () => {
    const partes = [' ', ' ', '{"success":true,', '"cost_usd":0.1387}']
    const texto = await leerCuerpoRegistrandoLaCausa(
      { body: cuerpoQueSeCaeNunca(partes), text: async () => partes.join('') },
      CTX,
    )
    expect(texto).toBe(partes.join(''))
  })

  it('🔴 el corte medido · `terminated` a mitad de la lectura ⇒ UNA línea con segundo, bytes y causa', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const corte = Object.assign(new TypeError('terminated'), {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
    })
    await expect(
      leerCuerpoRegistrandoLaCausa({ body: cuerpoQueSeCae([' ', ' ', '{"suc'], corte), text: async () => '' }, CTX),
    ).rejects.toBe(corte) // ← el MISMO error sigue subiendo · el comportamiento no cambia

    expect(err).toHaveBeenCalledTimes(1)
    const linea = String(err.mock.calls[0][0])
    expect(linea).toContain('[run-sdk] cuerpo_perdido')
    expect(linea).toMatch(/bytes_leidos=7\b/) // 2 espacios + '{"suc'
    expect(linea).toMatch(/s_desde_el_intento=4[01]\.\d/)
    expect(linea).toMatch(/s_leyendo=\d+\.\d/)
    expect(linea).toContain('TypeError: terminated')
    expect(linea).toContain('Error: other side closed (UND_ERR_SOCKET)')
    expect(linea).toContain('agent=jefe-client-success')
    expect(linea).toContain('step=bb-lens-jefe-client-success')
    expect(linea).toContain('exec=140150')
    expect(linea).toContain('intento=1')
  })

  it('corte ANTES del primer byte · lo dice con 0 bytes, no calla', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      leerCuerpoRegistrandoLaCausa({ body: cuerpoQueSeCae([], new Error('socket hang up')), text: async () => '' }, CTX),
    ).rejects.toThrow('socket hang up')
    expect(String(err.mock.calls[0][0])).toMatch(/bytes_leidos=0\b/)
  })

  it('sin cuerpo legible cae al camino de siempre (`text()`)', async () => {
    const texto = await leerCuerpoRegistrandoLaCausa({ body: null, text: async () => 'ok' }, CTX)
    expect(texto).toBe('ok')
  })
})

/** cuerpo que entrega trozos y cierra bien */
function cuerpoQueSeCaeNunca(trozos: string[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < trozos.length) {
        controller.enqueue(trozo(trozos[i++]))
        return
      }
      controller.close()
    },
  })
}
