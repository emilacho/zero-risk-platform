/**
 * Encargo 15 + ADENDA 1 (21-nov) · el motivo real del fallo del cerebro no se traga, y «fallo» se distingue de «0 resultados».
 * Entre el 18 y el 21-nov el cerebro estuvo caído por saldo y el rastro solo decía `embed_query_failed`: tres días a ciegas.
 * US$ 0 · sin red (el proveedor de huellas y la puerta de alarmas son moldes).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { enrichSystemPromptWithClientBrain } from '../brain-enrichment'
import { avisarEsperaAlCerebro, CLAVE_DE_INCIDENTE_DEL_CEREBRO, esperaDelCerebro } from '../esperando-al-cerebro'

const respuesta = (status: number, cuerpo: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)), json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo) }) as Response

/** la base falsa mínima que el camino feliz necesita: rpc con trozos, la fila vigente del manual y las marcas de confianza */
function baseConTrozos(filas: Array<Record<string, unknown>>, opciones: { rpcError?: string; rpcLanza?: string; confianzaError?: string } = {}) {
  const cadena = (tabla: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) q[m] = () => q
    q.maybeSingle = async () => ({ data: tabla === 'client_brand_books' ? { id: 'manual-v2' } : null, error: null })
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(
      tabla === 'client_brain_chunks' && opciones.confianzaError
        ? { data: null, error: { message: opciones.confianzaError } }
        : { data: tabla === 'client_brain_chunks' ? filas.map((f) => ({ id: f.chunk_id, provenance_tag: { trust_level: 'canon' }, metadata: {} })) : [], error: null },
    ).then(r)
    return q
  }
  return {
    rpc: async () => {
      if (opciones.rpcLanza) throw new Error(opciones.rpcLanza)
      return opciones.rpcError ? { data: null, error: { message: opciones.rpcError } } : { data: filas, error: null }
    },
    from: (t: string) => cadena(t),
  } as never
}

const TROZO = { chunk_id: 't1', source_table: 'client_brand_books', source_id: 'manual-v2', section_label: 'voz', chunk_text: 'tuteo siempre', similarity: 0.9 }

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('🔴 el fallo del proveedor de huellas vuelve con su motivo (antes se tragaba)', () => {
  it('429 por saldo: brain_fallo, `embed_query_failed` y el detalle con status, type y code (el caso real del 18–21-nov)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(429, { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'You exceeded your current quota.' } }))
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'reel de olón' })
    expect(r).toMatchObject({ brain_hit: false, brain_fallo: true, error: 'embed_query_failed' })
    expect(r.brain_error_detalle).toContain('429')
    expect(r.brain_error_detalle).toContain('insufficient_quota')
    expect(r.brain_error_detalle).toContain('credit_balance_exhausted')
  })
  it('la llave jamás sale en el detalle: lo que parezca una llave queda redactado', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(401, { error: { type: 'invalid_request_error', code: 'invalid_api_key', message: 'Incorrect API key provided: sk-secreta9876543210' } }))
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'x' })
    expect(r.brain_fallo).toBe(true)
    expect(r.brain_error_detalle).toContain('sk-…')
    expect(r.brain_error_detalle).not.toContain('secreta9876543210')
  })
  it('sin llave en el entorno → fallo que lo dice; red caída → fallo «red: …»; cuerpo no-JSON → va como vino', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const sinLlave = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'x' })
    expect(sinLlave).toMatchObject({ brain_fallo: true, error: 'embed_query_failed' })
    expect(sinLlave.brain_error_detalle).toContain('sin llave')
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => { throw new Error('getaddrinfo ENOTFOUND api.openai.com') })
    const red = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'x' })
    expect(red.brain_fallo).toBe(true)
    expect(red.brain_error_detalle).toContain('red: getaddrinfo')
    vi.stubGlobal('fetch', async () => respuesta(502, 'Bad Gateway'))
    const crudo = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'x' })
    expect(crudo.brain_error_detalle).toContain('502')
    expect(crudo.brain_error_detalle).toContain('Bad Gateway')
  })
  it('la base que falla también es fallo: rpc caída y marcas de confianza caídas traen brain_fallo', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const rpc = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([], { rpcError: 'se cayó la base · llave sk-secreta7777777777' }), clientId: 'c1', taskDescription: 'x' })
    expect(rpc).toMatchObject({ brain_fallo: true })
    expect(rpc.error).toContain('rpc_error')
    // aviso menor de CC6: también `error` (que entra al motivo de la alarma) va redactado
    expect(rpc.error).toContain('sk-…')
    expect(rpc.error).not.toContain('secreta7777777777')
    // 🔴 e9 de CC6 en #1270: RPC bien, trozos que VUELVEN, y la lectura de marcas de confianza con error → fallo (el agente no crea sin poder verificar)
    const confianza = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([TROZO], { confianzaError: 'no pude leer las marcas de confianza' }), clientId: 'c1', taskDescription: 'x' })
    expect(confianza).toMatchObject({ brain_hit: false, brain_fallo: true, error: 'brain_trust_lookup_failed' })
    expect(confianza.brain_error_detalle).toContain('marcas de confianza')
  })
  it('🔴 (e11 de CC6) la base que LANZA a mitad de la consulta también es fallo, con el detalle y el error redactados', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([TROZO], { rpcLanza: 'timeout de la base · header Authorization: Bearer sk-secreta5555555555' }), clientId: 'c1', taskDescription: 'x' })
    expect(r).toMatchObject({ brain_hit: false, brain_fallo: true })
    expect(r.brain_error_detalle).toContain('timeout de la base')
    expect(r.brain_error_detalle).toContain('sk-…')
    expect(r.brain_error_detalle).not.toContain('secreta5555555555')
    expect(r.error).toContain('sk-…')
    expect(r.error).not.toContain('secreta5555555555')
  })
  it('🔴 (e12 de CC6) el proveedor responde 200 pero SIN huella en el cuerpo: es FALLO, no consulta vacía (el agente no sigue sin cerebro)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [] }))
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([TROZO]), clientId: 'c1', taskDescription: 'x' })
    expect(r).toMatchObject({ brain_hit: false, brain_fallo: true, error: 'embed_query_failed' })
    expect(r.brain_error_detalle).toContain('200 pero sin huella')
  })
})

describe('lo que NO es fallo no detiene', () => {
  it('0 resultados: `brain_empty_for_client` sigue SIN brain_fallo (la ADENDA: 0 resultados no detiene)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: 'x' })
    expect(r).toMatchObject({ brain_hit: false, error: 'brain_empty_for_client' })
    expect(r.brain_fallo).toBeUndefined()
  })
  it('consulta vacía: sin texto no hay qué buscar, sin brain_fallo; y sin cliente, ni se consulta', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    const vacia = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: 'c1', taskDescription: '   ' })
    expect(vacia).toMatchObject({ brain_hit: false, error: 'consulta_vacia' })
    expect(vacia.brain_fallo).toBeUndefined()
    const sinCliente = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos([]), clientId: null, taskDescription: 'x' })
    expect(sinCliente.brain_fallo).toBeUndefined()
  })
  it('el camino feliz sigue entero: 200 con huella y trozos → brain_hit true, sin brain_fallo', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const filas = [{ chunk_id: 't1', source_table: 'client_brand_books', source_id: 'manual-v2', section_label: 'voz', chunk_text: 'tuteo siempre', similarity: 0.9 }]
    const r = await enrichSystemPromptWithClientBrain({ supabase: baseConTrozos(filas), clientId: 'c1', taskDescription: 'reel de olón' })
    expect(r).toMatchObject({ brain_hit: true, brain_chunks_count: 1 })
    expect(r.brain_fallo).toBeUndefined()
    expect(r.enrichment).toContain('tuteo siempre')
  })
})

describe('esperaDelCerebro (la regla pura de la ADENDA 1)', () => {
  it('🔴 fallo y no seco → detiene, con el estado y el motivo completos en `error`', () => {
    const e = esperaDelCerebro({ brain_fallo: true, error: 'embed_query_failed', brain_error_detalle: 'el proveedor de huellas respondió 429 · insufficient_quota' }, false)
    expect(e).not.toBeNull()
    expect(e!.error).toMatch(/^esperando_al_cerebro: /)
    expect(e!.error).toContain('embed_query_failed')
    expect(e!.error).toContain('429 · insufficient_quota')
    expect(e!.error).toContain('se reintenta')
  })
  it('sin brain_fallo no detiene (0 resultados, consulta vacía, camino feliz); el seco tampoco', () => {
    expect(esperaDelCerebro({ error: 'brain_empty_for_client' }, false)).toBeNull()
    expect(esperaDelCerebro({}, false)).toBeNull()
    expect(esperaDelCerebro({ brain_fallo: true, error: 'embed_query_failed' }, true)).toBeNull()
  })
})

describe('avisarEsperaAlCerebro (la alarma por la puerta única de la plataforma)', () => {
  const env = { ZR_PLATFORM_URL: 'https://plataforma.prueba/', INTERNAL_API_KEY: 'llave-interna' }
  it('🔴 avisa UNA vez por la puerta `alimentar/alarma`: clave fija del incidente, dry_run false, el texto con agente y motivo', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = []
    const r = await avisarEsperaAlCerebro({ agente: 'social-media-strategist', cliente: 'c1', motivo: 'embed_query_failed · 429', env, fetchImpl: async (url, init) => { llamadas.push({ url, init }); return respuesta(200, { ok: true, accion: 'abrio', detalle: 'publicado' }) } })
    expect(r).toEqual({ entregada: true, detalle: 'abrio: publicado' })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://plataforma.prueba/api/brain/alimentar/alarma')
    expect((llamadas[0].init?.headers as Record<string, string>)['x-api-key']).toBe('llave-interna')
    const cuerpo = JSON.parse(String(llamadas[0].init?.body)) as Record<string, unknown>
    expect(cuerpo.dry_run).toBe(false)
    expect(cuerpo.clave).toBe(CLAVE_DE_INCIDENTE_DEL_CEREBRO)
    expect(String(cuerpo.texto)).toContain('social-media-strategist')
    expect(String(cuerpo.texto)).toContain('embed_query_failed · 429')
    expect(String(cuerpo.texto)).toContain('El cerebro no responde')
  })
  it('el aviso nunca tumba nada: sin entorno no llama; puerta en 500 o red caída → entregada false con su detalle', async () => {
    let llamo = 0
    const sinEntorno = await avisarEsperaAlCerebro({ agente: 'a', cliente: null, motivo: 'm', env: {}, fetchImpl: async () => { llamo++; return respuesta(200, {}) } })
    expect(sinEntorno.entregada).toBe(false)
    expect(sinEntorno.detalle).toContain('ZR_PLATFORM_URL')
    expect(llamo).toBe(0)
    const en500 = await avisarEsperaAlCerebro({ agente: 'a', cliente: null, motivo: 'm', env, fetchImpl: async () => respuesta(500, { ok: false }) })
    expect(en500).toMatchObject({ entregada: false })
    expect(en500.detalle).toContain('500')
    const caida = await avisarEsperaAlCerebro({ agente: 'a', cliente: null, motivo: 'm', env, fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    expect(caida).toMatchObject({ entregada: false, detalle: 'ECONNREFUSED' })
  })
  it('la puerta contesta 200 pero sin ok → no se da por entregada (como la regla de Slack sin confirmar)', async () => {
    const r = await avisarEsperaAlCerebro({ agente: 'a', cliente: 'c1', motivo: 'm', env, fetchImpl: async () => respuesta(200, { ok: false, accion: 'fallo', detalle: 'Slack no confirmó' }) })
    expect(r).toEqual({ entregada: false, detalle: 'fallo: Slack no confirmó' })
  })
})
