/**
 * Onboarding multi-source discovery · deterministic URL classifier + guardrails
 * (dispatch 2026-06-27 · worker LyVoKcrypS5uLyuu) · §144 rama · NO prod.
 *
 * Source of truth for the worker's node-16 classifier + fallback + degradation.
 * The n8n Code nodes (scripts/worker-staging/LyVoKcrypS5uLyuu/*.js) embed an
 * inline JS MIRROR of these functions (n8n can't import repo TS) · this module
 * is the TESTED algorithm · keep both in sync.
 *
 * Canonical taxonomy (dispatch) ·
 *   source      · 'apify_scrape' | 'onboarding_discovery' | 'search'
 *   trust_level · 'untrusted' (all Apify/search) | 'tenant_trusted' (direct client datum)
 *   type        · 'evidence' (always)
 *
 * §150 G5 cap ($5/run) · max_competitors_to_scrape=10 · max_actors_per_run=3 ·
 * dedup by URL before firing actors.
 */

export type DiscoverySource = 'apify_scrape' | 'onboarding_discovery' | 'search'
export type TrustLevel = 'untrusted' | 'tenant_trusted'

/** §150 G5 guardrails · canonical caps for a single discovery run. */
export const DISCOVERY_GUARDRAILS = {
  max_competitors_to_scrape: 10,
  max_actors_per_run: 3,
} as const

/** Apify actor function names · MUST match the Apify Service `3lyknrP3PoS2KzUf`
 *  `Switch · apify_function` cases EXACTLY (verified 2026-06-28 · §148). The
 *  Service routes on the LONG `*_scraper` names · short names get dropped at the
 *  Switch default.
 *
 *  ⚠️ `google_maps_scraper` + `tweet_scraper` have NO route in the Service yet
 *  (no Switch case). They are emitted by this classifier but the Service GATES
 *  them (graceful skip) until it gains the cases + actor nodes ·
 *    google_maps_scraper → compass/crawler-google-places
 *    tweet_scraper       → apidojo/tweet-scraper
 */
export type ApifyFunction =
  | 'instagram_scraper'
  | 'linkedin_company_scraper'
  | 'facebook_ads_library_scraper'
  | 'tiktok_profile_scraper'
  | 'google_serp_scraper'
  | 'google_maps_scraper' // no Service route yet
  | 'tweet_scraper' // no Service route yet

/** Result of classifying a single URL. */
export type UrlClassification =
  | {
      readonly kind: 'apify'
      readonly apify_function: ApifyFunction
      readonly source: 'apify_scrape'
    }
  | {
      // Generic web URL · NO Apify actor (no generic web scraper in the Service)
      // → the onboarding agent uses its own web_fetch.
      readonly kind: 'web_generic'
      readonly apify_function: null
      readonly source: 'onboarding_discovery'
    }
  | null

/** Lowercase + strip protocol/www for stable matching + dedup. */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  if (t.length === 0) return null
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
}

/**
 * Classify ONE url deterministically by host pattern. Returns null for empty /
 * non-string input (caller treats null as "no URL → fallback").
 */
export function classifyUrl(raw: unknown): UrlClassification {
  const n = normalizeUrl(raw)
  if (!n) return null

  if (n.includes('instagram.com') || n.includes('instagr.am')) {
    return { kind: 'apify', apify_function: 'instagram_scraper', source: 'apify_scrape' }
  }
  if (n.includes('linkedin.com/company')) {
    return { kind: 'apify', apify_function: 'linkedin_company_scraper', source: 'apify_scrape' }
  }
  if (n.includes('facebook.com') || n.includes('fb.com')) {
    return { kind: 'apify', apify_function: 'facebook_ads_library_scraper', source: 'apify_scrape' }
  }
  if (n.includes('tiktok.com')) {
    return { kind: 'apify', apify_function: 'tiktok_profile_scraper', source: 'apify_scrape' }
  }
  // twitter.com (substring safe) · x.com matched at host boundary so "fox.com"
  // / "box.com" do NOT false-positive (normalizeUrl already stripped www).
  if (n.includes('twitter.com') || n === 'x.com' || n.startsWith('x.com/')) {
    return { kind: 'apify', apify_function: 'tweet_scraper', source: 'apify_scrape' }
  }
  // Google Maps place/listing URL · the local-presence actor.
  if (n.includes('google.com/maps') || n.includes('maps.google.com') || n.includes('goo.gl/maps')) {
    return { kind: 'apify', apify_function: 'google_maps_scraper', source: 'apify_scrape' }
  }
  // Generic web URL · no Apify actor · agent web_fetch path.
  return { kind: 'web_generic', apify_function: null, source: 'onboarding_discovery' }
}

/** A scrape target ready for the Apify Service split (or the agent web_fetch). */
export interface ScrapeTarget {
  readonly url: string
  readonly apify_function: ApifyFunction | null
  readonly source: DiscoverySource
  readonly trust_level: TrustLevel
  readonly type: 'evidence'
}

export interface BuildScrapeTargetsResult {
  readonly scrape_targets: ScrapeTarget[]
  /** Targets dropped by the caps · for observability in sources[]. */
  readonly dropped: {
    readonly by_competitor_cap: number
    readonly by_actor_cap: number
    readonly duplicates: number
  }
  readonly guardrails: typeof DISCOVERY_GUARDRAILS
}

/**
 * Build deterministic scrape_targets[] from a list of candidate URLs (the
 * client's own website + social handles + discovered competitor URLs).
 *
 * Order of enforcement · (1) dedup by normalized URL · (2) classify ·
 * (3) competitor cap (max 10 apify targets) · (4) actor cap (max 3 distinct
 * apify actors). web_generic targets do NOT count toward the actor cap (no
 * actor fires) but DO count toward the competitor cap (one scrape unit each).
 */
export function buildScrapeTargets(
  urls: ReadonlyArray<unknown>,
  opts: { readonly trust_level?: TrustLevel } = {},
): BuildScrapeTargetsResult {
  const trust_level: TrustLevel = opts.trust_level ?? 'untrusted'
  const seen = new Set<string>()
  let duplicates = 0
  let byCompetitorCap = 0
  let byActorCap = 0

  const targets: ScrapeTarget[] = []
  const actorsUsed = new Set<ApifyFunction>()

  for (const raw of urls) {
    const n = normalizeUrl(raw)
    if (!n) continue
    if (seen.has(n)) {
      duplicates++
      continue
    }
    seen.add(n)

    const cls = classifyUrl(raw)
    if (!cls) continue

    // (3) competitor cap · total scrape units.
    if (targets.length >= DISCOVERY_GUARDRAILS.max_competitors_to_scrape) {
      byCompetitorCap++
      continue
    }

    if (cls.kind === 'apify') {
      // (4) actor cap · max distinct apify actors per run.
      if (
        !actorsUsed.has(cls.apify_function) &&
        actorsUsed.size >= DISCOVERY_GUARDRAILS.max_actors_per_run
      ) {
        byActorCap++
        continue
      }
      actorsUsed.add(cls.apify_function)
      targets.push({
        url: n,
        apify_function: cls.apify_function,
        source: cls.source,
        trust_level,
        type: 'evidence',
      })
    } else {
      targets.push({
        url: n,
        apify_function: null,
        source: cls.source,
        trust_level,
        type: 'evidence',
      })
    }
  }

  return {
    scrape_targets: targets,
    dropped: { by_competitor_cap: byCompetitorCap, by_actor_cap: byActorCap, duplicates },
    guardrails: DISCOVERY_GUARDRAILS,
  }
}

/**
 * Fallback (Tarea 2) · when the webhook has NO website, search for competitors
 * via the `google_serp` Apify actor. Returns a single search ScrapeTarget.
 */
export function buildFallbackSearchTarget(input: {
  readonly company_name?: string | null
  readonly industry?: string | null
}): ScrapeTarget {
  const name = (input.company_name ?? '').trim()
  const industry = (input.industry ?? '').trim()
  const query = [`${name} competitors`, industry].filter((s) => s.length > 0).join(' ')
  return {
    url: `serp:${query}`,
    apify_function: 'google_serp_scraper',
    source: 'search',
    trust_level: 'untrusted',
    type: 'evidence',
  }
}

/**
 * Fallback (extended) · when the webhook has NO website but DOES carry a
 * location/city, also probe local presence via `google_maps_scraper`
 * (compass/crawler-google-places). Complements the google_serp fallback ·
 * returns null when no location is provided (maps needs a place to search).
 */
export function buildFallbackMapsTarget(input: {
  readonly company_name?: string | null
  readonly industry?: string | null
  readonly location?: string | null
}): ScrapeTarget | null {
  const location = (input.location ?? '').trim()
  if (location.length === 0) return null
  const subject = (input.company_name ?? '').trim() || (input.industry ?? '').trim()
  const query = [subject, location].filter((s) => s.length > 0).join(' ')
  return {
    url: `maps:${query}`,
    apify_function: 'google_maps_scraper',
    source: 'search',
    trust_level: 'untrusted',
    type: 'evidence',
  }
}

/** Per-actor result handed to the aggregation step. */
export interface ActorResult {
  readonly apify_function: ApifyFunction | string
  readonly ok: boolean
  readonly count?: number
  readonly error?: string
}

/** One row of the `sources[]` array attached to discovery_package. */
export interface SourceEntry {
  readonly apify_function: ApifyFunction | string
  readonly status: 'ok' | 'failed'
  readonly count: number
  readonly trust_level: TrustLevel
  readonly error?: string
}

export interface AggregateSourcesResult {
  readonly sources: SourceEntry[]
  readonly ok_count: number
  readonly failed_count: number
  readonly total_results: number
}

/**
 * Graceful degradation (Tarea 3) · aggregate per-actor results into sources[].
 * A failed actor is marked `status:'failed'` and the run CONTINUES · never
 * aborts the whole discovery for one down source.
 */
export function aggregateDiscoverySources(
  results: ReadonlyArray<ActorResult>,
): AggregateSourcesResult {
  const sources: SourceEntry[] = []
  let ok = 0
  let failed = 0
  let total = 0
  for (const r of results) {
    if (r.ok) {
      ok++
      const c = typeof r.count === 'number' ? r.count : 0
      total += c
      sources.push({
        apify_function: r.apify_function,
        status: 'ok',
        count: c,
        trust_level: 'untrusted',
      })
    } else {
      failed++
      sources.push({
        apify_function: r.apify_function,
        status: 'failed',
        count: 0,
        trust_level: 'untrusted',
        error: r.error ?? 'actor failed',
      })
    }
  }
  return { sources, ok_count: ok, failed_count: failed, total_results: total }
}
