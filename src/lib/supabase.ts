import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * POLÍTICA GLOBAL DE CACHÉ DE LECTURA — un solo punto para todo el repo.
 *
 * Problema que arregla (medido · bandeja HITL ciega 2026-07-29):
 * supabase-js no trae fetch propio — usa el `fetch` global
 * (`resolveFetch`: `if (customFetch) ... else return (...args) => fetch(...args)`).
 * Dentro de la app publicada ese global lo parchea Next para el Data Cache.
 * Para un route handler que exporta SOLO GET, Next 14.2 deja
 * `staticGenerationStore.revalidate = userland.revalidate ?? false`
 * (`server/future/route-modules/app-route/module.js:242`), y con `false`
 * el fetch entra por la rama `"auto cache"` con `revalidate = false`
 * → `isCacheableRevalidate = true` → la respuesta de PostgREST se cachea
 * (`server/lib/patch-fetch.js:364-388`). Resultado: el endpoint sirve una
 * foto congelada por más que la base haya cambiado.
 *
 * `export const dynamic = 'force-dynamic'` NO alcanza: en un route handler
 * solo pone `staticGenerationStore.forceDynamic = true`
 * (`module.js:215-219`) — no toca `fetchCache` ni el `revalidate` del store.
 *
 * El arreglo va acá y no en cada ruta (eran 36 rutas afectadas de 110
 * lectoras) porque este archivo es el único lugar del repo donde se crea un
 * cliente `createClient` de datos. `cache: 'no-store'` fuerza `revalidate = 0`
 * (`patch-fetch.js:305`) y la respuesta deja de ser cacheable, en cualquier
 * versión de Next y sin depender de que cada ruta se acuerde.
 *
 * (Precisión · caza CC#3: existen 4 `createServerClient` de `@supabase/ssr`
 * — `supabase-server.ts` · `auth-middleware.ts` · `api/auth/route.ts` ·
 * `middleware.ts` — que NO pasan por acá. No son un hueco: ningún `route.ts`
 * los importa, `supabase-server.ts` no tiene importadores, y `middleware.ts`
 * corre en Edge, donde no hay Data Cache. Son sesión/auth, no lectura de datos.)
 *
 * Fuera de Next (scripts, tests, runtime del agente) `cache` es una opción
 * estándar de `RequestInit` que undici acepta y trata como no-op.
 *
 * REGLA: los datos operativos se leen VIVOS. Si algún día una lectura quiere
 * caché a propósito, se declara en ESA ruta (`export const revalidate = N`),
 * nunca aflojando esta política. Ver
 * `zr-vault/raw/findings/2026-07-30-CC2-lectura-congelada-cache-global.md`.
 */
type NextFetchInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }

export const noStoreFetch: typeof fetch = (input, init) => {
  const { next, ...rest } = (init ?? {}) as NextFetchInit

  // Guarda (caza CC#3 · `patch-fetch.js:295-302`): si el llamador manda
  // `next.revalidate` JUNTO al `cache`, Next descarta el `cache` con un warn y
  // la política se apaga sola, en silencio. supabase-js no lo hace hoy, pero la
  // vía existe — así que la cerramos acá en vez de confiar en que nadie la use.
  // `tags` sí se respeta: no entra en conflicto con `cache`.
  const safeNext = next ? { ...next } : undefined
  if (safeNext) delete safeNext.revalidate

  return fetch(input, {
    ...rest,
    ...(safeNext && Object.keys(safeNext).length > 0 ? { next: safeNext } : {}),
    cache: 'no-store',
  } as NextFetchInit)
}

const noStoreOptions = { global: { fetch: noStoreFetch } }

// Client-side: uses anon key (subject to RLS)
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, noStoreOptions)
  : null

// Server-side: uses service role key (bypasses RLS)
// Use this for API routes that need to insert/update data
const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, noStoreOptions)
  : null

export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  return supabase
}

// For server-side API routes — bypasses RLS
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured. Set SUPABASE_SERVICE_ROLE_KEY.')
  }
  return supabaseAdmin
}
