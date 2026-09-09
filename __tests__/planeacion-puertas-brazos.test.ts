/**
 * LAS TRES PUERTAS DE `planeación` · §4.2 · CC#3 · certifica CC#2.
 *
 * 🔴 El rojo: antes de esto los tres endpoints daban 404. Acá se prueba lo que
 * un 404 no puede dar: que contesten SIEMPRE el contrato, que un problema salga
 * como HUECO y no como «no hay», y que PostHog DIGA que no puede atribuir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validarRespuesta, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

const supabaseMock = {
  from: vi.fn(),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) =>
    r.headers.get('x-api-key') === 'ok' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' },
}))

import { POST as apify } from '@/app/api/planeacion/brazo/apify/route'
import { POST as posthog } from '@/app/api/planeacion/brazo/posthog/route'
import { POST as cerebro } from '@/app/api/planeacion/brazo/cerebro/route'

const pedir = (fn: (r: Request) => Promise<Response>, cuerpo: unknown, llave = 'ok') =>
  fn(new Request('http://x/api/planeacion/brazo/x', {
    method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  }))
type Leida = RespuestaBrazo & { datos: Record<string, any> }
const leer = async (r: Response) => ({ status: r.status, json: (await r.json()) as Leida })

const cadenaSupabase = (resultado: { data?: unknown[]; error?: { message: string } }) => {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) q[m] = vi.fn(() => q)
  q.then = (res: (v: unknown) => void) => res(resultado)
  supabaseMock.from.mockReturnValue(q)
}

beforeEach(() => {
  vi.restoreAllMocks()
  supabaseMock.from.mockReset()
  process.env.APIFY_SERVICE_WEBHOOK_URL = 'https://n8n.test/webhook/apify'
  process.env.POSTHOG_PROJECT_ID = '1'
  process.env.POSTHOG_PERSONAL_API_KEY = 'k'
  process.env.POSTHOG_API_URL = 'https://ph.test'
})

describe('🔴 EL ROJO · las tres puertas EXISTEN y contestan el contrato', () => {
  for (const [nombre, fn] of [['apify', apify], ['posthog', posthog], ['cerebro', cerebro]] as const) {
    it(nombre + ' · existe, es POST, y contesta 200 con las claves de §4.2', async () => {
      cadenaSupabase({ data: [] })
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
      const { status, json } = await leer(await pedir(fn, { client_id: 'c', objetivo: 'x', params: { dominio: 'a.test' } }))
      expect(status).toBe(200)
      for (const k of ['brazo', 'objetivo', 'estado', 'datos', 'fuente', 'medido_en']) expect(json).toHaveProperty(k)
      expect(json.brazo).toBe(nombre)
      expect(validarRespuesta(json)).toEqual([])
    })
  }
})

describe('🔴 una puerta NUNCA se cae · y un problema es HUECO, no «no hay»', () => {
  const casos: ReadonlyArray<[string, (r: Request) => Promise<Response>, unknown, string]> = [
    ['sin llave', apify, { client_id: 'c', objetivo: 'x' }, 'x-api-key'],
    ['cuerpo que no es JSON', apify, '{roto', 'no es JSON'],
    ['cuerpo vacío', posthog, '', 'vacío'],
    ['sin client_id', cerebro, { objetivo: 'x' }, 'client_id'],
  ]
  for (const [etq, fn, cuerpo, esperado] of casos) {
    it(etq + ' ⇒ sin_respuesta · 200 · y dice que NO se consultó', async () => {
      const { status, json } = await leer(await pedir(fn, cuerpo, etq === 'sin llave' ? 'mala' : 'ok'))
      expect(status).toBe(200)
      expect(json.estado).toBe('sin_respuesta')
      expect(json.motivo).toContain(esperado)
      expect(json.motivo).toMatch(/NO se consult|no era válido|no se preguntó/i)
      expect(json.motivo).not.toMatch(/fui, mir/i)
      expect(validarRespuesta(json)).toEqual([])
    })
  }

  it('la fuente caída ⇒ sin_respuesta · nunca 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const { status, json } = await leer(await pedir(apify, { client_id: 'c', objetivo: 'x' }))
    expect(status).toBe(200)
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/ECONNREFUSED/)
  })

  it('sin credencial ⇒ sin_respuesta · «no se preguntó», NO «no hay»', async () => {
    delete process.env.APIFY_SERVICE_WEBHOOK_URL
    const { json } = await leer(await pedir(apify, { client_id: 'c', objetivo: 'x' }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no está configurado/)
    expect(json.motivo).toMatch(/no es que no haya dato|NO se preguntó/)
  })

  it('el techo de tiempo se CUMPLE, no sólo se declara', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* nunca contesta */ })))
    const { json } = await leer(await pedir(apify, { client_id: 'c', objetivo: 'x', limite_ms: 60 }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/se agotó el tiempo dado · 60 ms/)
    expect(json.limite_ms).toBe(60)
  })
})

describe('apify · los cuatro casos del Servicio llegan enteros', () => {
  const conSobre = async (sobre: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sobre), { status: 200 })))
    return (await leer(await pedir(apify, { client_id: 'c', objetivo: 'biblioteca_anuncios' }))).json
  }
  it('salteado ⇒ sin_respuesta', async () => {
    expect((await conSobre({ ok: true, skipped: true, skip_reason: 'function_null_per_tier' })).estado).toBe('sin_respuesta')
  })
  it('no se pudo ver ⇒ sin_respuesta · con el motivo ANIDADO', async () => {
    const r = await conSobre({ ok: true, skipped: false, sin_resultados: true, cero: { clase: 'no_pude_ver', motivo: 'aviso del raspador', se_miro_de_verdad: false } })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/aviso del raspador/)
  })
  it('se miró y no hay ⇒ sin_dato', async () => {
    const r = await conSobre({ ok: true, skipped: false, sin_resultados: true, cero: { clase: 'no_existe', motivo: 'no hay nada publicado', se_miro_de_verdad: true } })
    expect(r.estado).toBe('sin_dato')
    expect(r.motivo).toMatch(/fui, miré y no hay/)
  })
  it('con datos ⇒ trajo', async () => {
    const r = await conSobre({ ok: true, skipped: false, sin_resultados: false, chunks_count: 2, datos: '## Record 1' })
    expect(r.estado).toBe('trajo')
  })
})

describe('🔴 posthog · DECLARA que no puede atribuir · en TODOS los caminos', () => {
  const LIM = /NO puede atribuir|no llevan client_id|POR DOMINIO, NO POR CLIENTE/

  it('con datos ⇒ trajo · y la limitación viaja PEGADA al dato', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [['$pageview', 14, 9], ['menu_viewed', 5, 4]],
    }), { status: 200 })))
    const { json } = await leer(await pedir(posthog, { objetivo: 'analitica_propia', params: { dominio: 'naufrago.ec' } }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.atribucion).toBe('POR DOMINIO, NO POR CLIENTE')
    expect(String(json.datos.limitacion)).toMatch(LIM)
    expect(json.datos.visitas).toBe(14)
    // y la única vez que aparece la frase «la analítica del cliente» es NEGADA
    const t = String(json.datos.limitacion)
    expect(t).toMatch(/No es la analítica del cliente/)
    expect((t.match(/analítica del cliente/gi) || []).length).toBe(1)
  })

  it('sin eventos ⇒ sin_dato · y el motivo TAMBIÉN dice la limitación', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
    const { json } = await leer(await pedir(posthog, { params: { dominio: 'vacio.test' } }))
    expect(json.estado).toBe('sin_dato')
    expect(json.motivo).toMatch(/fui, miré y no hay/)
    expect(String(json.motivo)).toMatch(LIM)
  })

  it('🔴 sin dominio ⇒ HUECO · porque sin dominio no hay ni aproximación', async () => {
    const { json } = await leer(await pedir(posthog, { objetivo: 'analitica_propia', params: {} }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no llevan client_id/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
  })

  it('sin credencial de lectura ⇒ sin_respuesta · NO «el cliente no tiene visitas»', async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY
    const { json } = await leer(await pedir(posthog, { params: { dominio: 'a.test' } }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no es que el cliente no tenga visitas/)
  })
})

describe('cerebro · se LEE, y el vacío es información', () => {
  it('con fragmentos ⇒ trajo · con su procedencia', async () => {
    cadenaSupabase({ data: [{ section_label: 's', source_table: 't', chunk_text: 'x'.repeat(10), provenance_tag: { trust: 'evidencia' }, created_at: 'ayer' }] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c' }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.cantidad).toBe(1)
    expect(json.datos.fragmentos[0].procedencia).toEqual({ trust: 'evidencia' })
  })

  it('sin fragmentos ⇒ sin_dato · «todavía no tiene conocimiento cargado»', async () => {
    cadenaSupabase({ data: [] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c' }))
    expect(json.estado).toBe('sin_dato')
    expect(json.motivo).toMatch(/fui, miré y no hay/)
  })

  it('🔴 un error de la base NO es «el cliente no tiene conocimiento»', async () => {
    cadenaSupabase({ error: { message: 'connection reset' } })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c' }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/connection reset/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
  })

  it('el texto largo se recorta Y SE DECLARA', async () => {
    cadenaSupabase({ data: [{ section_label: 's', source_table: 't', chunk_text: 'y'.repeat(5000), created_at: 'hoy' }] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c' }))
    expect(json.datos.fragmentos[0].texto).toHaveLength(2000)
    expect(json.datos.fragmentos[0].recortado).toBe(true)
  })
})

describe('los dos campos opcionales viajan por las tres puertas', () => {
  it('limite_ms y proposito vuelven en la respuesta', async () => {
    cadenaSupabase({ data: [] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', limite_ms: 5000, proposito: 'no repetir trabajo' }))
    expect(json.limite_ms).toBe(5000)
    expect(json.proposito).toBe('no repetir trabajo')
  })
})
