/**
 * LAS TRES PUERTAS DE `planeación` · §4.2 · CC#3 · certifica CC#2.
 *
 * 🔴 El rojo: antes de esto los tres endpoints daban 404. Acá se prueba lo que
 * un 404 no puede dar: que contesten SIEMPRE el contrato, que un problema salga
 * como HUECO y no como «no hay», y que PostHog DIGA que no puede atribuir.
 *
 * 🔴 Lo que agregó la corrección del 10-sep (tres puntos de Lenovo):
 *   ① la puerta recibe la LISTA y contesta UNA respuesta POR PEDIDO
 *   ② el cerebro entrega la CARPETA completa del portero (FIRMA 01-nov) · ya no busca por parecido
 *   ③ la corrida de raspado se firma con la firma REAL de quien llama, o no corre
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validarRespuesta, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'
import { TOPE_PEDIDOS } from '@/lib/planeacion/puertas'
import { traducir, FUNCIONES_DEL_PROVEEDOR } from '@/lib/planeacion/vocabulario'

const supabaseMock = {
  from: vi.fn(),
}
const brain = vi.hoisted(() => ({ queryClientBrain: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/client-brain', () => ({ queryClientBrain: brain.queryClientBrain }))
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
type Sobre = { respuestas: Leida[]; resumen: Record<string, any> }
/** el sobre entero · `respuestas[i]` es la respuesta de `pedidos[i]` */
const leerSobre = async (r: Response) => ({ status: r.status, sobre: (await r.json()) as Sobre })
/** atajo para los casos de un solo pedido */
const leer = async (r: Response) => {
  const { status, sobre } = await leerSobre(r)
  return { status, json: sobre.respuestas[0], sobre }
}

const cadenaSupabase = (resultado: { data?: unknown[]; error?: { message: string } }) => {
  const q: Record<string, any> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'is', 'gte']) q[m] = vi.fn(() => q)
  q.then = (res: (v: unknown) => void) => res(resultado)
  supabaseMock.from.mockReturnValue(q)
  return q
}

/** el pedido de raspado COMPLETO · con firma real, ensayo decidido y vuelta */
const PEDIDO_APIFY = {
  client_id: 'c',
  objetivo: 'facebook_ads_library_scraper',
  workflow_id: 'PLAN3ac10nWf',
  workflow_execution_id: '127323',
  dry_run: false,
  callback_url: 'https://n8n.test/webhook-waiting/1',
}

const fragmento = (over: Record<string, unknown> = {}) => ({
  chunk_id: 'ch1', source_table: 'brand_books', source_id: 's1',
  label: 'voz', content_text: 'x'.repeat(10), similarity: 0.82, ...over,
})

beforeEach(() => {
  vi.restoreAllMocks()
  supabaseMock.from.mockReset()
  brain.queryClientBrain.mockReset()
  brain.queryClientBrain.mockResolvedValue([])
  process.env.APIFY_SERVICE_WEBHOOK_URL = 'https://n8n.test/webhook/apify-service-workflow'
  process.env.POSTHOG_PROJECT_ID = '1'
  process.env.POSTHOG_PERSONAL_API_KEY = 'k'
  process.env.POSTHOG_API_URL = 'https://ph.test'
})

describe('🔴 EL ROJO · las tres puertas EXISTEN y contestan el contrato', () => {
  for (const [nombre, fn] of [['apify', apify], ['posthog', posthog], ['cerebro', cerebro]] as const) {
    it(nombre + ' · existe, es POST, y contesta 200 con las claves de §4.2', async () => {
      cadenaSupabase({ data: [] })
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
      const { status, json } = await leer(await pedir(fn, {
        ...PEDIDO_APIFY, objetivo: 'x', params: { dominio: 'a.test', query: 'la voz de la marca' },
      }))
      expect(status).toBe(200)
      for (const k of ['brazo', 'objetivo', 'estado', 'datos', 'fuente', 'medido_en']) expect(json).toHaveProperty(k)
      expect(json.brazo).toBe(nombre)
      expect(validarRespuesta(json)).toEqual([])
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// ① LA LISTA · decisión de Lenovo 10-sep · el abanico lo decide `elegir brazos`
// ═══════════════════════════════════════════════════════════════════════════
describe('🔴 ① la puerta recibe la LISTA y contesta UNA respuesta POR PEDIDO', () => {
  it('tres pedidos ⇒ tres respuestas · en el MISMO orden', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
    const { sobre } = await leerSobre(await pedir(posthog, {
      client_id: 'c',
      pedidos: [
        { objetivo: 'uno', orden: 1, params: { dominio: 'a.test' } },
        { objetivo: 'dos', orden: 2, params: { dominio: 'b.test' } },
        { objetivo: 'tres', orden: 3, params: { dominio: 'c.test' } },
      ],
    }))
    expect(sobre.respuestas).toHaveLength(3)
    expect(sobre.respuestas.map((r) => r.objetivo)).toEqual(['uno', 'dos', 'tres'])
    expect(sobre.resumen.pedidos).toBe(3)
  })

  it('🔴 un pedido que no sirve NO tumba a los demás · ocupa SU lugar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [['$pageview', 3, 2]],
    }), { status: 200 })))
    const { sobre } = await leerSobre(await pedir(posthog, {
      client_id: 'c',
      pedidos: [
        { objetivo: 'bueno', params: { dominio: 'a.test' } },
        { orden: 2 },                       // sin objetivo
        { objetivo: 'sin_dominio', params: {} },
      ],
    }))
    expect(sobre.respuestas).toHaveLength(3)
    expect(sobre.respuestas[0].estado).toBe('trajo')
    expect(sobre.respuestas[1].estado).toBe('sin_respuesta')
    expect(sobre.respuestas[1].motivo).toMatch(/falta objetivo/)
    expect(sobre.respuestas[2].estado).toBe('sin_respuesta')
    expect(sobre.respuestas[2].motivo).toMatch(/dominio/)
    // y ninguna de las tres rompe el contrato
    for (const r of sobre.respuestas) expect(validarRespuesta(r)).toEqual([])
  })

  it('lo del sobre se HEREDA a cada pedido que no lo trae', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: false, chunks_count: 1, datos: '#' }), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { sobre } = await leerSobre(await pedir(apify, {
      ...PEDIDO_APIFY,
      objetivo: undefined,
      proposito: 'para el plan',
      pedidos: [{ objetivo: 'sitio_propio' }, { objetivo: 'biblioteca_anuncios' }],
    }))
    expect(sobre.respuestas).toHaveLength(2)
    expect(sobre.respuestas.every((r) => r.estado === 'trajo')).toBe(true)
    expect(sobre.respuestas[0].proposito).toBe('para el plan')
    // el cliente y la firma se pusieron UNA vez y valieron para los dos
    const cuerpos = espia.mock.calls.map((c: any) => JSON.parse(c[1].body))
    expect(cuerpos.map((b) => b.apify_function)).toEqual(['website_content_scraper', 'facebook_ads_library_scraper'])
    expect(cuerpos.every((b) => b.client_id === 'c')).toBe(true)
  })

  it('`pedidos: []` ⇒ hueco · no hay nada que preguntar', async () => {
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', pedidos: [] }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/vacío/)
  })

  it('pasarse del tope ⇒ hueco · una factura no se decide por accidente', async () => {
    const muchos = Array.from({ length: TOPE_PEDIDOS + 1 }, (_, i) => ({ objetivo: 'o' + i }))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, pedidos: muchos }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(new RegExp(String(TOPE_PEDIDOS)))
  })

  it('un pedido suelto (sin `pedidos`) sigue valiendo · y vuelve en la lista', async () => {
    cadenaSupabase({ data: [fichaResumen()] })
    const { sobre } = await leerSobre(await pedir(cerebro, { client_id: 'c', objetivo: 'voz', params: { query: 'tono' } }))
    expect(sobre.respuestas).toHaveLength(1)
    expect(sobre.respuestas[0].estado).toBe('trajo')
  })
})

describe('🔴 una puerta NUNCA se cae · y un problema es HUECO, no «no hay»', () => {
  const casos: ReadonlyArray<[string, (r: Request) => Promise<Response>, unknown, string]> = [
    ['sin llave', apify, PEDIDO_APIFY, 'x-api-key'],
    ['cuerpo que no es JSON', apify, '{roto', 'no es JSON'],
    ['cuerpo vacío', posthog, '', 'vacío'],
    ['sin client_id', cerebro, { objetivo: 'x', params: { query: 'q' } }, 'client_id'],
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
    const { status, json } = await leer(await pedir(apify, PEDIDO_APIFY))
    expect(status).toBe(200)
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/ECONNREFUSED/)
  })

  it('sin credencial ⇒ sin_respuesta · «no se preguntó», NO «no hay»', async () => {
    delete process.env.APIFY_SERVICE_WEBHOOK_URL
    const { json } = await leer(await pedir(apify, PEDIDO_APIFY))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no está configurado/)
    expect(json.motivo).toMatch(/no es que no haya dato|NO se preguntó/)
  })

  it('el techo de tiempo se CUMPLE, no sólo se declara', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* nunca contesta */ })))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, limite_ms: 60 }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/se agotó el tiempo dado · 60 ms/)
    expect(json.limite_ms).toBe(60)
  })
})

describe('apify · los cuatro casos del Servicio llegan enteros', () => {
  const conSobre = async (sobre: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sobre), { status: 200 })))
    return (await leer(await pedir(apify, PEDIDO_APIFY))).json
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

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA FIRMA DE LA CORRIDA · no se inventa, o no se gasta
// ═══════════════════════════════════════════════════════════════════════════
describe('🔴 ③ la corrida de raspado se firma de VERDAD · o no corre', () => {
  const faltantes: ReadonlyArray<[string, Record<string, unknown>, RegExp]> = [
    ['sin workflow_id', { workflow_id: undefined }, /firma de la corrida[\s\S]*workflow_id/],
    ['sin workflow_execution_id', { workflow_execution_id: undefined }, /firma de la corrida[\s\S]*workflow_execution_id/],
    ['sin dry_run explícito', { dry_run: undefined }, /el ensayo se decide, no se asume/],
  ]
  for (const [etq, quitar, esperado] of faltantes) {
    it(etq + ' ⇒ sin_respuesta · y NO se llama al Servicio (no se gasta)', async () => {
      const espia = vi.fn(async () => new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', espia)
      const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, ...quitar }))
      expect(json.estado).toBe('sin_respuesta')
      expect(json.motivo).toMatch(esperado)
      expect(json.motivo).not.toMatch(/fui, mir/i)
      expect(espia).not.toHaveBeenCalled()
    })
  }

  it('🔴 con firma ⇒ el Servicio la recibe REAL · y NO un identificador inventado', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: false, chunks_count: 1, datos: '#' }), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, PEDIDO_APIFY)
    const cuerpo = JSON.parse((espia.mock.calls[0] as any)[1].body)
    expect(cuerpo.metadata.calling_workflow_id).toBe('PLAN3ac10nWf')
    expect(cuerpo.metadata.calling_workflow_execution_id).toBe('127323')
    // el defecto viejo, clavado como prueba: la puerta NO fabrica la firma
    expect(cuerpo.metadata.calling_workflow_id).not.toBe('planeacion')
    expect(String(cuerpo.metadata.calling_workflow_execution_id)).not.toMatch(/^puerta-/)
  })

  it('🔴 el destino NO escribe en el cerebro · y va con su dirección de vuelta', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: false, chunks_count: 1, datos: '#' }), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, PEDIDO_APIFY)
    const cuerpo = JSON.parse((espia.mock.calls[0] as any)[1].body)
    // `brain_rag`/`both` haría que el Servicio ESCRIBA en el cerebro del cliente
    expect(cuerpo.destination).toBe('callback_url')
    expect(cuerpo.callback_url).toBe(PEDIDO_APIFY.callback_url)
    expect(typeof cuerpo.dry_run).toBe('boolean')
  })

  it('🔴 un ENSAYO que vuelve con datos NO es `trajo` · el Servicio los inventa', async () => {
    // el Servicio en ensayo contesta con moldes sintéticos («Synthetic Competitor»)
    // y sin `cero` ⇒ el brazo lo leería como `trajo`. Medido en producción 10-sep.
    const espia = vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: false, chunks_count: 1, datos: 'Synthetic Competitor · 12345 seguidores' }), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const real = await leer(await pedir(apify, { ...PEDIDO_APIFY, dry_run: false }))
    expect(real.json.estado).toBe('trajo')
    const ensayo = await leer(await pedir(apify, { ...PEDIDO_APIFY, dry_run: true }))
    expect(ensayo.json.estado).toBe('sin_respuesta')
    expect(ensayo.json.motivo).toMatch(/FUE UN ENSAYO/)
    expect(ensayo.json.motivo).toMatch(/SINTÉTICOS/)
    expect(ensayo.json.datos).toEqual({})
  })

  it('el ensayo se pasa tal cual se decidió · true viaja true', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: true, cero: { clase: 'ensayo', se_miro_de_verdad: false } }), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, dry_run: true }))
    expect(JSON.parse((espia.mock.calls[0] as any)[1].body).dry_run).toBe(true)
    // y un ensayo NO se rotula «fui, miré y no hay»
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/NO SE MIRÓ DE VERDAD/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL TERCER DESTINO · devolver la respuesta a quien preguntó
// ═══════════════════════════════════════════════════════════════════════════
describe('🔴 el tercer destino · sin escribir en el cerebro y sin llamar a nadie', () => {
  const sobreOk = { ok: true, sin_resultados: false, chunks_count: 1, datos: '#' }

  it('sin dirección de vuelta ⇒ destino `respuesta` · NO `brain_rag`, NO punto de recepción propio', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, callback_url: undefined }))
    const cuerpo = JSON.parse((espia.mock.calls[0] as any)[1].body)
    expect(cuerpo.destination).toBe('respuesta')
    expect(cuerpo).not.toHaveProperty('callback_url')
    expect(json.estado).toBe('trajo')
  })

  it('con dirección de vuelta ⇒ se respeta el destino viejo · aditivo, no reemplazo', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, PEDIDO_APIFY)
    const cuerpo = JSON.parse((espia.mock.calls[0] as any)[1].body)
    expect(cuerpo.destination).toBe('callback_url')
    expect(cuerpo.callback_url).toBe(PEDIDO_APIFY.callback_url)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL VOCABULARIO · los objetivos del plan → los 20 nombres del proveedor
// ═══════════════════════════════════════════════════════════════════════════
describe('🔴 el vocabulario · el plan y el proveedor hablan distinto', () => {
  const sobreOk = { ok: true, sin_resultados: false, chunks_count: 1, datos: '#' }
  const funcionesPedidas = (espia: any): string[] =>
    espia.mock.calls.map((c: any) => JSON.parse(c[1].body).apify_function)

  it('la tabla cubre los objetivos de raspado que `elegir brazos` emite de verdad', () => {
    // medido · salidas reales de B1 (09-sep · consultora + gimnasio)
    for (const o of ['sitio_propio', 'ficha_mapa', 'redes_sociales', 'biblioteca_anuncios', 'tendencias_busqueda', 'competidores_precio']) {
      const t = traducir(o)
      expect(t.ok, o).toBe(true)
      if (t.ok) for (const f of t.funciones) expect(FUNCIONES_DEL_PROVEEDOR).toContain(f)
    }
  })

  it('`sitio_propio` sale traducido · el Servicio recibe el nombre que entiende', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'sitio_propio' })
    expect(funcionesPedidas(espia)).toEqual(['website_content_scraper'])
  })

  it('🔴 la ficha del mapa es la PROPIA · no la del competidor', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'ficha_mapa' })
    expect(funcionesPedidas(espia)).toEqual(['own_google_maps_profile'])
    expect(funcionesPedidas(espia)).not.toContain('google_maps_scraper')
  })

  it('🔴 `redes_sociales` son CINCO corridas · con YouTube adentro (canon)', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales' }))
    const fs = funcionesPedidas(espia)
    expect(fs).toHaveLength(5)
    expect([...fs].sort()).toEqual([
      'facebook_page_scraper', 'instagram_scraper', 'linkedin_company_scraper',
      'tiktok_profile_scraper', 'youtube_channel_scraper',
    ])
    // y las cinco vuelven en UNA sola respuesta del contrato
    expect(json.estado).toBe('trajo')
    expect(Object.keys(json.datos.por_funcion)).toHaveLength(5)
    expect(validarRespuesta(json)).toEqual([])
  })

  it('🔴 tres traen y dos no se pudieron ver ⇒ trajo, PERO el hueco viaja pegado', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      return new Response(JSON.stringify(n <= 3 ? sobreOk : { ok: true, sin_resultados: true, cero: { clase: 'no_pude_ver', motivo: 'sin credencial' } }), { status: 200 })
    }))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales' }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.trajeron).toHaveLength(3)
    expect(json.datos.huecos).toHaveLength(2)
    expect(String(json.datos.aviso)).toMatch(/no se sabe/)
  })

  it('🔴 una sola que nadie miró alcanza para que NO se pueda decir «no hay»', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      return new Response(JSON.stringify(n === 1
        ? { ok: true, skipped: true, skip_reason: 'function_null_per_tier' }
        : { ok: true, sin_resultados: true, cero: { clase: 'no_existe', motivo: 'no publica', se_miro_de_verdad: true } }), { status: 200 })
    }))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales' }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/NO es que no haya dato/)
  })

  it('🔴 el hueco DICE POR QUÉ falló cada corrida · un hueco mudo no se puede leer', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      return new Response(JSON.stringify(n === 1
        ? { ok: true, skipped: true, skip_reason: "function_null_per_tier" }
        : { ok: true, sin_resultados: true, cero: { clase: "no_pude_ver", motivo: "el sitio no contestó" } }), { status: 200 })
    }))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: "competidores_precio", params: {
      por_competidor: [{ url: "https://uno.test", competitor_id: "c-1" }, { url: "https://dos.test", competitor_id: "c-2" }],
    } }))
    expect(json.estado).toBe("sin_respuesta")
    expect(json.motivo).toMatch(/POR QUÉ/)
    expect(json.motivo).toMatch(/NADIE PREGUNTÓ/)
    expect(json.motivo).toMatch(/el sitio no contestó/)
  })

  it('las cinco miraron y ninguna tenía ⇒ sin_dato · recién ahí es información', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, sin_resultados: true, cero: { clase: 'no_existe', motivo: 'no publica', se_miro_de_verdad: true } }), { status: 200 })))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales' }))
    expect(json.estado).toBe('sin_dato')
    expect(json.motivo).toMatch(/fui, miré y no hay en las 5/)
  })

  it('🔴 `competidores_precio` es UNA función y UNA corrida POR COMPETIDOR', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'competidores_precio', params: {
      por_competidor: [
        { url: 'https://uno.test', competitor_id: 'c-1', nombre: 'Uno' },
        { url: 'https://dos.test', competitor_id: 'c-2', nombre: 'Dos' },
        { url: 'https://tres.test', competitor_id: 'c-3', nombre: 'Tres' },
      ],
    } }))
    const cuerpos = espia.mock.calls.map((c: any) => JSON.parse(c[1].body))
    expect(cuerpos).toHaveLength(3)
    // la MISMA función, tres veces, con su propio sitio y su propio identificador
    expect(new Set(cuerpos.map((b: any) => b.apify_function))).toEqual(new Set(['competitor_website_scraper']))
    expect(cuerpos.map((b: any) => b.params.competitor_id).sort()).toEqual(['c-1', 'c-2', 'c-3'])
    expect(cuerpos.map((b: any) => b.params.url).sort()).toEqual(['https://dos.test', 'https://tres.test', 'https://uno.test'])
    // y vuelve UNA sola respuesta del contrato, legible competidor por competidor
    expect(json.estado).toBe('trajo')
    expect(Object.keys(json.datos.por_funcion).sort()).toEqual([
      'competitor_website_scraper#c-1', 'competitor_website_scraper#c-2', 'competitor_website_scraper#c-3',
    ])
    expect(validarRespuesta(json)).toEqual([])
  })

  it('🔴 si un competidor no se pudo ver, NO se puede leer como el total', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      return new Response(JSON.stringify(n === 1 ? sobreOk : { ok: true, sin_resultados: true, cero: { clase: 'no_pude_ver', motivo: 'el sitio no contestó' } }), { status: 200 })
    }))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'competidores_precio', params: {
      por_competidor: [{ url: 'https://uno.test', competitor_id: 'c-1' }, { url: 'https://dos.test', competitor_id: 'c-2' }],
    } }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.huecos).toEqual(['competitor_website_scraper#c-2'])
    expect(String(json.datos.aviso)).toMatch(/de 1 de 2 no se sabe/)
  })

  it('un solo competidor ⇒ una corrida · la respuesta es la suya, sin envoltorio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 })))
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'competidores_precio', params: {
      por_competidor: [{ url: 'https://uno.test', competitor_id: 'c-1' }],
    } }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.por_funcion).toBeUndefined()
    expect(json.fuente).toMatch(/competitor_website_scraper#c-1/)
  })

  it('sin `por_competidor`, el objetivo sale como una sola corrida de siempre', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'competidores_precio', params: { url: 'https://x.test', competitor_id: 'c-9' } })
    expect(espia).toHaveBeenCalledTimes(1)
    expect(JSON.parse((espia.mock.calls[0] as any)[1].body).params.competitor_id).toBe('c-9')
  })

  it('🔴 una palabra que el proveedor no conoce NO se manda · se dice', async () => {
    const espia = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'lo_que_sea' }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no existe en el vocabulario/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
    expect(espia).not.toHaveBeenCalled()
  })

  it('un objetivo de OTRO brazo dice de cuál · no se convierte en hueco mudo', async () => {
    const espia = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', espia)
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'analitica_propia' }))
    expect(json.motivo).toMatch(/es del brazo posthog/)
    expect(espia).not.toHaveBeenCalled()
  })

  it('un objetivo sin herramienta lo declara · «no hay con qué» ≠ «no hay dato»', async () => {
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'velocidad_sitio' }))
    expect(json.motivo).toMatch(/no tiene herramienta/)
    expect(json.motivo).toMatch(/NO es que no haya dato/)
  })

  it('🔴 la red sin cuenta NO se pregunta · y el motivo dice la verdad', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    // así lo manda `elegir brazos`: sólo las redes que la ficha puede apuntar
    const { json } = await leer(await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales', params: {
      por_funcion: { instagram_scraper: { directUrls: ['https://instagram.com/x'] } },
      redes_con_cuenta: ['instagram'],
      redes_sin_cuenta: ['facebook', 'tiktok', 'linkedin', 'youtube'],
    } }))
    // una sola llamada, no cinco
    expect(funcionesPedidas(espia)).toEqual(['instagram_scraper'])
    // y las otras cuatro vuelven declaradas, no como «la llamada estaba mal armada»
    const pf = json.datos.por_funcion
    expect(pf.instagram_scraper.estado).toBe('trajo')
    for (const f of ['facebook_page_scraper', 'tiktok_profile_scraper', 'linkedin_company_scraper', 'youtube_channel_scraper']) {
      expect(pf[f].estado).toBe('sin_respuesta')
      expect(String(pf[f].motivo)).toMatch(/no trae parámetros/)
      expect(String(pf[f].motivo)).not.toMatch(/mal armada/)
    }
    expect(String(json.datos.aviso)).toMatch(/de 4 de 5 no se sabe/)
  })

  it('sin `por_funcion` declarado, no cambia nada · se pregunta todo', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales', params: { usernames: ['x'] } })
    expect(funcionesPedidas(espia)).toHaveLength(5)
  })

  it('cada red puede llevar sus propios parámetros', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify(sobreOk), { status: 200 }))
    vi.stubGlobal('fetch', espia)
    await pedir(apify, { ...PEDIDO_APIFY, objetivo: 'redes_sociales', params: {
      por_funcion: { instagram_scraper: { directUrls: ['ig'] }, youtube_channel_scraper: { startUrls: ['yt'] } },
    } })
    const cuerpos = espia.mock.calls.map((c: any) => JSON.parse(c[1].body))
    const ig = cuerpos.find((b: any) => b.apify_function === 'instagram_scraper')
    const yt = cuerpos.find((b: any) => b.apify_function === 'youtube_channel_scraper')
    expect(ig.params).toEqual({ directUrls: ['ig'] })
    expect(yt.params).toEqual({ startUrls: ['yt'] })
    // y `por_funcion` no se le cuela al proveedor como si fuera un parámetro suyo
    for (const b of cuerpos) expect(b.params).not.toHaveProperty('por_funcion')
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
    const { json } = await leer(await pedir(posthog, { objetivo: 'analitica_propia', params: { dominio: 'vacio.test' } }))
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
    const { json } = await leer(await pedir(posthog, { objetivo: 'analitica_propia', params: { dominio: 'a.test' } }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no es que el cliente no tenga visitas/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ② EL CEREBRO · LA CARPETA COMPLETA, no una búsqueda (FIRMA de Emilio 01-nov 08:42Z · punto 2)
// ═══════════════════════════════════════════════════════════════════════════
const RESUMEN_LARGO = 'r'.repeat(9000) // mucho más que el recorte viejo de 2.500 · va ENTERO
const fichaResumen = (over: Record<string, unknown> = {}) => ({
  id: 'rv', clase: 'resumen_vivo', atributo: 'resumen:cliente', contenido: RESUMEN_LARGO, que_es: '', observado_en: '2026-11-01T00:35:00Z',
  fecha_fuente: null, creado_en: '2026-11-01T00:35:00Z', vigente_hasta: null, retirada_en: null, descartada: false, sede: null, provenance_tag: {}, ...over,
})
const fichaInforme = (over: Record<string, unknown> = {}) => fichaResumen({
  id: 'inf', clase: 'informe_de_analisis', atributo: 'informe:competencia', contenido: 'informe de competencia', fecha_fuente: '2026-10-31T00:00:00Z',
  provenance_tag: { datos: { tipo: 'competencia', mesa: 'mesa_de_analisis', agente: 'competitive-intelligence-agent', citas: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] } }, ...over,
})

describe('🔴 ② el plan recibe la CARPETA completa · no busca por parecido', () => {
  it('NO llama a la búsqueda semántica ni ordena por fecha: lee la carpeta del portero, y los parámetros de la búsqueda vieja se ignoran y se declaran', async () => {
    const q = cadenaSupabase({ data: [fichaResumen()] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz', params: { query: '¿qué tono usamos?', k: 5, secciones: ['brand_books'] } }))
    expect(brain.queryClientBrain).not.toHaveBeenCalled()
    expect(q.order).not.toHaveBeenCalled()
    expect(json.estado).toBe('trajo')
    expect(json.fuente).toMatch(/sin búsqueda por parecido/)
    expect(json.fuente).toMatch(/ignorados: query, k, secciones/)
  })

  it('el resumen vivo vuelve ENTERO (sin el recorte de 2.500) y el estado de la carpeta se dice en una línea', async () => {
    cadenaSupabase({ data: [fichaResumen()] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz' }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.contexto_del_cliente.resumen_vivo.estado).toBe('vigente')
    expect(json.datos.contexto_del_cliente.resumen_vivo.texto).toHaveLength(9000)
    expect(json.datos.contexto_del_cliente.informes).toEqual([])
    expect(json.datos.carpeta).toEqual({ resumen_vivo: 'vigente', informes: 0, informes_estado: 'ok' })
    expect(json.datos.material_citado).toEqual({ ids: [], detalle: 'ningún informe cita material crudo' })
  })

  it('los informes vigentes de la mesa de análisis van uno por tipo con sus citas · y el material crudo solo por cita (ids para pedirlo al portero)', async () => {
    cadenaSupabase({ data: [fichaResumen(), fichaInforme()] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz' }))
    expect(json.estado).toBe('trajo')
    expect(json.datos.contexto_del_cliente.informes).toHaveLength(1)
    expect(json.datos.contexto_del_cliente.informes[0]).toMatchObject({ tipo: 'competencia', texto: 'informe de competencia', origen: 'sintesis_de_oficina', citas: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] })
    expect(json.datos.material_citado.ids).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
    expect(json.datos.material_citado.detalle).toMatch(/se pide al portero por su id/)
  })

  it('un objetivo de puros espacios NO es un objetivo ⇒ hueco', async () => {
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: '   ', params: { query: '  ' } }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/falta objetivo/)
    expect(json.objetivo).toBe('(sin objetivo)')
    expect(brain.queryClientBrain).not.toHaveBeenCalled()
  })
})

describe('cerebro · se LEE, y el vacío es información', () => {
  it('sin resumen vivo ni informes ⇒ sin_dato · «el portero todavía no armó la carpeta»', async () => {
    cadenaSupabase({ data: [] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz', params: { query: 'tono' } }))
    expect(json.estado).toBe('sin_dato')
    expect(json.motivo).toMatch(/fui, miré y no hay/)
    expect(json.motivo).toMatch(/no tiene carpeta todavía/)
  })

  it('🔴 un error de la lectura NO es «el cliente no tiene carpeta»', async () => {
    cadenaSupabase({ error: { message: 'connection reset' } })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz', params: { query: 'tono' } }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/connection reset/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
  })
})

describe('los dos campos opcionales viajan por las tres puertas', () => {
  it('limite_ms y proposito vuelven en la respuesta', async () => {
    cadenaSupabase({ data: [] })
    const { json } = await leer(await pedir(cerebro, { client_id: 'c', objetivo: 'voz', limite_ms: 5000, proposito: 'no repetir trabajo' }))
    expect(json.limite_ms).toBe(5000)
    expect(json.proposito).toBe('no repetir trabajo')
  })
})
