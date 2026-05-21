/**
 * contact-persist · CRM wire-in helper · Sprint 5 D1 2026-05-21 ·
 * unit coverage for the discriminated union contract.
 */
import { describe, it, expect, vi } from 'vitest'
import { persistContact } from '../src/lib/contact-persist'
import type { SupabaseClient } from '@supabase/supabase-js'

interface BuilderState {
  table: string
  filters: Array<{ field: string; value: unknown }>
  payload?: unknown
}

function makeSupabase(scenario: {
  lookup?: { data: { id: string } | null; error?: { code?: string; message: string } | null }
  insert?: { data: { id: string } | null; error?: { code?: string; message: string } | null }
  update?: { error?: { code?: string; message: string } | null }
}) {
  const calls: BuilderState[] = []
  const supa = {
    from(table: string) {
      const state: BuilderState = { table, filters: [] }
      calls.push(state)
      const builder = {
        select(_c?: string) {
          return builder
        },
        eq(field: string, value: unknown) {
          state.filters.push({ field, value })
          return builder
        },
        async maybeSingle() {
          return scenario.lookup ?? { data: null, error: null }
        },
        insert(payload: unknown) {
          state.payload = payload
          return {
            select(_c?: string) {
              return {
                async single() {
                  return scenario.insert ?? { data: { id: 'new-uuid' }, error: null }
                },
              }
            },
          }
        },
        update(payload: unknown) {
          state.payload = payload
          return {
            async eq(_field: string, _value: unknown) {
              return scenario.update ?? { error: null }
            },
          }
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { supa, calls }
}

describe('persistContact', () => {
  it('1. rejects missing clientId', async () => {
    const { supa } = makeSupabase({})
    const r = await persistContact(supa, { clientId: '', championName: 'Ana' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('InvalidInput')
  })

  it('2. rejects missing championName', async () => {
    const { supa } = makeSupabase({})
    const r = await persistContact(supa, { clientId: 'c-1', championName: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toContain('championName_required')
  })

  it('3. happy path · inserts new row when no email provided', async () => {
    const { supa, calls } = makeSupabase({
      insert: { data: { id: 'inserted-uuid' }, error: null },
    })
    const r = await persistContact(supa, {
      clientId: 'c-1',
      championName: 'Ana Pérez',
      vertical: 'security',
      journeyStatus: 'discovery',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mode).toBe('inserted')
      expect(r.id).toBe('inserted-uuid')
    }
    // Should NOT do a lookup when no email
    expect(calls.filter((c) => c.table === 'client_champions')).toHaveLength(1)
  })

  it('4. happy path · upserts (UPDATE) when email matches existing row', async () => {
    const { supa, calls } = makeSupabase({
      lookup: { data: { id: 'existing-uuid' }, error: null },
    })
    const r = await persistContact(supa, {
      clientId: 'c-1',
      championName: 'Ana Pérez',
      championEmail: 'ana@example.com',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mode).toBe('updated')
      expect(r.id).toBe('existing-uuid')
    }
    // One lookup + one update on client_champions
    const champCalls = calls.filter((c) => c.table === 'client_champions')
    expect(champCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('5. happy path · inserts when email provided but no existing row', async () => {
    const { supa } = makeSupabase({
      lookup: { data: null, error: null },
      insert: { data: { id: 'fresh-uuid' }, error: null },
    })
    const r = await persistContact(supa, {
      clientId: 'c-1',
      championName: 'Ana Pérez',
      championEmail: 'ana@example.com',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mode).toBe('inserted')
      expect(r.id).toBe('fresh-uuid')
    }
  })

  it('6. surfaces NoClient on FK violation 23503', async () => {
    const { supa } = makeSupabase({
      insert: {
        data: null,
        error: { code: '23503', message: 'foreign key violation' },
      },
    })
    const r = await persistContact(supa, {
      clientId: 'c-1',
      championName: 'Ana',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('NoClient')
      expect(r.detail).toContain('client_id_not_found')
    }
  })

  it('7. surfaces DbError on other DB failures', async () => {
    const { supa } = makeSupabase({
      insert: { data: null, error: { code: '500', message: 'pg fail' } },
    })
    const r = await persistContact(supa, { clientId: 'c-1', championName: 'Ana' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('DbError')
      expect(r.detail).toContain('pg fail')
    }
  })

  it('8. stores journeyStatus + vertical in metadata', async () => {
    const { supa, calls } = makeSupabase({
      insert: { data: { id: 'x' }, error: null },
    })
    await persistContact(supa, {
      clientId: 'c-1',
      championName: 'Ana',
      journeyStatus: 'onboarding',
      vertical: 'fintech',
      extraMetadata: { custom_key: 'custom_value' },
    })
    const insertCall = calls.find((c) => c.payload != null)
    expect(insertCall).toBeDefined()
    const payload = insertCall!.payload as Record<string, unknown>
    const metadata = payload.metadata as Record<string, unknown>
    expect(metadata.journey_status).toBe('onboarding')
    expect(metadata.vertical).toBe('fintech')
    expect(metadata.custom_key).toBe('custom_value')
    expect(metadata.persisted_by).toBe('contact-persist')
  })

  it('9. trims whitespace on email/name/phone', async () => {
    const { supa, calls } = makeSupabase({
      lookup: { data: null, error: null },
      insert: { data: { id: 'x' }, error: null },
    })
    await persistContact(supa, {
      clientId: 'c-1',
      championName: '  Ana  ',
      championEmail: '  ana@x.com  ',
      championPhone: '  +593-99-1234567  ',
    })
    const insertCall = calls.find((c) => c.payload != null)
    const payload = insertCall!.payload as Record<string, unknown>
    expect(payload.champion_name).toBe('Ana')
    expect(payload.champion_email).toBe('ana@x.com')
    expect(payload.champion_phone).toBe('+593-99-1234567')
  })
})
