/**
 * auth-middleware.ts · Wave 13 (CC#1)
 *
 * Auth tiers para Next.js routes en `src/app/api/**`. Tres tiers explícitos:
 *
 *   1. requireInternalApiKey()  → x-api-key header vs INTERNAL_API_KEY env
 *                                  (n8n webhooks · Mission Control backend · cron)
 *   2. requireSupabaseSession()  → JWT cookie + Supabase server client
 *                                  (dashboard reads from authenticated UI · Wave 14+ adoption)
 *   3. allowPublic()             → marker explícito · NO mutation · grep-able
 *                                  (health checks · public webhooks por design)
 *
 * Pattern de uso (call site):
 *
 *   import { requireInternalApiKey } from '@/lib/auth-middleware'
 *
 *   export async function POST(request: Request) {
 *     const auth = await requireInternalApiKey(request)
 *     if (!auth.ok) return auth.response
 *     // ... handler logic
 *   }
 *
 * Diseño:
 * - Devuelven `{ ok, response? }` · NO arrojan · caller decide qué hacer.
 * - response es ya un NextResponse listo · drop-in al return.
 * - Compatible con `checkInternalKey` existente (same env var · same x-api-key header).
 *
 * Compat-mode con el patrón legacy `checkInternalKey()`: ambos coexisten.
 * Routes nuevas usan el wrapper async; routes existentes siguen funcionando sin cambio.
 */
import crypto from 'node:crypto'
import { apiErrors } from '@/lib/api-errors'
import type { NextResponse } from 'next/server'

// ────────────────────────────────────────────────────────────────────────────
// Tipos canónicos
// ────────────────────────────────────────────────────────────────────────────

export interface AuthSuccess {
  ok: true
  /** User identity (cuando aplica) · null para internal-key auth */
  userId: string | null
  /** Tier que pasó · útil para logs */
  tier: 'internal_api_key' | 'supabase_session' | 'public'
}

export interface AuthFailure {
  ok: false
  /** Reason interna (NO se devuelve al cliente · solo logs/Sentry) */
  reason: string
  /** NextResponse listo para `return` · contiene el body de error apropiado */
  response: NextResponse
}

export type AuthResult = AuthSuccess | AuthFailure

// ────────────────────────────────────────────────────────────────────────────
// requireInternalApiKey
// ────────────────────────────────────────────────────────────────────────────

const INTERNAL_KEY_HEADERS = ['x-api-key', 'x-internal-api-key', 'x-internal-key'] as const

/**
 * Valida x-api-key (o aliases x-internal-api-key, x-internal-key) contra
 * INTERNAL_API_KEY env. Timing-safe compare.
 *
 * Para n8n webhooks · Mission Control backend · cron jobs.
 *
 * @returns AuthSuccess con tier='internal_api_key' o AuthFailure con 401 response.
 */
export async function requireInternalApiKey(request: Request): Promise<AuthResult> {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) {
    // Server misconfiguration · 500 (no 401 porque el cliente no puede arreglarlo)
    return {
      ok: false,
      reason: 'INTERNAL_API_KEY env var not configured on server',
      response: apiErrors.serviceUnavailable('Server auth misconfigured'),
    }
  }

  // Trial multiple header aliases (compat con routes que usan x-internal-key vs x-api-key)
  let got = ''
  for (const h of INTERNAL_KEY_HEADERS) {
    const v = request.headers.get(h)
    if (v) {
      got = v
      break
    }
  }

  if (!got) {
    return {
      ok: false,
      reason: `Missing internal key header (expected one of: ${INTERNAL_KEY_HEADERS.join(', ')})`,
      response: apiErrors.unauthorized('Missing internal API key header'),
    }
  }

  // Timing-safe compare · ambos buffers deben ser same length
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      ok: false,
      reason: 'Invalid internal API key',
      response: apiErrors.unauthorized('Invalid internal API key'),
    }
  }

  return { ok: true, userId: null, tier: 'internal_api_key' }
}

// ────────────────────────────────────────────────────────────────────────────
// requireSupabaseSession
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valida sesión Supabase desde cookies SSR. Para routes consumidas por la UI
 * autenticada de Mission Control directamente (NO via backend MC).
 *
 * REQUIERE setup: `@supabase/ssr` ya instalado · `/api/auth/route.ts` ya
 * configura cookies-aware client.
 *
 * Wave 13 status: helper completo · adoption por route puede esperar a Wave 14
 * (clasificar qué routes deben usar session vs internal-api-key fue decisión
 * de scope · ver docs/05-orquestacion/CC1_W13_FINDINGS.md).
 *
 * @returns AuthSuccess con userId o AuthFailure con 401 response.
 */
export async function requireSupabaseSession(_request: Request): Promise<AuthResult> {
  // Lazy import · no cargar @supabase/ssr en routes que solo usan internal key
  let createServerClient: typeof import('@supabase/ssr').createServerClient
  let cookies: typeof import('next/headers').cookies
  try {
    ;({ createServerClient } = await import('@supabase/ssr'))
    ;({ cookies } = await import('next/headers'))
  } catch (err) {
    return {
      ok: false,
      reason: `Supabase SSR deps not available: ${err instanceof Error ? err.message : String(err)}`,
      response: apiErrors.serviceUnavailable('Supabase SSR auth unavailable'),
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      reason: 'Supabase URL/anon key not configured',
      response: apiErrors.serviceUnavailable('Server auth misconfigured'),
    }
  }

  try {
    const cookieStore = cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // route handlers don't write cookies on auth check · noop
        },
      },
    })

    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return {
        ok: false,
        reason: error?.message ?? 'No active Supabase session',
        response: apiErrors.unauthorized('Authentication required'),
      }
    }

    return { ok: true, userId: data.user.id, tier: 'supabase_session' }
  } catch (err) {
    return {
      ok: false,
      reason: `Session check threw: ${err instanceof Error ? err.message : String(err)}`,
      response: apiErrors.unauthorized('Session validation failed'),
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// allowPublic (marker · grep-able)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Marker explícito para routes que son INTENCIONALMENTE públicas (sin auth).
 * NO hace nada en runtime · solo sirve como audit trail + JSDoc enforcement.
 *
 * USO OBLIGATORIO en routes públicas para que el audit script (Wave 14+) pueda
 * distinguir "intencionalmente público" vs "olvido de auth":
 *
 *   export async function GET() {
 *     allowPublic('@public-intentional: health probe · no PII · no mutation')
 *     return NextResponse.json({ status: 'ok' })
 *   }
 *
 * El audit `grep -L "checkInternalKey\\|requireInternalApiKey\\|requireSupabaseSession\\|allowPublic"`
 * identificará routes sin auth declarada · obligando a clasificar.
 *
 * @param reason Explicación legible · DEBE empezar con "@public-intentional:" para grep.
 */
export function allowPublic(reason: string): AuthSuccess {
  if (!reason || !reason.startsWith('@public-intentional:')) {
    // Dev-time signal: si alguien usa allowPublic sin la convención, queda
    // visible en logs de desarrollo (pero NO rompe runtime · prod silent).
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        '[auth-middleware] allowPublic() called without "@public-intentional:" prefix. ' +
          'Use the marker convention so audits can distinguish from auth bugs.',
      )
    }
  }
  return { ok: true, userId: null, tier: 'public' }
}
