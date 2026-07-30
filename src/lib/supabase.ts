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
 * cliente de Supabase. `cache: 'no-store'` fuerza `revalidate = 0`
 * (`patch-fetch.js:305`) y la respuesta deja de ser cacheable, en cualquier
 * versión de Next y sin depender de que cada ruta se acuerde.
 *
 * Fuera de Next (scripts, tests, runtime del agente) `cache` es una opción
 * estándar de `RequestInit` que undici acepta y trata como no-op.
 *
 * REGLA: los datos operativos se leen VIVOS. Si algún día una lectura quiere
 * caché a propósito, se declara en ESA ruta (`export const revalidate = N`),
 * nunca aflojando esta política. Ver
 * `zr-vault/raw/findings/2026-07-30-CC2-lectura-congelada-cache-global.md`.
 */
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' })

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
