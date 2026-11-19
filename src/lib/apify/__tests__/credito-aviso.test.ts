/**
 * 19-nov · #1085 · con la llave caída, la puerta de crédito pasa CON ALERTA: una por incidente en #alertas, cambios en su hilo, cierre al volver a leer.
 * US$ 0, sin red: almacén de avisos y Slack falsos (la misma semántica de `avisos_avisar`: abrir, repetir, cambiar, reabrir).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlmacenDeAvisos, Dependencias, Guardado, Tipo } from '../../avisos/nucleo'
import { avisarLecturaDelCredito, CLAVE_CREDITO_SIN_LEER, TITULO_CREDITO_SIN_LEER } from '../credito-aviso'

const ALERTAS = 'C-ALERTAS'

function falsos(o: { slackEncendido?: boolean; rompeGuardar?: boolean; demoraMs?: number } = {}) {
  const filas: Array<{ aviso_id: string; clave: string; tipo: Tipo; detalle: string; abierta: boolean; slack_ts: string | null; origen_tipo: string; titulo: string }> = []
  const slack: Array<{ canal: string; texto: string; hilo?: string }> = []
  let n = 0
  const almacen: AlmacenDeAvisos = {
    async avisar(e): Promise<Guardado> {
      if (o.rompeGuardar) throw new Error('base caída')
      const abierta = filas.find((f) => f.clave === e.clave && f.abierta)
      if (abierta) {
        const accion = abierta.detalle === e.detalle ? 'repetida' : 'cambio'
        abierta.detalle = e.detalle
        return { aviso_id: abierta.aviso_id, accion, slack_ts: abierta.slack_ts, slack_estado: abierta.slack_ts ? 'entregado' : 'pendiente' }
      }
      const antes = filas.some((f) => f.clave === e.clave)
      const f = { aviso_id: `a${++n}`, clave: e.clave, tipo: e.tipo, detalle: e.detalle, abierta: true, slack_ts: null, origen_tipo: e.origen_tipo, titulo: e.titulo }
      filas.push(f)
      return { aviso_id: f.aviso_id, accion: antes ? 'reabrio' : 'abrio', slack_ts: null, slack_estado: 'pendiente' }
    },
    async cerrar(clave) {
      const f = filas.find((x) => x.clave === clave && x.abierta)
      if (!f) return null
      f.abierta = false
      return { aviso_id: f.aviso_id, slack_ts: f.slack_ts, tipo: f.tipo }
    },
    async contestada() { return null },
    async cerrarFamilia() { return [] },
    async anotarSlack(id, _estado, ts) { const f = filas.find((x) => x.aviso_id === id); if (f && ts) f.slack_ts = ts },
  }
  const d: Dependencias = {
    almacen,
    slack: async (canal, texto, hilo) => { if (o.demoraMs) await new Promise((r) => setTimeout(r, o.demoraMs)); slack.push({ canal, texto, ...(hilo ? { hilo } : {}) }); return { ok: true, ts: `ts${slack.length}` } },
    slackEncendido: o.slackEncendido ?? true,
    canales: { alarma: ALERTAS },
  }
  return { d, filas, slack }
}

const caida = (detalle = 'Apify respondió 401') => ({ ok: false as const, detalle })
const leida = { ok: true as const }

describe('#1085 · la llave caída abre UNA alarma en #alertas; la puerta sigue dejando pasar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('🔴 la primera lectura caída abre la alarma: un mensaje en #alertas, tipo alarma, de la plataforma, con el motivo', async () => {
    const { d, filas, slack } = falsos()
    expect(await avisarLecturaDelCredito(caida(), d)).toBe('abrio')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ clave: CLAVE_CREDITO_SIN_LEER, tipo: 'alarma', origen_tipo: 'plataforma', titulo: TITULO_CREDITO_SIN_LEER, abierta: true })
    expect(slack).toHaveLength(1)
    expect(slack[0].canal).toBe(ALERTAS)
    expect(slack[0].hilo).toBeUndefined()
    expect(slack[0].texto).toContain(TITULO_CREDITO_SIN_LEER)
    expect(slack[0].texto).toContain('Apify respondió 401')
  })

  it('🔴 la misma lectura caída repetida solo cuenta: 10 llamadas, 1 alarma, 1 mensaje', async () => {
    const { d, filas, slack } = falsos()
    const res: string[] = []
    for (let i = 0; i < 10; i++) res.push(await avisarLecturaDelCredito(caida(), d))
    expect(res[0]).toBe('abrio')
    expect(res.slice(1).every((x) => x === 'repetida')).toBe(true)
    expect(filas).toHaveLength(1)
    expect(slack).toHaveLength(1)
  })

  it('🔴 un motivo distinto va al HILO de la misma alarma, no como alarma nueva', async () => {
    const { d, filas, slack } = falsos()
    await avisarLecturaDelCredito(caida('Apify respondió 401'), d)
    expect(await avisarLecturaDelCredito(caida('The operation was aborted due to timeout'), d)).toBe('cambio')
    expect(filas).toHaveLength(1)
    expect(slack).toHaveLength(2)
    expect(slack[1]).toMatchObject({ canal: ALERTAS, hilo: 'ts1' })
    expect(slack[1].texto).toContain('timeout')
  })

  it('🔴 cuando la cuenta se vuelve a leer, la alarma se cierra con «Resuelto» en su hilo; otra lectura buena no publica nada', async () => {
    const { d, filas, slack } = falsos()
    await avisarLecturaDelCredito(caida(), d)
    expect(await avisarLecturaDelCredito(leida, d)).toBe('cerro')
    expect(filas[0].abierta).toBe(false)
    expect(slack).toHaveLength(2)
    expect(slack[1]).toMatchObject({ canal: ALERTAS, hilo: 'ts1' })
    expect(slack[1].texto).toMatch(/^✅ Resuelto/)
    expect(await avisarLecturaDelCredito(leida, d)).toBe('nada')
    expect(slack).toHaveLength(2)
  })

  it('🔴 si vuelve a caer después de cerrada, es un incidente NUEVO: mensaje nuevo, no en el hilo viejo', async () => {
    const { d, slack } = falsos()
    await avisarLecturaDelCredito(caida(), d)
    await avisarLecturaDelCredito(leida, d)
    expect(await avisarLecturaDelCredito(caida(), d)).toBe('reabrio')
    expect(slack).toHaveLength(3)
    expect(slack[2].hilo).toBeUndefined()
  })

  it('🔴 sin lectura caída y sin alarma abierta, no se publica nada', async () => {
    const { d, filas, slack } = falsos()
    expect(await avisarLecturaDelCredito(leida, d)).toBe('nada')
    expect(filas).toHaveLength(0)
    expect(slack).toHaveLength(0)
  })

  it('🔒 el motivo va limpio: una llave larga o una dirección no llegan a Slack', async () => {
    const { d, slack } = falsos()
    await avisarLecturaDelCredito(caida('fallo en https://api.apify.com/v2/users/me?token=apify_api_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), d)
    expect(slack[0].texto).not.toContain('apify_api_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    expect(slack[0].texto).not.toContain('https://')
  })

  it('🟢 nunca lanza: con la base caída o sin dependencias responde «fallo» y no publica', async () => {
    const rota = falsos({ rompeGuardar: true })
    await expect(avisarLecturaDelCredito(caida(), rota.d)).resolves.toBe('fallo')
    expect(rota.slack).toHaveLength(0)
    await expect(avisarLecturaDelCredito(caida(), null)).resolves.toBe('fallo')
  })

  it('🟢 con Slack apagado, la alarma se guarda igual (y 0 mensajes)', async () => {
    const { d, filas, slack } = falsos({ slackEncendido: false })
    expect(await avisarLecturaDelCredito(caida(), d)).toBe('abrio')
    expect(filas).toHaveLength(1)
    expect(slack).toHaveLength(0)
  })
})

describe('#1085 · la RUTA de la puerta avisa y su respuesta no cambia', () => {
  const antes = { k: process.env.INTERNAL_API_KEY, t1: process.env.APIFY_API_TOKEN, t2: process.env.APIFY_TOKEN }
  afterEach(() => {
    process.env.INTERNAL_API_KEY = antes.k
    if (antes.t1 === undefined) delete process.env.APIFY_API_TOKEN; else process.env.APIFY_API_TOKEN = antes.t1
    if (antes.t2 === undefined) delete process.env.APIFY_TOKEN; else process.env.APIFY_TOKEN = antes.t2
    vi.doUnmock('@/lib/supabase'); vi.doUnmock('@/lib/avisos/adaptadores'); vi.resetModules(); vi.restoreAllMocks()
  })

  async function rutaCon(f: ReturnType<typeof falsos> | 'rompe') {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({}) }))
    vi.doMock('@/lib/avisos/adaptadores', () => ({ dependenciasReales: () => { if (f === 'rompe') throw new Error('sin base'); return f.d } }))
    process.env.INTERNAL_API_KEY = 'llave-de-prueba'
    const { GET } = await import('@/app/api/apify/credito/route')
    return () => GET(new Request('http://x/api/apify/credito', { headers: { 'x-api-key': 'llave-de-prueba' } }))
  }

  it('🔴 llave de Apify caída: la ruta responde «deja pasar» (200, hay_credito, leido false) Y abre la alarma ANTES de responder (en el servidor, lo que queda suelto después de responder se corta)', async () => {
    delete process.env.APIFY_API_TOKEN; delete process.env.APIFY_TOKEN
    const f = falsos({ demoraMs: 50 })
    const r = await (await rutaCon(f))()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ hay_credito: true, leido: false, usado_usd: null, credito_usd: null, hasta: null, mensaje: null, detalle: 'sin token de Apify' })
    expect(f.filas).toHaveLength(1)
    expect(f.slack).toHaveLength(1)
    expect(f.slack[0].texto).toContain('sin token de Apify')
  })

  it('🔴 la cuenta se lee: la ruta mide como siempre y cierra la alarma abierta', async () => {
    process.env.APIFY_API_TOKEN = 'token-de-prueba'
    const f = falsos()
    await avisarLecturaDelCredito(caida(), f.d)
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: string) => {
      const data = String(u).endsWith('/limits')
        ? { limits: { maxMonthlyUsageUsd: 50 }, current: { monthlyUsageUsd: 10 }, monthlyUsageCycle: { endAt: '2026-11-25T00:00:00Z' } }
        : { plan: { monthlyUsageCreditsUsd: 29 } }
      return new Response(JSON.stringify({ data }), { status: 200 })
    }) as typeof fetch)
    const r = await (await rutaCon(f))()
    expect(await r.json()).toMatchObject({ hay_credito: true, leido: true, usado_usd: 10, credito_usd: 50 })
    expect(f.filas[0].abierta).toBe(false)
  })

  it('🟢 si los avisos no se pueden armar (sin base), la puerta responde igual: deja pasar', async () => {
    delete process.env.APIFY_API_TOKEN; delete process.env.APIFY_TOKEN
    const r = await (await rutaCon('rompe'))()
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ hay_credito: true, leido: false })
  })
})
