/**
 * Tests · ensure-client · ordering guard Discovery → brain (Sprint 13).
 *
 * Cubre · parseo de identidad del task · creación idempotente de la fila
 * `clients` cuando falta · no-op cuando ya existe · slug canónico (reconcilia
 * con el upsert on_conflict=slug del worker) · manejo soft de errores.
 */
import { describe, it, expect } from 'vitest'
import {
  ensureClientExists,
  parseClientIdentityFromTask,
  slugify,
} from '@/lib/discovery-output/ensure-client'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const TASK_FULL =
  'Auto-discover Client Brain for Náufrago (industry: restaurante / hospitality, website: https://www.instagram.com/naufrago.ec/, client_id: ' +
  NAUFRAGO +
  ').\n\nResearch · brand voice + ICP.'

interface UpsertCall {
  row: Record<string, unknown>
  opts?: Record<string, unknown>
}

function makeFakeSupabase(opts: {
  existingRow?: Record<string, unknown> | null
  readError?: string
  insertError?: string
}) {
  const upserts: UpsertCall[] = []
  const from = (_table: string) => ({
    select(_cols: string) {
      return {
        eq(_col: string, _val: string) {
          return {
            maybeSingle: () =>
              Promise.resolve(
                opts.readError
                  ? { data: null, error: { message: opts.readError } }
                  : { data: opts.existingRow ?? null, error: null },
              ),
          }
        },
      }
    },
    upsert(row: Record<string, unknown>, o?: Record<string, unknown>) {
      upserts.push({ row, opts: o })
      return Promise.resolve(
        opts.insertError ? { error: { message: opts.insertError } } : { error: null },
      )
    },
  })
  return { fake: { from } as never, upserts }
}

describe('parseClientIdentityFromTask', () => {
  it('parsea name + industry + website del formato canónico', () => {
    const r = parseClientIdentityFromTask(TASK_FULL)
    expect(r.name).toBe('Náufrago')
    expect(r.industry).toBe('restaurante / hospitality')
    expect(r.website).toBe('https://www.instagram.com/naufrago.ec/')
  })

  it('fallback laxo · solo name cuando el formato completo no matchea', () => {
    const r = parseClientIdentityFromTask('Auto-discover Client Brain for Acme Corp (extra)')
    expect(r.name).toBe('Acme Corp')
    expect(r.industry).toBeUndefined()
    expect(r.website).toBeUndefined()
  })

  it('omite industry/website cuando son "unknown"', () => {
    const r = parseClientIdentityFromTask(
      'research for Foo (industry: unknown, website: unknown, client_id: x)',
    )
    expect(r.name).toBe('Foo')
    expect(r.industry).toBeUndefined()
    expect(r.website).toBeUndefined()
  })

  it('devuelve {} para task null/empty', () => {
    expect(parseClientIdentityFromTask(null)).toEqual({})
    expect(parseClientIdentityFromTask('')).toEqual({})
  })
})

describe('slugify · coincide con clients/upsert', () => {
  it('Náufrago → naufrago (NFD + strip diacríticos)', () => {
    expect(slugify('Náufrago')).toBe('naufrago')
  })
})

describe('ensureClientExists', () => {
  it('no-op cuando la fila ya existe', async () => {
    const { fake, upserts } = makeFakeSupabase({ existingRow: { id: NAUFRAGO } })
    const r = await ensureClientExists({ supabase: fake, clientId: NAUFRAGO, task: TASK_FULL })
    expect(r.status).toBe('existed')
    expect(upserts.length).toBe(0)
  })

  it('crea la fila con name+slug+industry+website del task cuando falta', async () => {
    const { fake, upserts } = makeFakeSupabase({ existingRow: null })
    const r = await ensureClientExists({ supabase: fake, clientId: NAUFRAGO, task: TASK_FULL })
    expect(r.status).toBe('created')
    expect(upserts.length).toBe(1)
    expect(upserts[0].row).toMatchObject({
      id: NAUFRAGO,
      name: 'Náufrago',
      slug: 'naufrago', // reconcilia con on_conflict=slug del worker
      status: 'onboarding',
      website_url: 'https://www.instagram.com/naufrago.ec/',
      industry: 'restaurante / hospitality',
    })
    expect(upserts[0].opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: true })
  })

  it('usa placeholder cuando el task no es parseable (FK igual satisfecha)', async () => {
    const { fake, upserts } = makeFakeSupabase({ existingRow: null })
    const r = await ensureClientExists({ supabase: fake, clientId: NAUFRAGO, task: 'sin formato' })
    expect(r.status).toBe('created')
    expect(upserts[0].row.name).toBe('Cliente d69100b5')
    expect(upserts[0].row.slug).toBe('cliente-d69100b5')
  })

  it('status failed (soft) en read error', async () => {
    const { fake, upserts } = makeFakeSupabase({ readError: 'boom' })
    const r = await ensureClientExists({ supabase: fake, clientId: NAUFRAGO, task: TASK_FULL })
    expect(r.status).toBe('failed')
    expect(r.error).toContain('read_error')
    expect(upserts.length).toBe(0)
  })

  it('status failed (soft) en insert error', async () => {
    const { fake } = makeFakeSupabase({ existingRow: null, insertError: 'fk boom' })
    const r = await ensureClientExists({ supabase: fake, clientId: NAUFRAGO, task: TASK_FULL })
    expect(r.status).toBe('failed')
    expect(r.error).toContain('insert_error')
  })

  it('status failed cuando no hay clientId', async () => {
    const { fake } = makeFakeSupabase({})
    const r = await ensureClientExists({ supabase: fake, clientId: '', task: TASK_FULL })
    expect(r.status).toBe('failed')
    expect(r.error).toBe('no_client_id')
  })
})
