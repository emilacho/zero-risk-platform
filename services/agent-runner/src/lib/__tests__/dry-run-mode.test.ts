/**
 * dry-run-mode · Sprint 9 entry canon · unit tests
 *
 * Covers · resolveDryRun multi-source priority + buildDryRunFakeResponse shape +
 * default false guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveDryRun,
  buildDryRunFakeResponse,
  warnIfPanicButtonActive,
} from '../dry-run-mode'

describe('dry-run-mode · canon Sprint 9', () => {
  // ── resolveDryRun · default + per-source detection ──

  it('default false when input empty', () => {
    expect(resolveDryRun()).toBe(false)
    expect(resolveDryRun({})).toBe(false)
  })

  it('detects body top-level dry_run=true (snake_case)', () => {
    expect(resolveDryRun({ body: { dry_run: true } })).toBe(true)
  })

  it('detects body top-level dryRun=true (camelCase)', () => {
    expect(resolveDryRun({ body: { dryRun: true } })).toBe(true)
  })

  it('detects nested context.dry_run=true', () => {
    expect(
      resolveDryRun({ context: { dry_run: true, other: 'noise' } }),
    ).toBe(true)
  })

  it('detects nested context.dryRun=true (camelCase)', () => {
    expect(resolveDryRun({ context: { dryRun: true } })).toBe(true)
  })

  it('detects X-Dry-Run header true (case-insensitive)', () => {
    expect(
      resolveDryRun({ headers: { 'x-dry-run': 'true' } }),
    ).toBe(true)
    expect(
      resolveDryRun({ headers: { 'X-Dry-Run': 'true' } }),
    ).toBe(true)
    expect(
      resolveDryRun({ headers: { 'X-DRY-RUN': 'TRUE' } }),
    ).toBe(true)
  })

  it('detects env DRY_RUN_DEFAULT=true (panic button)', () => {
    expect(resolveDryRun({ env: { DRY_RUN_DEFAULT: 'true' } })).toBe(true)
    expect(resolveDryRun({ env: { DRY_RUN_DEFAULT: 'TRUE' } })).toBe(true)
  })

  // ── resolveDryRun · false on non-true values (strict canon) ──

  it('returns false for string "true" at body level (must be literal boolean)', () => {
    expect(resolveDryRun({ body: { dry_run: 'true' as unknown as boolean } })).toBe(
      false,
    )
  })

  it('returns false for 1, "1", truthy strings at body level', () => {
    expect(resolveDryRun({ body: { dry_run: 1 as unknown as boolean } })).toBe(
      false,
    )
    expect(
      resolveDryRun({ body: { dry_run: '1' as unknown as boolean } }),
    ).toBe(false)
  })

  it('header "false" or other strings does not trigger dry-run', () => {
    expect(resolveDryRun({ headers: { 'x-dry-run': 'false' } })).toBe(false)
    expect(resolveDryRun({ headers: { 'x-dry-run': 'yes' } })).toBe(false)
    expect(resolveDryRun({ headers: { 'x-dry-run': '' } })).toBe(false)
  })

  it('env DRY_RUN_DEFAULT not "true" string does not trigger', () => {
    expect(resolveDryRun({ env: { DRY_RUN_DEFAULT: '1' } })).toBe(false)
    expect(resolveDryRun({ env: { DRY_RUN_DEFAULT: 'yes' } })).toBe(false)
    expect(resolveDryRun({ env: {} })).toBe(false)
  })

  // ── resolveDryRun · priority is OR semantics (any source true → true) ──

  it('returns true when ANY source declares dry-run (body wins via OR)', () => {
    expect(
      resolveDryRun({
        body: { dry_run: true },
        context: { dry_run: false as unknown as boolean },
        env: {},
      }),
    ).toBe(true)
  })

  it('returns true when only env panic button set (body+context empty)', () => {
    expect(
      resolveDryRun({
        body: {},
        context: {},
        env: { DRY_RUN_DEFAULT: 'true' },
      }),
    ).toBe(true)
  })

  // ── buildDryRunFakeResponse canonical shape ──

  it('builds canonical fake response with zero token counts', () => {
    const r = buildDryRunFakeResponse('jefe-marketing', 'Test task')
    expect(r.sessionId.startsWith('dryrun-jefe-marketing-')).toBe(true)
    expect(r.inputTokens).toBe(0)
    expect(r.outputTokens).toBe(0)
    expect(r.cacheReadInputTokens).toBe(0)
    expect(r.cacheCreationInputTokens).toBe(0)
    expect(r.cacheCreation5mTokens).toBe(0)
    expect(r.cacheCreation1hTokens).toBe(0)
    expect(r.responseText.startsWith('[DRY_RUN]')).toBe(true)
    expect(r.responseText).toContain('agent=jefe-marketing')
    expect(r.responseText).toContain('task="Test task"')
  })

  it('truncates long task descriptions to 100 chars + ellipsis', () => {
    const longTask = 'x'.repeat(200)
    const r = buildDryRunFakeResponse('any-slug', longTask)
    expect(r.responseText).toContain('xxxxxxx')
    expect(r.responseText).toContain('...')
    // 100 chars of x + "..." appears in responseText
    expect(r.responseText.indexOf('xxxx...')).toBeGreaterThan(-1)
  })

  it('keeps short tasks intact (no truncation when ≤100 chars)', () => {
    const shortTask = 'short task description'
    const r = buildDryRunFakeResponse('any-slug', shortTask)
    expect(r.responseText).toContain('task="short task description"')
    expect(r.responseText).not.toContain('"short task description..."')
  })

  // ── warnIfPanicButtonActive · production safety log ──

  it('warnIfPanicButtonActive · emits [SECURITY] when env active', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnIfPanicButtonActive({ DRY_RUN_DEFAULT: 'true' })
    expect(spy).toHaveBeenCalled()
    const arg = spy.mock.calls[0][0] as string
    expect(arg).toContain('[SECURITY]')
    expect(arg).toContain('DRY_RUN_DEFAULT=true')
    spy.mockRestore()
  })

  it('warnIfPanicButtonActive · silent when env not set', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnIfPanicButtonActive({})
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
