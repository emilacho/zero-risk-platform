/**
 * Tests · populate-config · Discovery → clients.config.apify
 * (SPEC lazo agentico 2026-06-05).
 *
 * Verifies the merge policy (handles sticky · competitors replaced) +
 * flag gate + idempotent re-runs.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  populateClientConfigFromDiscovery,
  type DiscoveryOutput,
} from '@/lib/discovery-output'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const DISCOVERY: DiscoveryOutput = {
  client_id: NAUFRAGO,
  own_handles: {
    instagram: '@naufrago_ec',
    facebook: 'naufragoec',
    tiktok: '@naufrago',
  },
  competitors: [
    { name: 'La Pinta', website: 'https://lp.com', competitor_type: 'direct' },
    { name: 'Mercado', competitor_type: 'indirect' },
  ],
}

function makeFakeSupabase(initialConfig: Record<string, unknown> = {}) {
  let storedConfig = initialConfig
  const updates: Array<Record<string, unknown>> = []

  const from = (_table: string) => ({
    select(_cols: string) {
      return {
        eq(_col: string, _val: string) {
          return {
            maybeSingle: () =>
              Promise.resolve({ data: { config: storedConfig }, error: null }),
          }
        },
      }
    },
    update(row: Record<string, unknown>) {
      updates.push(row)
      storedConfig = (row.config as Record<string, unknown>) ?? {}
      return {
        eq: (_col: string, _val: string) => Promise.resolve({ error: null }),
      }
    },
  })

  return {
    fake: { from } as never,
    updates,
    storedConfig: () => storedConfig,
  }
}

describe('populateClientConfigFromDiscovery · flag OFF', () => {
  it('returns flag_off without touching the DB', async () => {
    const { fake, updates } = makeFakeSupabase()
    const r = await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: false,
    })
    expect(r.errors).toContain('flag_off')
    expect(updates.length).toBe(0)
  })
})

describe('populateClientConfigFromDiscovery · flag ON · canonical merge', () => {
  it('writes competitor_list + own_handles when config is empty', async () => {
    const { fake, updates } = makeFakeSupabase({})
    const r = await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    expect(r.errors.length).toBe(0)
    expect(r.handles_written).toBe(3) // 3 platforms filled
    expect(r.competitors_written).toBe(2)
    const writtenConfig = updates[0].config as Record<string, unknown>
    const apify = writtenConfig.apify as Record<string, unknown>
    expect((apify.own_handles as Record<string, string>).instagram).toBe('@naufrago_ec')
    expect((apify.competitor_list as Array<{ name: string }>).length).toBe(2)
  })

  it('handles ARE sticky (existing admin-set values preserved)', async () => {
    const initial = {
      apify: {
        own_handles: { instagram: '@admin_set', linkedin: '@admin_li' },
      },
    }
    const { fake, updates } = makeFakeSupabase(initial)
    const r = await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    // instagram already set · agent's value IGNORED · linkedin sticky
    expect(r.handles_written).toBe(2) // only facebook + tiktok filled new
    const writtenApify = (updates[0].config as { apify: Record<string, unknown> }).apify
    const handles = writtenApify.own_handles as Record<string, string>
    expect(handles.instagram).toBe('@admin_set') // SCRAPER admin set wins
    expect(handles.facebook).toBe('naufragoec') // agent filled empty slot
    expect(handles.linkedin).toBe('@admin_li') // preserved
  })

  it('competitor_list is REPLACED on re-discovery (agent is canon)', async () => {
    const initial = {
      apify: {
        competitor_list: [
          { name: 'OLD MANUAL ENTRY', website: 'https://stale.com' },
        ],
      },
    }
    const { fake, updates } = makeFakeSupabase(initial)
    await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    const writtenApify = (updates[0].config as { apify: Record<string, unknown> }).apify
    const list = writtenApify.competitor_list as Array<{ name: string }>
    expect(list.find((c) => c.name === 'OLD MANUAL ENTRY')).toBeUndefined()
    expect(list.find((c) => c.name === 'La Pinta')).toBeDefined()
  })

  it('stamps last_populated_from_discovery_at + source', async () => {
    const { fake, updates } = makeFakeSupabase()
    await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    const writtenApify = (updates[0].config as { apify: Record<string, unknown> }).apify
    expect(writtenApify.last_populated_source).toBe('auto_discovery_agent')
    expect(typeof writtenApify.last_populated_from_discovery_at).toBe('string')
  })

  it('preserves non-apify config keys (defensive)', async () => {
    const initial = {
      ghl: { calendar_id: 'kept' },
      apify: { own_handles: {} },
    }
    const { fake, updates } = makeFakeSupabase(initial)
    await populateClientConfigFromDiscovery({
      supabase: fake,
      discovery: DISCOVERY,
      enabled: true,
    })
    const writtenConfig = updates[0].config as Record<string, unknown>
    expect(writtenConfig.ghl).toEqual({ calendar_id: 'kept' })
  })
})
