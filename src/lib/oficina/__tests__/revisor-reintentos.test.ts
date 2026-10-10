/**
 * Firma de Emilio (10-oct): si GPT falla, 3 REINTENTOS con espera creciente (5 s, 20 s, 60 s) para red / 5xx / 429;
 * llave o modelo equivocados (401, 403, 404 y demás 4xx) NO se reintentan; cada intento cuenta su costo.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos, ESPERAS_DEL_REVISOR_MS, type Entorno } from '../adaptadores'
import { DbFalsa } from './dbfalsa'

const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k-interna', openaiKey: 'sk-test', revisorModelo: 'modelo-revisor', revisorPrecioEntrada: 2, revisorPrecioSalida: 10 }
type Paso = { status: number; usage?: { input_tokens: number; output_tokens: number }; texto?: string } | 'red'

function armar(pasos: Paso[]) {
  const esperas: number[] = []
  let n = 0
  const f = (async () => {
    const p = pasos[Math.min(n++, pasos.length - 1)]
    if (p === 'red') throw new TypeError('fetch failed')
    const cuerpo = p.status === 200 ? { output_text: p.texto ?? 'opinión', usage: p.usage } : { error: { message: `HTTP ${p.status}` }, ...(p.usage ? { usage: p.usage } : {}) }
    return new Response(JSON.stringify(cuerpo), { status: p.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const P = crearPuertos(new DbFalsa(), { ...ENV, esperar: async (ms) => { esperas.push(ms) } }, f)
  return { P, esperas, llamadas: () => n }
}
const pedir = (P: ReturnType<typeof crearPuertos>) => P.revisor({ texto: 'x', imagenes_urls: [], dry_run: false })

describe('revisor GPT · 3 reintentos con espera creciente', () => {
  it('las esperas por omisión son 5 s, 20 s y 60 s', () => { expect(ESPERAS_DEL_REVISOR_MS).toEqual([5_000, 20_000, 60_000]) })

  it('503, 503 y luego 200: responde al tercer intento, esperó 5 s y 20 s, y cuenta los tres intentos', async () => {
    const { P, esperas, llamadas } = armar([{ status: 503 }, { status: 503 }, { status: 200, usage: { input_tokens: 1000, output_tokens: 200 } }])
    const r = await pedir(P)
    expect(r).toMatchObject({ ok: true, texto: 'opinión' })
    expect(llamadas()).toBe(3); expect(esperas).toEqual([5_000, 20_000])
    expect(r.intentos!.map((x) => [x.n, x.resultado, x.espera_antes_ms])).toEqual([[1, 'http_503', 0], [2, 'http_503', 5_000], [3, 'ok', 20_000]])
    expect(r.costo_usd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6, 8)
  })

  it('si todo falla: 1 intento + 3 reintentos (4 en total), esperas 5/20/60 s, y devuelve el error y los intentos', async () => {
    const { P, esperas, llamadas } = armar([{ status: 500 }])
    const r = await pedir(P)
    expect(r.ok).toBe(false)
    expect(llamadas()).toBe(4); expect(esperas).toEqual([5_000, 20_000, 60_000])
    expect(r.intentos).toHaveLength(4)
    expect(r.ok === false && r.error).toBe('HTTP 500')
  })

  it('429 y un corte de red también se reintentan', async () => {
    const a = armar([{ status: 429 }, { status: 200 }]); expect((await pedir(a.P)).ok).toBe(true); expect(a.llamadas()).toBe(2)
    const b = armar(['red', 'red', { status: 200 }]); const rb = await pedir(b.P); expect(rb.ok).toBe(true); expect(b.llamadas()).toBe(3)
    expect(rb.intentos!.map((x) => x.resultado)).toEqual(['red', 'red', 'ok'])
  })

  it('llave o modelo equivocados NO se reintentan: 401, 403, 404, 400 ⇒ un solo intento y sin esperar', async () => {
    for (const status of [401, 403, 404, 400, 422]) {
      const { P, esperas, llamadas } = armar([{ status }, { status: 200 }])
      const r = await pedir(P)
      expect(r.ok, String(status)).toBe(false)
      expect(llamadas(), String(status)).toBe(1); expect(esperas, String(status)).toEqual([])
      expect(r.intentos).toHaveLength(1)
    }
  })

  it('cada intento cuenta su costo: un intento que falla pero trae uso se suma', async () => {
    const { P } = armar([{ status: 500, usage: { input_tokens: 1000, output_tokens: 0 } }, { status: 200, usage: { input_tokens: 1000, output_tokens: 100 } }])
    const r = await pedir(P)
    expect(r.ok).toBe(true)
    expect(r.intentos!.map((x) => x.costo_usd)).toEqual([0.002, 0.003])
    expect(r.costo_usd).toBeCloseTo(0.005, 8)
  })

  it('sin llave o sin modelo no hay ni un intento; en dry_run no llama', async () => {
    const f = (async () => { throw new Error('no debe llamarse') }) as typeof fetch
    const sinLlave = crearPuertos(new DbFalsa(), { ...ENV, openaiKey: undefined }, f)
    expect(await pedir(sinLlave)).toMatchObject({ ok: false, intentos: [] })
    expect(await crearPuertos(new DbFalsa(), ENV, f).revisor({ texto: 'x', imagenes_urls: [], dry_run: true })).toMatchObject({ ok: true, costo_usd: 0 })
  })
})
