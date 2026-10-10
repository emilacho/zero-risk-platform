/**
 * Condición de CC#3 sobre #477: un intento colgado no se come los 300 s de la ruta. Tiempo límite POR INTENTO + presupuesto TOTAL con reintentos.
 */
import { describe, expect, it } from 'vitest'
import { ESPERAS_DEL_REVISOR_MS, llamarRevisorGpt, PRESUPUESTO_TOTAL_MS, TIEMPO_LIMITE_POR_INTENTO_MS } from '../../revisor-gpt'

const base = { apiKey: 'sk-test', modelo: 'm', texto: 'x', esperar: async () => {} }
/** un fetch que nunca responde, pero respeta la señal de aborto como el real */
const colgado = ((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => { init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)) })) as unknown as typeof fetch

describe('revisor GPT · tiempo límite por intento', () => {
  it('por omisión: 60 s por intento y 200 s en total, y el peor caso cabe en los 300 s de la ruta', () => {
    expect(TIEMPO_LIMITE_POR_INTENTO_MS).toBe(60_000)
    expect(PRESUPUESTO_TOTAL_MS).toBe(200_000)
    expect(PRESUPUESTO_TOTAL_MS).toBeLessThan(300_000)
    // aun sin presupuesto, 4 intentos de 60 s + 85 s de esperas serían 325 s: por eso existe el tope total
    expect(4 * TIEMPO_LIMITE_POR_INTENTO_MS + ESPERAS_DEL_REVISOR_MS.reduce((a, b) => a + b, 0)).toBeGreaterThan(300_000)
  })

  it('un fetch que no responde se corta al vencer el tiempo del intento y se cuenta como fallo de red (se reintenta)', async () => {
    const r = await llamarRevisorGpt({ ...base, f: colgado, tiempoLimiteMs: 15, esperasMs: [0, 0] })
    expect(r.ok).toBe(false)
    expect(r.intentos!.map((x) => x.resultado)).toEqual(['red', 'red', 'red'])
  })

  it('la señal de aborto llega al fetch con el tiempo límite configurado', async () => {
    let senal: AbortSignal | undefined
    const f = (async (_u: unknown, init?: RequestInit) => { senal = init?.signal ?? undefined; return new Response(JSON.stringify({ output_text: 'ok' }), { status: 200 }) }) as unknown as typeof fetch
    expect(await llamarRevisorGpt({ ...base, f })).toMatchObject({ ok: true, texto: 'ok' })
    expect(senal).toBeDefined(); expect(senal!.aborted).toBe(false)
  })

  it('presupuesto total: si la espera + otro intento ya no caben, deja de reintentar y lo dice', async () => {
    let t = 0
    let n = 0
    const f = (async () => { n++; t += 60_000; throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const dormidas: number[] = []
    const r = await llamarRevisorGpt({ ...base, f, ahora: () => t, esperar: async (ms) => { dormidas.push(ms); t += ms } })
    // intento 1 (0→60 s) · espera 5 s + intento 2 (→125 s) · espera 20 s + 60 s = 205 s > 200 s ⇒ no hay tercero
    expect(n).toBe(2); expect(dormidas).toEqual([5_000])
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('sin presupuesto')
    expect(t).toBeLessThanOrEqual(PRESUPUESTO_TOTAL_MS)
  })

  it('con presupuesto de sobra hace los 4 intentos', async () => {
    let n = 0
    const f = (async () => { n++; return new Response('{}', { status: 503 }) }) as unknown as typeof fetch
    await llamarRevisorGpt({ ...base, f })
    expect(n).toBe(4)
  })
})
