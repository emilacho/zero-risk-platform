/**
 * rate-limit.ts · Wave 12 (CC#1)
 *
 * In-memory token-bucket rate limiter para routes Next.js. Sin dependencias
 * externas (no Redis · no Upstash · no Vercel KV) · ideal para Wave 12 quick
 * win sin cambios de infra. Para multi-instance Vercel deployments, considerar
 * Vercel KV o Upstash Redis en Wave 13+.
 *
 * Limitaciones honestas:
 * - In-memory · estado se pierde al cold start (Vercel function recycle).
 * - No comparte estado entre instances Vercel (cada lambda tiene su mapa).
 * - Útil contra burst attacks individuales · NO contra sustained DDoS.
 * - Para auth-protected internal routes, principal protección es x-api-key.
 *
 * Adoption pattern:
 *
 *   import { checkRateLimit, getClientKey } from '@/lib/rate-limit'
 *
 *   export async function POST(request: Request) {
 *     const rl = checkRateLimit(getClientKey(request), { max: 30, windowMs: 60000 })
 *     if (!rl.allowed) {
 *       return apiErrors.rateLimited(`Rate limit exceeded · retry in ${rl.retryAfterMs}ms`)
 *     }
 *     // ... handler
 *   }
 */

interface BucketState {
  /** Timestamps de requests dentro del window · trim automático */
  hits: number[]
}

const BUCKETS: Map<string, BucketState> = new Map()

/** Clean stale buckets cada N invocations para no leak memoria */
let _cleanupCounter = 0
const CLEANUP_EVERY = 100
const STALE_AFTER_MS = 600_000 // 10 min sin actividad → drop

function maybeCleanup(now: number): void {
  if (++_cleanupCounter < CLEANUP_EVERY) return
  _cleanupCounter = 0
  for (const [key, bucket] of BUCKETS.entries()) {
    const lastHit = bucket.hits[bucket.hits.length - 1] ?? 0
    if (now - lastHit > STALE_AFTER_MS) BUCKETS.delete(key)
  }
}

export interface RateLimitOptions {
  /** Max requests permitidos en el window */
  max: number
  /** Window en milisegundos */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Requests usados en el window actual (incluye este si allowed) */
  current: number
  /** Requests restantes (max - current) · 0 si bloqueado */
  remaining: number
  /** Si !allowed: ms hasta que el oldest hit expire del window */
  retryAfterMs: number
}

/**
 * Verifica + registra un hit contra el rate limiter.
 *
 * @param key Identificador del cliente · usar getClientKey(request)
 * @param opts max + windowMs
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  maybeCleanup(now)

  const bucket = BUCKETS.get(key) ?? { hits: [] }
  // Trim hits fuera del window
  const cutoff = now - opts.windowMs
  bucket.hits = bucket.hits.filter((t) => t > cutoff)

  if (bucket.hits.length >= opts.max) {
    const oldest = bucket.hits[0]
    BUCKETS.set(key, bucket)
    return {
      allowed: false,
      current: bucket.hits.length,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + opts.windowMs - now),
    }
  }

  bucket.hits.push(now)
  BUCKETS.set(key, bucket)
  return {
    allowed: true,
    current: bucket.hits.length,
    remaining: opts.max - bucket.hits.length,
    retryAfterMs: 0,
  }
}

/**
 * Deriva client identifier desde el request · IP (X-Forwarded-For preferred,
 * fallback to request connection · y x-api-key como salt si está presente).
 *
 * Pattern: usa IP+ApiKey si está autenticado · solo IP si público.
 */
export function getClientKey(request: Request): string {
  const xff = request.headers.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-ip'
  const apiKey = request.headers.get('x-api-key') ?? ''
  // Solo usar primeros 8 chars del key como salt para no leak el secret en bucket map
  const salt = apiKey ? `:k${apiKey.slice(0, 8)}` : ''
  return `${ip}${salt}`
}

/**
 * Test/debug helper · resetea todos los buckets.
 */
export function _resetRateLimitForTesting(): void {
  BUCKETS.clear()
  _cleanupCounter = 0
}
