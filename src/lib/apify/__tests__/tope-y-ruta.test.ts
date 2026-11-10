/**
 * 10-nov · CC7 sobre #977: (2) el criterio usa PRIMERO el límite de gasto del mes y, solo si falta, el crédito del plan; (3) sin llave, la ruta responde 401.
 * US$ 0, sin red (la cuenta de Apify es falsa).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creditoDeApify, leerUsoDelMes, topeDelMes } from '../credito'

/** cuenta falsa de Apify con las dos respuestas que lee el lector */
function cuenta(o: { credito?: unknown; limite?: unknown; usado?: unknown; fin?: string; status?: number }) {
  const pedidos: string[] = []
  const fetchImpl = async (u: string) => {
    pedidos.push(u)
    if (o.status) return new Response('{}', { status: o.status })
    const data = u.endsWith('/limits')
      ? { limits: o.limite === undefined ? {} : { maxMonthlyUsageUsd: o.limite }, current: { monthlyUsageUsd: o.usado }, monthlyUsageCycle: { endAt: o.fin ?? '2026-11-25T00:00:00Z' } }
      : { plan: { id: 'STARTER', ...(o.credito === undefined ? {} : { monthlyUsageCreditsUsd: o.credito }) } }
    return new Response(JSON.stringify({ data }), { status: 200 })
  }
  return { fetchImpl, pedidos }
}

describe('el tope del mes: primero el límite de gasto, después el crédito del plan', () => {
  it('🟢 caso de CC7: crédito 29, límite 50, uso 29,12 → HAY crédito (Apify no bloquea hasta 50)', async () => {
    const c = cuenta({ credito: 29, limite: 50, usado: 29.12 })
    const r = await leerUsoDelMes({ token: 't', fetchImpl: c.fetchImpl })
    expect(r).toEqual({ ok: true, uso: { usado_usd: 29.12, credito_usd: 50, tope_de: 'limite_del_mes', ciclo_hasta: '2026-11-25T00:00:00Z' } })
    if (!r.ok) throw new Error('no leyó')
    expect(creditoDeApify(r.uso)).toMatchObject({ hay_credito: true, credito_usd: 50, tope_de: 'limite_del_mes', mensaje: null })
  })

  it('🔴 la cuenta real del 10-nov: límite 29, crédito 29, uso 29,12 → sin crédito hasta el 2026-11-25', async () => {
    const r = await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ credito: 29, limite: 29, usado: 29.12 }).fetchImpl })
    if (!r.ok) throw new Error('no leyó')
    expect(creditoDeApify(r.uso)).toMatchObject({ hay_credito: false, credito_usd: 29, tope_de: 'limite_del_mes', hasta: '2026-11-25' })
  })

  it('límite por debajo del crédito del plan: manda el límite (29,12 de límite 20 → sin crédito aunque el plan dé 29)', async () => {
    const r = await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ credito: 29, limite: 20, usado: 20.5 }).fetchImpl })
    if (!r.ok) throw new Error('no leyó')
    expect(creditoDeApify(r.uso).hay_credito).toBe(false)
  })

  it('sin límite en la cuenta → usa el crédito del plan', async () => {
    const r = await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ credito: 29, usado: 28 }).fetchImpl })
    expect(r).toMatchObject({ ok: true, uso: { credito_usd: 29, tope_de: 'credito_del_plan' } })
  })

  it('topeDelMes: un límite 0, negativo o roto no cuenta; sin nada → null', () => {
    expect(topeDelMes(50, 29)).toEqual({ usd: 50, de: 'limite_del_mes' })
    for (const l of [0, -1, '50', null, undefined, NaN]) expect(topeDelMes(l, 29)).toEqual({ usd: 29, de: 'credito_del_plan' })
    expect(topeDelMes(undefined, undefined)).toBeNull()
    expect(topeDelMes(0, 0)).toBeNull()
  })

  it('lectura imposible → ok:false (la puerta deja pasar, declarado): sin token, Apify caído, sin uso, sin tope', async () => {
    expect(await leerUsoDelMes({ token: '', fetchImpl: cuenta({}).fetchImpl })).toEqual({ ok: false, detalle: 'sin token de Apify' })
    expect(await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ status: 500 }).fetchImpl })).toEqual({ ok: false, detalle: 'Apify respondió 500' })
    expect(await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ credito: 29, limite: 50 }).fetchImpl })).toMatchObject({ ok: false })
    expect(await leerUsoDelMes({ token: 't', fetchImpl: cuenta({ usado: 3 }).fetchImpl })).toMatchObject({ ok: false })
  })

  it('lee las dos direcciones de solo lectura de la cuenta, con la llave en la cabecera', async () => {
    const c = cuenta({ credito: 29, limite: 50, usado: 1 })
    await leerUsoDelMes({ token: 't', fetchImpl: c.fetchImpl })
    expect(c.pedidos.sort()).toEqual(['https://api.apify.com/v2/users/me', 'https://api.apify.com/v2/users/me/limits'])
  })
})

describe('la ruta GET /api/apify/credito', () => {
  const antes = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { process.env.INTERNAL_API_KEY = antes; vi.restoreAllMocks() })

  it('🔒 sin llave → 401 y NO lee la cuenta de Apify', async () => {
    const red = vi.spyOn(globalThis, 'fetch')
    const { GET } = await import('@/app/api/apify/credito/route')
    const r = await GET(new Request('http://x/api/apify/credito'))
    expect(r.status).toBe(401)
    expect(red).not.toHaveBeenCalled()
  })

  it('🔒 llave equivocada → 401', async () => {
    const { GET } = await import('@/app/api/apify/credito/route')
    const r = await GET(new Request('http://x/api/apify/credito', { headers: { 'x-api-key': 'otra-llave-xxxxx' } }))
    expect(r.status).toBe(401)
  })

  it('🟢 con la llave, la RUTA mide contra el límite del mes: crédito 29, límite 50, uso 29,12 → hay crédito', async () => {
    const t1 = process.env.APIFY_API_TOKEN
    process.env.APIFY_API_TOKEN = 'token-de-prueba'
    const c = cuenta({ credito: 29, limite: 50, usado: 29.12 })
    vi.spyOn(globalThis, 'fetch').mockImplementation(((u: string) => c.fetchImpl(String(u))) as typeof fetch)
    try {
      const { GET } = await import('@/app/api/apify/credito/route')
      const r = await GET(new Request('http://x/api/apify/credito', { headers: { 'x-api-key': 'llave-de-prueba' } }))
      expect(r.status).toBe(200)
      expect(await r.json()).toMatchObject({ hay_credito: true, leido: true, credito_usd: 50, tope_de: 'limite_del_mes' })
    } finally {
      if (t1 === undefined) delete process.env.APIFY_API_TOKEN
      else process.env.APIFY_API_TOKEN = t1
    }
  })

  it('con la llave → 200 y responde (sin token de Apify: deja pasar, declarado)', async () => {
    const t1 = process.env.APIFY_API_TOKEN, t2 = process.env.APIFY_TOKEN
    delete process.env.APIFY_API_TOKEN; delete process.env.APIFY_TOKEN
    try {
      const { GET } = await import('@/app/api/apify/credito/route')
      const r = await GET(new Request('http://x/api/apify/credito', { headers: { 'x-api-key': 'llave-de-prueba' } }))
      expect(r.status).toBe(200)
      expect(await r.json()).toMatchObject({ hay_credito: true, leido: false, detalle: 'sin token de Apify' })
    } finally {
      if (t1 !== undefined) process.env.APIFY_API_TOKEN = t1
      if (t2 !== undefined) process.env.APIFY_TOKEN = t2
    }
  })
})
