/**
 * Política global de caché de lectura · regresión de la "bandeja ciega".
 *
 * Qué protege: `GET /api/hitl/approvals/pending` (y otras 35 rutas lectoras)
 * servían una foto congelada porque supabase-js sale por el `fetch` global —
 * el que Next parchea para el Data Cache — y en un route handler que exporta
 * solo GET ese fetch cae en la rama `"auto cache"` con `revalidate = false`.
 * `src/lib/supabase.ts` ahora inyecta un fetch con `cache: 'no-store'`.
 *
 * Estos tests fallan si alguien saca la política, la aplica a un solo cliente,
 * o la implementa pisando el `init` (lo que rompería la autenticación).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const URL_ = 'https://proyecto-de-prueba.supabase.co'
const ANON = 'anon-de-prueba'
const SERVICE = 'service-de-prueba'

type Captured = { url: string; init: RequestInit }

/** Respuesta PostgREST mínima válida para que supabase-js la parsee. */
function postgrestOk(rows: unknown[]): Response {
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Importa el módulo fresco con las variables de entorno puestas. */
async function importSupabaseLib() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE)
  return import('../supabase')
}

describe('política global de caché · lectura viva, nunca foto congelada', () => {
  let captured: Captured[]
  let rows: unknown[]

  beforeEach(() => {
    captured = []
    rows = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input), init: init ?? {} })
      return postgrestOk(rows)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('el cliente admin manda cache: no-store en la consulta real', async () => {
    const { getSupabaseAdmin } = await importSupabaseLib()
    rows = [{ id: 1, status: 'pending' }]

    const { data, error } = await getSupabaseAdmin().from('hitl_pending_approvals').select('*')

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 1, status: 'pending' }])
    expect(captured).toHaveLength(1)
    expect(captured[0].init.cache).toBe('no-store')
  })

  it('el cliente anon también · la política es global, no solo del admin', async () => {
    const { getSupabase } = await importSupabaseLib()

    await getSupabase().from('clients').select('id')

    expect(captured).toHaveLength(1)
    expect(captured[0].init.cache).toBe('no-store')
  })

  it('no pisa el resto del init · la autenticación sigue viajando', async () => {
    const { getSupabaseAdmin } = await importSupabaseLib()

    await getSupabaseAdmin().from('clients').select('id')

    const headers = new Headers(captured[0].init.headers)
    expect(headers.get('apikey')).toBe(SERVICE)
    expect(headers.get('authorization')).toBe(`Bearer ${SERVICE}`)
    expect(captured[0].init.method?.toUpperCase()).toBe('GET')
  })

  it('preserva method, body, headers y signal cuando envuelve el fetch', async () => {
    const { noStoreFetch } = await importSupabaseLib()
    const controller = new AbortController()

    await noStoreFetch('https://ejemplo.test/x', {
      method: 'POST',
      body: '{"a":1}',
      headers: { 'x-propia': 'sí' },
      signal: controller.signal,
    })

    const init = captured[0].init
    expect(init.cache).toBe('no-store')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(new Headers(init.headers).get('x-propia')).toBe('sí')
    expect(init.signal).toBe(controller.signal)
  })

  it('la respuesta refleja la base VIVA, no la primera lectura (el bug de la bandeja)', async () => {
    const { getSupabaseAdmin } = await importSupabaseLib()
    const supabase = getSupabaseAdmin()

    rows = [{ id: 'viejo', status: 'expired' }]
    const primera = await supabase.from('hitl_pending_approvals').select('*')

    // la base cambia entre lecturas · sin no-store el Data Cache devolvería la 1ª
    rows = [{ id: 'nuevo', status: 'pending' }]
    const segunda = await supabase.from('hitl_pending_approvals').select('*')

    expect(primera.data).toEqual([{ id: 'viejo', status: 'expired' }])
    expect(segunda.data).toEqual([{ id: 'nuevo', status: 'pending' }])
    expect(captured).toHaveLength(2)
    expect(captured.every((c) => c.init.cache === 'no-store')).toBe(true)
  })
})
