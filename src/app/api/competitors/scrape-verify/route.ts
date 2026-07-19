/**
 * POST /api/competitors/scrape-verify · CANDADO #1 · el "camino al supervisor".
 *
 * Seam entre la función de scrape real (CC#1 #296 · relocada a `@/lib/apify`) y el
 * writer del CEREBRO con procedencia honesta (CC#4 #297 · guard `scrape_trace`). El
 * wiring n8n de re-discovery (CC#3) llama a este endpoint con los top-N competidores;
 * el endpoint scrapea REAL, persiste con procedencia `apify_scrape` (SOLO con traza
 * real) y devuelve por competidor `source`/`trust_level`/`deep_scan_data` — el campo
 * que el nodo `[APIFY] Enrich` threadea al output que el re-gate agente LEE.
 *
 * Diseño (contrato lockeado #equipo 2026-07-19 + 2 agregados de Lenovo):
 *  · SINGULAR por competidor (1 corrida por handle/website · tope de gasto claro).
 *  · TIMEOUT→advisory (Lenovo 1): presupuesto por competidor · vencido/fallo →
 *    degrada honesto a `auto_discovery` · un robot lento JAMÁS cuelga el alta.
 *  · IDEMPOTENCIA (Lenovo 2): match-then-upsert de la fila landscape + persistChunks
 *    upsertea por (client_id, source_table, source_id, section_label) → re-correr NO
 *    duplica.
 *  · PROCEDENCIA HONESTA (CC#4): `scrape_trace:true` SOLO cuando status==='scraped'
 *    (items reales) · empty/error → sin trace → el guard degrada a auto_discovery.
 *    CERO fabricación.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ApifyClient } from '@/lib/apify/client'
import {
  scrapeCompetitorProfile,
  type CompetitorScrapeResult,
} from '@/lib/apify/scrape-competitor'
import { persistChunks } from '@/lib/brain/persist-chunks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/** Tope de tiempo por competidor (Lenovo agregado 1) · vencido → degrada honesto. */
const PER_COMPETITOR_TIMEOUT_MS = 110_000
/** Tope de competidores por llamada (contrato · acota gasto para el tope $2). */
const MAX_COMPETITORS = 5

interface CompetitorInput {
  name?: string
  handle?: string
  website?: string
  competitor_type?: string
}

/** Competidor enriquecido que el `[APIFY] Enrich` de n8n threadea al re-gate. */
interface EnrichedCompetitor {
  name: string
  website: string | null
  handles: Record<string, string> | null
  competitor_type: string
  positioning: string | null
  source: 'apify_scrape' | 'auto_discovery'
  trust_level: 'untrusted'
  deep_scan_data: Record<string, unknown>
  scraped: boolean
  run_id?: string | null
  scrape_status?: CompetitorScrapeResult['status']
}

function degraded(c: CompetitorInput, status?: CompetitorScrapeResult['status']): EnrichedCompetitor {
  // Degradación honesta (parte 3) · el re-gate ve la VERDAD `auto_discovery` y decide.
  return {
    name: String(c.name ?? '').trim(),
    website: c.website ?? null,
    handles: c.handle ? { instagram: c.handle.replace(/^@/, '') } : null,
    competitor_type: c.competitor_type ?? 'direct',
    positioning: null,
    source: 'auto_discovery',
    trust_level: 'untrusted',
    deep_scan_data: {},
    scraped: false,
    scrape_status: status,
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | { __timeout: true }> {
  return Promise.race([
    p,
    new Promise<{ __timeout: true }>((resolve) => setTimeout(() => resolve({ __timeout: true }), ms)),
  ])
}

/**
 * Idempotente · encuentra la fila landscape para (client, competitor) o la crea.
 * Espeja la precedencia de `/api/competitors/deep-report` (name → website). Devuelve
 * el id o null (fallo de persistencia NO tumba el resultado · el scrape ya es válido).
 */
async function upsertLandscape(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
  comp: NonNullable<CompetitorScrapeResult['competitor']>,
): Promise<string | null> {
  const nowIso = new Date().toISOString()
  try {
    let existingId: string | null = null
    const byName = await supabase
      .from('client_competitive_landscape')
      .select('id')
      .eq('client_id', clientId)
      .eq('competitor_name', comp.name)
      .maybeSingle()
    existingId = (byName.data?.id as string | undefined) ?? null

    if (!existingId && comp.website) {
      const byWeb = await supabase
        .from('client_competitive_landscape')
        .select('id')
        .eq('client_id', clientId)
        .eq('competitor_website', comp.website)
        .maybeSingle()
      existingId = (byWeb.data?.id as string | undefined) ?? null
    }

    if (existingId) {
      await supabase
        .from('client_competitive_landscape')
        .update({
          deep_scan_data: comp.deep_scan_data,
          analysis_source: 'apify_scrape',
          last_analyzed_at: nowIso,
          updated_at: nowIso,
          ...(comp.website ? { competitor_website: comp.website } : {}),
        })
        .eq('id', existingId)
      return existingId
    }

    const ins = await supabase
      .from('client_competitive_landscape')
      .insert({
        client_id: clientId,
        competitor_name: comp.name,
        competitor_website: comp.website,
        competitor_type: comp.competitor_type,
        deep_scan_data: comp.deep_scan_data,
        analysis_source: 'apify_scrape',
        last_analyzed_at: nowIso,
      })
      .select('id')
      .single()
    return (ins.data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

/** Texto del chunk que va al CEREBRO como evidencia real (bio/posicionamiento + métricas). */
function competitorEvidenceText(comp: NonNullable<CompetitorScrapeResult['competitor']>): string {
  const d = comp.deep_scan_data
  const bits: string[] = [comp.name]
  if (comp.positioning) bits.push(comp.positioning)
  const metric = (k: string, label: string) =>
    d[k] !== undefined ? `${label}: ${String(d[k])}` : null
  const metrics = [
    metric('followers_count', 'seguidores'),
    metric('following_count', 'siguiendo'),
    metric('posts_count', 'posts'),
    metric('is_verified', 'verificado'),
  ].filter(Boolean)
  if (metrics.length) bits.push(metrics.join(' · '))
  if (comp.website) bits.push(comp.website)
  return bits.join(' — ').slice(0, 4000)
}

export async function POST(request: Request): Promise<Response> {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  let body: { client_id?: string; workflow_id?: string; competitors?: CompetitorInput[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  if (!clientId) {
    return NextResponse.json({ error: 'missing_field', field: 'client_id' }, { status: 400 })
  }

  const rawList = Array.isArray(body.competitors) ? body.competitors : []
  const competitors = rawList
    .filter((c) => c && typeof c.name === 'string' && c.name.trim() && (c.handle || c.website))
    .slice(0, MAX_COMPETITORS)

  if (competitors.length === 0) {
    return NextResponse.json(
      { error: 'no_scrapeable_competitors', detail: 'each competitor needs name + (handle|website)' },
      { status: 400 },
    )
  }

  const token = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? ''
  if (!token) {
    // Sin token no hay scrape posible · degradación honesta total (no 5xx · el alta sigue).
    return NextResponse.json({
      ok: true,
      degraded_all: true,
      reason: 'apify_token_missing',
      competitors: competitors.map((c) => degraded(c)),
      scraped_count: 0,
      degraded_count: competitors.length,
    })
  }

  const apify = new ApifyClient({ token })
  const supabase = getSupabaseAdmin()

  // Scrapes en PARALELO · cada uno con su tope de tiempo (advisory) · fallo/timeout →
  // degradación honesta · nunca throwea al request.
  const results = await Promise.all(
    competitors.map(async (c): Promise<EnrichedCompetitor> => {
      try {
        const scraped = await withTimeout(
          scrapeCompetitorProfile(apify, {
            name: c.name,
            handle: c.handle,
            website: c.website,
            competitor_type: c.competitor_type,
            timeout_ms: PER_COMPETITOR_TIMEOUT_MS,
          }),
          PER_COMPETITOR_TIMEOUT_MS,
        )

        if ('__timeout' in scraped) return degraded(c, 'error')
        const r = scraped as CompetitorScrapeResult

        if (r.status !== 'scraped' || !r.competitor) {
          // empty/error → sin scrape real → sin scrape_trace → auto_discovery honesto.
          return degraded(c, r.status)
        }

        // Persistencia con procedencia REAL apify_scrape (scrape_trace:true SOLO acá).
        const comp = r.competitor
        try {
          const landscapeId = await upsertLandscape(supabase, clientId, comp)
          if (landscapeId) {
            await persistChunks(supabase, {
              clientId,
              sourceTable: 'client_competitive_landscape',
              sourceId: landscapeId,
              chunks: [{ section_label: 'apify_profile', chunk_text: competitorEvidenceText(comp) }],
              source: 'apify_scrape',
              trustLevel: 'untrusted',
              scrapeTrace: true, // ← traza real · el guard de CC#4 PRESERVA apify_scrape
            })
          }
        } catch {
          // Persistencia falló · el scrape SIGUE siendo válido para el re-gate (el
          // enrich lee el return, no el CEREBRO) · durabilidad se reintenta luego.
        }

        return {
          name: comp.name,
          website: comp.website,
          handles: comp.handles,
          competitor_type: comp.competitor_type,
          positioning: comp.positioning,
          source: 'apify_scrape',
          trust_level: 'untrusted',
          deep_scan_data: comp.deep_scan_data,
          scraped: true,
          run_id: r.run_id,
          scrape_status: 'scraped',
        }
      } catch {
        return degraded(c, 'error')
      }
    }),
  )

  const scrapedCount = results.filter((r) => r.scraped).length
  return NextResponse.json({
    ok: true,
    client_id: clientId,
    workflow_id: body.workflow_id ?? null,
    competitors: results,
    scraped_count: scrapedCount,
    degraded_count: results.length - scrapedCount,
    note:
      scrapedCount === 0
        ? 'no real scrapes · all degraded to auto_discovery (honest)'
        : `${scrapedCount} scraped with real apify_scrape provenance`,
  })
}

export function GET(): Response {
  return NextResponse.json({
    endpoint: '/api/competitors/scrape-verify',
    method: 'POST',
    body: '{ client_id, workflow_id?, competitors: [{name, handle?, website?, competitor_type?}] } (top-5)',
    returns:
      '{ competitors: [{name, source, trust_level, deep_scan_data, scraped}], scraped_count, degraded_count }',
    candado: '#1 · seam scrape(CC#1 #296) → writer(CC#4 #297 scrape_trace) → re-gate (wiring CC#3)',
  })
}
