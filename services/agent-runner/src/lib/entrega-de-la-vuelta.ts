/**
 * ARQ 2026-09-30 · EL CORREDOR ENTREGA LA VUELTA (CC#1).
 *
 * Hoy la vuelta la manda Vercel, y Vercel tiene una pared de 800 s: un trabajo más largo termina, se cobra y nadie se lo
 * cuenta al flujo que esperaba (corrida 157555: 1923 s · US$ 1,99). Con `callback_mode: "runner"` el corredor contesta 202 al
 * instante, hace el trabajo sin reloj de Vercel y hace él mismo el POST a `callback_url`. Este módulo es SOLO ese POST y su guardia.
 *
 * 🔴 CONTROL DE SEGURIDAD (no opcional): el corredor NO llama a cualquier dirección. Sólo a NUESTRO n8n (host en la lista blanca),
 * por https, sin usuario/clave en la dirección y en la ruta de reanudación de la espera (`/webhook-waiting/`). Si no lo es:
 * no llama, lo registra y lo dice fuerte (400 al que pidió + Sentry + intento `blocked_host` en el registro).
 */

export const HOST_N8N_POR_DEFECTO = 'n8n-production-72be.up.railway.app'
export const RUTA_DE_REANUDACION = '/webhook-waiting/'
export const ENTREGA_INTENTOS_MAX = 3
export const ENTREGA_ESPERA_ENTRE_INTENTOS_MS = [2000, 4000] as const
export const ENTREGA_TIMEOUT_MS = 30_000
export const ENCABEZADO_DE_ORIGEN = 'x-zr-async-callback'
/** Tope del gancho de espera de la prueba (sólo con dry_run) · 25 min. */
export const ESPERA_FORZADA_MAX_MS = 1_500_000

export type DireccionValida = { ok: true; url: URL } | { ok: false; motivo: string }

/** Los hosts que se aceptan: el n8n por defecto + `CALLBACK_ALLOWED_HOSTS` (coma) + el host de `N8N_BASE_URL` si está. */
export function hostsPermitidos(env: Record<string, string | undefined>): string[] {
  const hosts = new Set<string>([HOST_N8N_POR_DEFECTO])
  for (const h of (env.CALLBACK_ALLOWED_HOSTS ?? '').split(',')) {
    const t = h.trim().toLowerCase()
    if (t) hosts.add(t)
  }
  if (env.N8N_BASE_URL) {
    try {
      hosts.add(new URL(env.N8N_BASE_URL).host.toLowerCase())
    } catch {
      /* una N8N_BASE_URL rota no ensancha la lista */
    }
  }
  return [...hosts]
}

export function validarDireccionDeVuelta(raw: unknown, env: Record<string, string | undefined> = process.env): DireccionValida {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, motivo: 'callback_url ausente' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, motivo: 'callback_url no es una dirección válida' }
  }
  if (u.protocol !== 'https:') return { ok: false, motivo: 'callback_url debe ser https' }
  if (u.username || u.password) return { ok: false, motivo: 'callback_url no puede llevar usuario/clave' }
  if (!hostsPermitidos(env).includes(u.host.toLowerCase())) {
    return { ok: false, motivo: `el host ${u.host} no es de nuestro n8n (lista blanca)` }
  }
  if (!u.pathname.startsWith(RUTA_DE_REANUDACION)) {
    return { ok: false, motivo: `la ruta debe empezar por ${RUTA_DE_REANUDACION} (reanudación de una espera)` }
  }
  return { ok: true, url: u }
}

export interface IntentoDeEntrega {
  attempt_number: number
  status: 'ok' | 'non_2xx' | 'timeout' | 'fetch_threw' | 'blocked_host'
  http_status_code: number | null
  error_message: string | null
  attempted_at: string
}

export interface ResultadoDeEntrega {
  ok: boolean
  intentos: IntentoDeEntrega[]
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>

/**
 * POST con 3 intentos como tope (2 s / 4 s) · reintenta sólo lo transitorio (red, tiempo, 5xx) · un 4xx es definitivo
 * (404 = la espera ya no existe, 409 = ya se reanudó) y reintentar no lo cambia. Cada intento se informa por `alIntentar`.
 */
export async function entregarLaVuelta(opts: {
  url: URL
  cuerpo: unknown
  fetcher?: Fetcher
  esperar?: (ms: number) => Promise<void>
  alIntentar?: (i: IntentoDeEntrega) => void
  timeoutMs?: number
}): Promise<ResultadoDeEntrega> {
  const fetcher = (opts.fetcher ?? (fetch as unknown as Fetcher))
  const esperar = opts.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const intentos: IntentoDeEntrega[] = []
  const cuerpo = JSON.stringify(opts.cuerpo)
  for (let n = 1; n <= ENTREGA_INTENTOS_MAX; n++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? ENTREGA_TIMEOUT_MS)
    const attempted_at = new Date().toISOString()
    let intento: IntentoDeEntrega
    let transitorio = false
    try {
      const res = await fetcher(opts.url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ENCABEZADO_DE_ORIGEN]: 'agent-runner' },
        body: cuerpo,
        signal: controller.signal,
      })
      if (res.status >= 200 && res.status < 300) {
        intento = { attempt_number: n, status: 'ok', http_status_code: res.status, error_message: null, attempted_at }
      } else {
        intento = { attempt_number: n, status: 'non_2xx', http_status_code: res.status, error_message: `HTTP ${res.status}`, attempted_at }
        transitorio = res.status >= 500
      }
    } catch (e) {
      const abort = e instanceof Error && e.name === 'AbortError'
      intento = {
        attempt_number: n,
        status: abort ? 'timeout' : 'fetch_threw',
        http_status_code: null,
        error_message: e instanceof Error ? e.message : String(e),
        attempted_at,
      }
      transitorio = true
    } finally {
      clearTimeout(timer)
    }
    intentos.push(intento)
    try {
      opts.alIntentar?.(intento)
    } catch {
      /* el registro nunca frena la entrega */
    }
    if (intento.status === 'ok') return { ok: true, intentos }
    if (!transitorio || n === ENTREGA_INTENTOS_MAX) return { ok: false, intentos }
    await esperar(ENTREGA_ESPERA_ENTRE_INTENTOS_MS[n - 1] ?? 4000)
  }
  return { ok: false, intentos }
}

/** El cuerpo de la vuelta · mismos campos que la vuelta de Vercel (`baseResponse`) para el agente elegible + la marca de quién entregó. */
export function cuerpoDeLaVuelta(
  result: {
    success?: boolean
    response?: string
    sessionId?: string | null
    model?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    durationMs?: number
    brainEnrichment?: unknown
    cacheMetrics?: unknown
    error?: string
  },
  contexto: { agentName: string; dispatchKey: string | null },
): Record<string, unknown> {
  const marca = { delivered_by: 'runner', dispatch_key: contexto.dispatchKey }
  if (!result.success) {
    return {
      success: false,
      agent: contexto.agentName,
      error: result.error ?? 'agent run failed',
      error_kind: 'runner_run_failed',
      // lo gastado también viaja en el FALLO: un corte por tope gasta, y el parte tiene que poder decir cuánto
      ...(typeof result.costUsd === 'number' ? { cost_usd: result.costUsd } : {}),
      ...marca,
    }
  }
  return {
    success: true,
    agent: contexto.agentName,
    response: result.response,
    session_id: result.sessionId ?? null,
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    ...(result.brainEnrichment ? { brain_enrichment: result.brainEnrichment } : {}),
    ...(result.cacheMetrics ? { cache_metrics: result.cacheMetrics } : {}),
    ...marca,
  }
}

/** Gancho de la prueba del rojo · SÓLO con dry_run (cero costo) · nunca retrasa ni cobra una corrida real. */
export function esperaForzadaMs(dryRun: boolean, raw: unknown): number {
  if (!dryRun) return 0
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.floor(n), ESPERA_FORZADA_MAX_MS)
}

// ── EL EVENTO DE ANALÍTICA · simetría con Vercel (decisión de Emilio 2026-09-30) ─────────────────────────────────────
// Por la vía normal, `run-sdk` (Vercel) emite `agent_run_completed` a PostHog al recibir la respuesta. Por la vía del corredor
// Vercel corta antes, así que el corredor lo emite con EL MISMO nombre, la MISMA clave de persona y las MISMAS propiedades:
// «simétrico o nada» (perder sólo la mitad de la pareja haría leer «el brief falla siempre»). Se distingue sólo por `emitted_by`.
export const EVENTO_CORRIDA_COMPLETA = 'agent_run_completed'

export function eventoDeCorridaCompleta(
  result: { success?: boolean; durationMs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number },
  ctx: { agentName: string; clientId: string | null },
): { event: string; distinctId: string; properties: Record<string, unknown> } {
  return {
    event: EVENTO_CORRIDA_COMPLETA,
    distinctId: String(ctx.clientId || 'system'),
    properties: {
      agent_slug: ctx.agentName,
      success: !!result.success,
      duration_ms: result.durationMs ?? 0,
      input_tokens: result.inputTokens ?? 0,
      output_tokens: result.outputTokens ?? 0,
      cost_usd: result.costUsd ?? 0,
      emitted_by: 'agent-runner',
    },
  }
}

type FetcherPosthog = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number }>

/** Captura HTTP de PostHog · sin dependencia nueva · NUNCA lanza ni frena la entrega · sin llave ⇒ no hace nada (y lo dice una vez). */
export async function emitirEventoPostHog(
  ev: { event: string; distinctId: string; properties: Record<string, unknown> },
  env: Record<string, string | undefined> = process.env,
  fetcher: FetcherPosthog = fetch as unknown as FetcherPosthog,
): Promise<'enviado' | 'sin_llave' | 'fallo'> {
  const key = env.POSTHOG_API_KEY
  if (!key) return 'sin_llave'
  try {
    const host = (env.POSTHOG_API_URL || 'https://us.i.posthog.com').replace(/\/+$/, '')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const r = await fetcher(`${host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, event: ev.event, distinct_id: ev.distinctId, properties: ev.properties, timestamp: new Date().toISOString() }),
        signal: controller.signal,
      })
      return r.status >= 200 && r.status < 300 ? 'enviado' : 'fallo'
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return 'fallo'
  }
}
