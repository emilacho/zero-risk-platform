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

  /**
   * Nombre honesto (caza CC#3): con un `fetch` de mentira NO existe el Data
   * Cache de Next, así que estas dos lecturas darían distinto aunque el arreglo
   * no estuviera. Lo que este test protege de verdad es que el `no-store` viaje
   * en CADA lectura y no solo en la primera — que es la parte que sí falla sin
   * el arreglo. La vivacidad real la prueba el A/B post-publicación, no esta suite.
   */
  it('manda no-store en CADA lectura, no solo en la primera', async () => {
    const { getSupabaseAdmin } = await importSupabaseLib()
    const supabase = getSupabaseAdmin()

    rows = [{ id: 'viejo', status: 'expired' }]
    const primera = await supabase.from('hitl_pending_approvals').select('*')

    rows = [{ id: 'nuevo', status: 'pending' }]
    const segunda = await supabase.from('hitl_pending_approvals').select('*')

    expect(primera.data).toEqual([{ id: 'viejo', status: 'expired' }])
    expect(segunda.data).toEqual([{ id: 'nuevo', status: 'pending' }])
    expect(captured).toHaveLength(2)
    expect(captured.every((c) => c.init.cache === 'no-store')).toBe(true)
  })

  /**
   * Guarda (caza CC#3 · `patch-fetch.js:295-302`): si un llamador manda
   * `next.revalidate` junto al `cache`, Next tira el `cache` con un warn y la
   * política se apaga sola. `noStoreFetch` desarma esa vía.
   */
  it('un next.revalidate del llamador NO puede apagar la política', async () => {
    const { noStoreFetch } = await importSupabaseLib()

    await noStoreFetch('https://ejemplo.test/x', {
      next: { revalidate: 60, tags: ['clientes'] },
    } as RequestInit)

    const init = captured[0].init as RequestInit & { next?: { revalidate?: number; tags?: string[] } }
    expect(init.cache).toBe('no-store')
    expect(init.next?.revalidate).toBeUndefined()
    // `tags` no compite con `cache` · se respeta
    expect(init.next?.tags).toEqual(['clientes'])
  })

  it('no inventa un next vacío cuando el llamador no mandó ninguno', async () => {
    const { noStoreFetch } = await importSupabaseLib()

    await noStoreFetch('https://ejemplo.test/x')

    expect('next' in captured[0].init).toBe(false)
    expect(captured[0].init.cache).toBe('no-store')
  })
})

/**
 * CANARIO DE VERSIÓN (caza CC#3 · P3).
 *
 * La suite de arriba protege la implementación ("el string no-store viaja en el
 * init"), no el comportamiento ("Next no cachea") — el Data Cache no es
 * testeable sin levantar Next. Riesgo concreto: si mañana se sube de major,
 * cambia la semántica de `cache` y los tests siguen TODOS verdes mientras el
 * bug vuelve en silencio.
 *
 * Este canario hace que esa subida NO pueda pasar desapercibida: falla y manda
 * a re-verificar la política contra el código nuevo de Next. Si falla por una
 * subida legítima, la acción NO es borrarlo — es re-verificar y actualizarlo.
 */
describe('canario · la política depende de la semántica de Next', () => {
  it('Next sigue en el major verificado y conserva la rama no-store → revalidate 0', async () => {
    const { readFileSync } = await import('node:fs')
    const { createRequire } = await import('node:module')
    const path = await import('node:path')

    const require_ = createRequire(import.meta.url)
    const nextPkgPath = require_.resolve('next/package.json')
    const { version } = JSON.parse(readFileSync(nextPkgPath, 'utf8')) as { version: string }

    expect(
      version.startsWith('14.'),
      `Next pasó a ${version}. La política no-store de src/lib/supabase.ts se verificó contra 14.x ` +
        `(patch-fetch.js:305 · module.js:242). Re-verificá el mecanismo contra el código nuevo ` +
        `— Next 15 invierte el default de fetch — y recién ahí actualizá este canario.`
    ).toBe(true)

    const patchFetch = readFileSync(
      path.join(path.dirname(nextPkgPath), 'dist/server/lib/patch-fetch.js'),
      'utf8'
    )
    expect(
      /_cache === "no-store"[\s\S]{0,200}curRevalidate = 0/.test(patchFetch),
      'patch-fetch.js ya no mapea cache:"no-store" a revalidate 0. La política dejó de tener efecto: re-verificá.'
    ).toBe(true)
  })
})
