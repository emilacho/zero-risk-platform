/**
 * Tests · onboarding multi-source discovery classifier (dispatch 2026-06-27).
 * Covers · URL classification · guardrails (max_competitors=10, max_actors=3,
 * dedup) · source+trust_level tagging · fallback google_serp · graceful
 * degradation + sources[].
 */
import { describe, it, expect } from 'vitest'
import {
  DISCOVERY_GUARDRAILS,
  normalizeUrl,
  classifyUrl,
  buildScrapeTargets,
  buildFallbackSearchTarget,
  buildFallbackMapsTarget,
  aggregateDiscoverySources,
} from '../src/lib/onboarding-discovery/url-classifier'

describe('guardrail constants', () => {
  it('caps are 10 competitors / 3 actors (§150 G5)', () => {
    expect(DISCOVERY_GUARDRAILS.max_competitors_to_scrape).toBe(10)
    expect(DISCOVERY_GUARDRAILS.max_actors_per_run).toBe(3)
  })
})

describe('normalizeUrl', () => {
  it('strips protocol/www/trailing-slash, lowercases', () => {
    expect(normalizeUrl('HTTPS://www.Foo.com/')).toBe('foo.com')
  })
  it('null for empty/non-string', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
    expect(normalizeUrl(undefined)).toBeNull()
    expect(normalizeUrl(42)).toBeNull()
  })
})

describe('classifyUrl · canonical host → actor mapping', () => {
  it('instagram → instagram_scraper / apify_scrape', () => {
    expect(classifyUrl('https://instagram.com/acme')).toMatchObject({
      apify_function: 'instagram_scraper',
      source: 'apify_scrape',
    })
    expect(classifyUrl('http://instagr.am/x')?.apify_function).toBe('instagram_scraper')
  })
  it('linkedin company → linkedin_company', () => {
    expect(classifyUrl('https://www.linkedin.com/company/acme')?.apify_function).toBe(
      'linkedin_company',
    )
  })
  it('linkedin NON-company → web_generic (no company actor)', () => {
    expect(classifyUrl('https://linkedin.com/in/someone')?.source).toBe('onboarding_discovery')
  })
  it('facebook → facebook_ads', () => {
    expect(classifyUrl('https://facebook.com/acme')?.apify_function).toBe('facebook_ads')
  })
  it('tiktok → tiktok_profile', () => {
    expect(classifyUrl('https://tiktok.com/@acme')?.apify_function).toBe('tiktok_profile')
  })
  it('twitter / x.com → tweet_scraper', () => {
    expect(classifyUrl('https://twitter.com/acme')?.apify_function).toBe('tweet_scraper')
    expect(classifyUrl('https://x.com/acme')?.apify_function).toBe('tweet_scraper')
    expect(classifyUrl('x.com')?.apify_function).toBe('tweet_scraper')
  })
  it('x.com host-boundary guard · fox.com / box.com are NOT tweet_scraper', () => {
    expect(classifyUrl('https://fox.com')?.apify_function).toBeNull() // web_generic
    expect(classifyUrl('https://box.com')?.source).toBe('onboarding_discovery')
  })
  it('google maps URL → google_maps_scraper', () => {
    expect(classifyUrl('https://google.com/maps/place/Acme')?.apify_function).toBe('google_maps_scraper')
    expect(classifyUrl('https://maps.google.com/?q=acme')?.apify_function).toBe('google_maps_scraper')
  })
  it('generic web URL → web_generic / onboarding_discovery (agent web_fetch)', () => {
    const c = classifyUrl('https://acme-corp.com')
    expect(c).toMatchObject({ kind: 'web_generic', apify_function: null, source: 'onboarding_discovery' })
  })
  it('no URL → null', () => {
    expect(classifyUrl('')).toBeNull()
    expect(classifyUrl(null)).toBeNull()
  })
})

describe('buildScrapeTargets · tagging + dedup', () => {
  it('tags every target source + trust_level untrusted + type evidence', () => {
    const r = buildScrapeTargets(['https://instagram.com/a', 'https://acme.com'])
    expect(r.scrape_targets).toHaveLength(2)
    for (const t of r.scrape_targets) {
      expect(t.trust_level).toBe('untrusted')
      expect(t.type).toBe('evidence')
    }
    expect(r.scrape_targets[0].source).toBe('apify_scrape')
    expect(r.scrape_targets[1].source).toBe('onboarding_discovery')
  })
  it('honors tenant_trusted override (direct client datum)', () => {
    const r = buildScrapeTargets(['https://instagram.com/own'], { trust_level: 'tenant_trusted' })
    expect(r.scrape_targets[0].trust_level).toBe('tenant_trusted')
  })
  it('dedups by normalized URL', () => {
    const r = buildScrapeTargets(['https://acme.com', 'http://www.acme.com/', 'acme.com'])
    expect(r.scrape_targets).toHaveLength(1)
    expect(r.dropped.duplicates).toBe(2)
  })
})

describe('buildScrapeTargets · §150 guardrails', () => {
  it('caps competitors at 10', () => {
    const urls = Array.from({ length: 15 }, (_, i) => `https://site${i}.com`)
    const r = buildScrapeTargets(urls)
    expect(r.scrape_targets).toHaveLength(10)
    expect(r.dropped.by_competitor_cap).toBe(5)
  })
  it('caps distinct apify actors at 3 · a 4th actor type is dropped', () => {
    // 4 distinct apify actor types · only first 3 actors allowed
    const urls = [
      'https://instagram.com/a',   // instagram_scraper (1)
      'https://linkedin.com/company/b', // linkedin_company (2)
      'https://facebook.com/c',    // facebook_ads (3)
      'https://tiktok.com/@d',     // tiktok_profile (4) → dropped by actor cap
    ]
    const r = buildScrapeTargets(urls)
    const actors = new Set(r.scrape_targets.map((t) => t.apify_function))
    expect(actors.size).toBe(3)
    expect(r.dropped.by_actor_cap).toBe(1)
  })
  it('web_generic targets do NOT consume the actor cap', () => {
    const urls = [
      'https://instagram.com/a',
      'https://linkedin.com/company/b',
      'https://facebook.com/c',
      'https://acme.com',  // web_generic · still allowed (no actor)
    ]
    const r = buildScrapeTargets(urls)
    expect(r.scrape_targets).toHaveLength(4)
    expect(r.dropped.by_actor_cap).toBe(0)
  })
})

describe('buildFallbackSearchTarget · Tarea 2', () => {
  it('builds google_serp / search / untrusted target with query', () => {
    const t = buildFallbackSearchTarget({ company_name: 'Acme', industry: 'fintech' })
    expect(t.apify_function).toBe('google_serp')
    expect(t.source).toBe('search')
    expect(t.trust_level).toBe('untrusted')
    expect(t.url).toBe('serp:Acme competitors fintech')
  })
  it('handles missing industry gracefully', () => {
    const t = buildFallbackSearchTarget({ company_name: 'Acme' })
    expect(t.url).toBe('serp:Acme competitors')
  })
})

describe('buildFallbackMapsTarget · no-URL + location', () => {
  it('builds google_maps_scraper target when location present', () => {
    const t = buildFallbackMapsTarget({ company_name: 'Acme', location: 'Quito' })
    expect(t).not.toBeNull()
    expect(t?.apify_function).toBe('google_maps_scraper')
    expect(t?.source).toBe('search')
    expect(t?.trust_level).toBe('untrusted')
    expect(t?.url).toBe('maps:Acme Quito')
  })
  it('falls back to industry as subject when no company_name', () => {
    const t = buildFallbackMapsTarget({ industry: 'cafetería', location: 'Lima' })
    expect(t?.url).toBe('maps:cafetería Lima')
  })
  it('returns null when no location (maps needs a place)', () => {
    expect(buildFallbackMapsTarget({ company_name: 'Acme' })).toBeNull()
    expect(buildFallbackMapsTarget({ company_name: 'Acme', location: '   ' })).toBeNull()
  })
})

describe('aggregateDiscoverySources · Tarea 3 graceful degradation', () => {
  it('marks failed actors but keeps the others · never aborts', () => {
    const r = aggregateDiscoverySources([
      { apify_function: 'instagram_scraper', ok: true, count: 12 },
      { apify_function: 'linkedin_company', ok: false, error: 'timeout' },
      { apify_function: 'facebook_ads', ok: true, count: 3 },
    ])
    expect(r.ok_count).toBe(2)
    expect(r.failed_count).toBe(1)
    expect(r.total_results).toBe(15)
    expect(r.sources).toHaveLength(3)
    const failed = r.sources.find((s) => s.status === 'failed')
    expect(failed?.apify_function).toBe('linkedin_company')
    expect(failed?.error).toBe('timeout')
    expect(failed?.count).toBe(0)
  })
  it('empty input → empty sources, zero counts', () => {
    const r = aggregateDiscoverySources([])
    expect(r.sources).toHaveLength(0)
    expect(r.total_results).toBe(0)
  })
})
