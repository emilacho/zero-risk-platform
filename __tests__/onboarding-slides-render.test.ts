/**
 * Tests · onboarding Slides/Drive render (onboarding-slides-render.ts).
 * buildSlidesBatchRequests is pure · renderOnboardingReport is driven by an
 * injected fetch that records the Drive/Slides REST call sequence.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildSlidesBatchRequests,
  ensureClientFolder,
  renderOnboardingReport,
} from '../src/lib/onboarding-slides-render'
import { buildReportSlides } from '../src/lib/onboarding-report'

const model = buildReportSlides({
  clientName: 'Náufrago',
  reportDateISO: '2026-07-02T00:00:00Z',
  elevatorPitch: 'El único especialista en encebollado.',
  positioning: 'P',
  icpSummary: 'I',
  voiceDescription: 'V',
  customerAngle: 'A',
  competitors: [{ name: 'Rasimar', why: 'reseñas' }],
})

describe('buildSlidesBatchRequests', () => {
  it('emits createSlide + title/body shape + insertText per slide (6 slides)', () => {
    const reqs = buildSlidesBatchRequests(model) as Array<Record<string, unknown>>
    // 5 requests per slide × 6 slides = 30
    expect(reqs).toHaveLength(30)
    expect(reqs.filter((r) => 'createSlide' in r)).toHaveLength(6)
    expect(reqs.filter((r) => 'createShape' in r)).toHaveLength(12)
    expect(reqs.filter((r) => 'insertText' in r)).toHaveLength(12)
    // slide 1 title carries name + subtitle (elevator pitch)
    const firstInsert = reqs.find((r) => 'insertText' in r) as {
      insertText: { text: string; objectId: string }
    }
    expect(firstInsert.insertText.objectId).toBe('s1_title')
    expect(firstInsert.insertText.text).toContain('Náufrago')
  })
})

function jsonRes(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body } as unknown as Response)
}

describe('ensureClientFolder', () => {
  it('returns existing folder id when found', async () => {
    const fetchImpl = vi.fn(() => jsonRes({ files: [{ id: 'existing-folder' }] })) as unknown as typeof fetch
    const id = await ensureClientFolder('Náufrago', {
      accessToken: 't',
      cuentasFolderId: 'CUENTAS',
      fetchImpl,
    })
    expect(id).toBe('existing-folder')
    expect(fetchImpl).toHaveBeenCalledTimes(1) // search only, no create
  })

  it('creates folder when none found', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if ((init?.method ?? 'GET') === 'GET') return jsonRes({ files: [] })
      return jsonRes({ id: 'new-folder' })
    }) as unknown as typeof fetch
    const id = await ensureClientFolder('Náufrago', {
      accessToken: 't',
      cuentasFolderId: 'CUENTAS',
      fetchImpl,
    })
    expect(id).toBe('new-folder')
    expect(calls[0]).toContain('GET')
    expect(calls[1]).toContain('POST')
  })
})

describe('renderOnboardingReport', () => {
  it('folder → create presentation → move → batchUpdate → url', async () => {
    const seq: string[] = []
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'
      seq.push(`${m} ${url.split('?')[0]}`)
      if (url.includes('/drive/v3/files') && m === 'GET') return jsonRes({ files: [] })
      if (url.includes('/drive/v3/files') && m === 'POST') return jsonRes({ id: 'folder-1' })
      if (url.endsWith('/presentations')) return jsonRes({ presentationId: 'PRES1' })
      if (url.includes(':batchUpdate')) return jsonRes({ replies: [] })
      if (url.includes('/drive/v3/files/PRES1') && m === 'PATCH')
        return jsonRes({ id: 'PRES1', parents: ['folder-1'] })
      return jsonRes({})
    }) as unknown as typeof fetch

    const res = await renderOnboardingReport(model, {
      accessToken: 't',
      cuentasFolderId: 'CUENTAS',
      fetchImpl,
    })
    expect(res.presentationId).toBe('PRES1')
    expect(res.folderId).toBe('folder-1')
    expect(res.url).toBe('https://docs.google.com/presentation/d/PRES1/edit')
    // sequence includes create-presentation, move (PATCH), batchUpdate
    expect(seq.some((s) => s.endsWith('/presentations'))).toBe(true)
    expect(seq.some((s) => s.includes('PATCH'))).toBe(true)
    expect(seq.some((s) => s.includes('batchUpdate'))).toBe(true)
  })

  it('throws on a Google API error', async () => {
    const fetchImpl = vi.fn(() => jsonRes({ error: { message: 'nope' } }, false, 403)) as unknown as typeof fetch
    await expect(
      renderOnboardingReport(model, { accessToken: 't', cuentasFolderId: 'C', fetchImpl }),
    ).rejects.toThrow(/google api 403/)
  })
})
