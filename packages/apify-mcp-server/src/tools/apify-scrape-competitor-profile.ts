/**
 * apify_scrape_competitor_profile · función dedicada (ciclo CANDADO #1 · 2026-07-19).
 *
 * Scrape REAL del perfil de un competidor (Instagram o web) construido SOBRE los
 * primitivos operativos `run_actor` + `get_dataset` (vía `client.runActorAndCollect`,
 * que corre el actor y devuelve run_id + dataset_id + items).
 *
 * La salida es feed-compatible con `persistDiscoveryToBrain` (`DiscoveredCompetitor`
 * + `source`/`trust_level`/`deep_scan_data`) → el wiring (CC#3) la pasa al writer del
 * CEREBRO existente, que estampa procedencia REAL `apify_scrape` (#266), y al output
 * del re-discovery que el re-gate lee por competidor. Este tool NO escribe al CEREBRO
 * (eso es el writer · lo hace el wiring) · solo produce la evidencia real + su procedencia.
 *
 * §148 · el `source: 'apify_scrape'` sólo se emite cuando HUBO scrape real (status
 * 'scraped' con items) · un run vacío devuelve status 'empty' + competitor null (NUNCA
 * un tag de scrape sin scrape · el falso-verde de procedencia que estamos matando).
 */
import { z } from 'zod'
import type { ApifyClient } from '../client.js'

export const name = 'apify_scrape_competitor_profile'

export const argsSchema = z
  .object({
    name: z.string().min(1).max(200),
    handle: z.string().max(200).optional(),
    website: z.string().max(500).optional(),
    platform: z.enum(['instagram', 'web']).optional(),
    actor_id: z.string().max(200).optional(),
    competitor_type: z.string().max(40).optional(),
    timeout_ms: z.number().int().min(1000).max(600_000).optional(),
  })
  .refine((a) => Boolean(a.handle || a.website), {
    message: 'handle or website is required',
  })

export type CompetitorScrapeArgs = z.infer<typeof argsSchema>

/** Objeto competidor · superset de `DiscoveredCompetitor` (lo que consume el writer). */
export interface ScrapedCompetitor {
  name: string
  website: string | null
  handles: Record<string, string> | null
  competitor_type: string
  positioning: string | null
  why: string | null
  /** Procedencia REAL · sólo presente cuando hubo scrape real (§148). */
  source: 'apify_scrape'
  trust_level: 'untrusted'
  deep_scan_data: Record<string, unknown>
}

export interface CompetitorScrapeResult {
  ok: boolean
  status: 'scraped' | 'empty' | 'error'
  scraped_at: string
  platform: 'instagram' | 'web'
  actor_id: string
  run_id: string | null
  dataset_id: string | null
  competitor: ScrapedCompetitor | null
  raw_item_ref: { dataset_id: string | null; item_index: number } | null
  error?: string
}

const DEFAULT_IG_ACTOR = 'apify/instagram-profile-scraper'
const DEFAULT_WEB_ACTOR = 'apify/website-content-crawler'

/** Actor por defecto por plataforma · override por env (`APIFY_IG_PROFILE_ACTOR` /
 *  `APIFY_WEB_ACTOR`) · el override por input gana sobre todo. */
function resolveActor(platform: 'instagram' | 'web', override?: string): string {
  if (override && override.trim()) return override.trim()
  if (platform === 'instagram') return process.env.APIFY_IG_PROFILE_ACTOR ?? DEFAULT_IG_ACTOR
  return process.env.APIFY_WEB_ACTOR ?? DEFAULT_WEB_ACTOR
}

/** Normaliza un handle IG · saca '@' y una URL de perfil → username. */
function normalizeHandle(handle: string): string {
  let h = handle.trim().replace(/^@/, '')
  const m = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (m) h = m[1]
  return h.replace(/\/+$/, '')
}

function buildActorInput(
  platform: 'instagram' | 'web',
  handle: string | null,
  website?: string,
): Record<string, unknown> {
  if (platform === 'instagram' && handle) {
    // Forma canónica de los IG profile scrapers de Apify.
    return { usernames: [handle], resultsType: 'details' }
  }
  // Web · crawler de contenido de una sola URL.
  return { startUrls: website ? [{ url: website }] : [], maxCrawlPages: 1 }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

const set = (o: Record<string, unknown>, k: string, v: unknown): void => {
  if (v !== undefined) o[k] = v
}

/** Convierte el item crudo del actor en el competidor normalizado + su deep_scan_data. */
function normalizeCompetitor(p: {
  name: string
  website: string | null
  handle: string | null
  competitorType: string
  platform: 'instagram' | 'web'
  item: Record<string, unknown>
  scrapedAt: string
  actorId: string
  runId: string | null
}): ScrapedCompetitor {
  const deep: Record<string, unknown> = {
    scraped_at: p.scrapedAt,
    actor_id: p.actorId,
    run_id: p.runId,
    platform: p.platform,
  }
  let positioning: string | null = null
  let handles: Record<string, string> | null = null

  if (p.platform === 'instagram') {
    const it = p.item
    set(deep, 'followers_count', num(it.followersCount ?? it.followers))
    set(deep, 'following_count', num(it.followsCount ?? it.followingCount))
    set(deep, 'posts_count', num(it.postsCount ?? it.posts))
    set(deep, 'full_name', str(it.fullName))
    set(deep, 'biography', str(it.biography ?? it.bio))
    set(deep, 'is_verified', bool(it.verified ?? it.isVerified))
    set(deep, 'external_url', str(it.externalUrl ?? it.external_url))
    set(deep, 'profile_pic_url', str(it.profilePicUrl ?? it.profilePicUrlHD))
    const uname = str(it.username) ?? p.handle ?? undefined
    if (uname) handles = { instagram: uname.replace(/^@/, '') }
    const bio = str(it.biography ?? it.bio)
    if (bio) positioning = bio.slice(0, 500)
  } else {
    const it = p.item
    const meta = (it.metadata as Record<string, unknown> | undefined) ?? {}
    set(deep, 'title', str(it.title ?? meta.title))
    set(deep, 'url', str(it.url ?? it.loadedUrl ?? p.website ?? undefined))
    const text = str(it.text ?? it.markdown ?? it.content)
    if (text) {
      deep.text_excerpt = text.slice(0, 1000)
      positioning = text.slice(0, 500)
    }
  }

  return {
    name: p.name,
    website: p.website,
    handles,
    competitor_type: p.competitorType,
    positioning,
    why: `Perfil de competidor scrapeado (${p.platform}) · ${p.scrapedAt}`,
    source: 'apify_scrape',
    trust_level: 'untrusted',
    deep_scan_data: deep,
  }
}

export async function handler(
  client: ApifyClient,
  raw: unknown,
): Promise<CompetitorScrapeResult> {
  const args = argsSchema.parse(raw)
  const handle = args.handle ? normalizeHandle(args.handle) : null
  const platform: 'instagram' | 'web' = args.platform ?? (handle ? 'instagram' : 'web')
  const actorId = resolveActor(platform, args.actor_id)
  const scrapedAt = new Date().toISOString()
  const input = buildActorInput(platform, handle, args.website)

  let collected: { runId: string; datasetId: string | null; items: unknown[] }
  try {
    collected = await client.runActorAndCollect(actorId, input, args.timeout_ms ?? 120_000)
  } catch (e) {
    return {
      ok: false,
      status: 'error',
      scraped_at: scrapedAt,
      platform,
      actor_id: actorId,
      run_id: null,
      dataset_id: null,
      competitor: null,
      raw_item_ref: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const first = collected.items[0] as Record<string, unknown> | undefined
  if (!first) {
    // §148 · run vacío → NO se emite source apify_scrape (no hay scrape que fundamentar).
    return {
      ok: true,
      status: 'empty',
      scraped_at: scrapedAt,
      platform,
      actor_id: actorId,
      run_id: collected.runId,
      dataset_id: collected.datasetId,
      competitor: null,
      raw_item_ref: null,
    }
  }

  const competitor = normalizeCompetitor({
    name: args.name,
    website: args.website ?? null,
    handle,
    competitorType: args.competitor_type ?? 'direct',
    platform,
    item: first,
    scrapedAt,
    actorId,
    runId: collected.runId,
  })

  return {
    ok: true,
    status: 'scraped',
    scraped_at: scrapedAt,
    platform,
    actor_id: actorId,
    run_id: collected.runId,
    dataset_id: collected.datasetId,
    competitor,
    raw_item_ref: { dataset_id: collected.datasetId, item_index: 0 },
  }
}
