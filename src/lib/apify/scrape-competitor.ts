/**
 * scrapeCompetitorProfile · scrape REAL de perfil de competidor (Instagram o web).
 *
 * CANDADO #1 · RELOCADO desde `packages/apify-mcp-server/src/tools/
 * apify-scrape-competitor-profile.ts` (#296, CC#1) para que sea importable desde el
 * endpoint `/api/competitors/scrape-verify` (la app no depende del paquete MCP). Copia
 * FIEL de la lógica testeada · misma normalización + procedencia honesta. Consolidación
 * a única fuente = candado.
 *
 * §148 · `source: 'apify_scrape'` SOLO cuando hubo scrape real (status 'scraped' con
 * items) · run vacío → status 'empty' + competitor null (NUNCA tag de scrape sin scrape).
 */
import type { ApifyClient } from './client'

export interface CompetitorScrapeArgs {
  name: string
  handle?: string
  website?: string
  platform?: 'instagram' | 'web'
  actor_id?: string
  competitor_type?: string
  timeout_ms?: number
}

/** Validación plana (sin zod · zod no es dep de la app) · espeja el contrato de #296. */
export function parseArgs(raw: unknown): CompetitorScrapeArgs {
  const r = (raw ?? {}) as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) throw new Error('name is required')
  const handle = typeof r.handle === 'string' && r.handle.trim() ? r.handle.trim() : undefined
  const website = typeof r.website === 'string' && r.website.trim() ? r.website.trim() : undefined
  if (!handle && !website) throw new Error('handle or website is required')
  const platform = r.platform === 'instagram' || r.platform === 'web' ? r.platform : undefined
  const actor_id = typeof r.actor_id === 'string' && r.actor_id.trim() ? r.actor_id.trim() : undefined
  const competitor_type =
    typeof r.competitor_type === 'string' && r.competitor_type.trim() ? r.competitor_type.trim() : undefined
  const timeout_ms =
    typeof r.timeout_ms === 'number' && Number.isFinite(r.timeout_ms) ? r.timeout_ms : undefined
  return { name, handle, website, platform, actor_id, competitor_type, timeout_ms }
}

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

/** Actor por defecto por plataforma · override por env · el override por input gana. */
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
    return { usernames: [handle], resultsType: 'details' }
  }
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

export async function scrapeCompetitorProfile(
  client: ApifyClient,
  raw: unknown,
): Promise<CompetitorScrapeResult> {
  const args = parseArgs(raw)
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
