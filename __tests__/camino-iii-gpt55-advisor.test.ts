/**
 * Tests · GPT-5.5 cazador de punto ciego (SPEC §3) · §144.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  isGpt55AdvisorEnabled,
  applyBlindSpotOverride,
} from '../src/lib/camino-iii/gpt55-advisor'

afterEach(() => {
  delete process.env.SALA_GPT55_ADVISOR_ENABLED
})

describe('isGpt55AdvisorEnabled · flag default OFF', () => {
  it('defaults OFF', () => {
    delete process.env.SALA_GPT55_ADVISOR_ENABLED
    expect(isGpt55AdvisorEnabled()).toBe(false)
  })
  it('ON only when exactly "true"', () => {
    process.env.SALA_GPT55_ADVISOR_ENABLED = 'true'
    expect(isGpt55AdvisorEnabled()).toBe(true)
    process.env.SALA_GPT55_ADVISOR_ENABLED = '1'
    expect(isGpt55AdvisorEnabled()).toBe(false)
  })
})

describe('applyBlindSpotOverride', () => {
  it('PASS + advisor red → ESCALATE (blind-spot forces human) when enabled', () => {
    const r = applyBlindSpotOverride('PASS', 'red', { enabled: true })
    expect(r.verdict).toBe('ESCALATE')
    expect(r.overridden).toBe(true)
  })
  it('does NOT override when flag is OFF', () => {
    const r = applyBlindSpotOverride('PASS', 'red', { enabled: false })
    expect(r.verdict).toBe('PASS')
    expect(r.overridden).toBe(false)
  })
  it('PASS + advisor green → no override', () => {
    const r = applyBlindSpotOverride('PASS', 'green', { enabled: true })
    expect(r.verdict).toBe('PASS')
    expect(r.overridden).toBe(false)
  })
  it('advisor never downgrades a REJECT or sways the tally', () => {
    expect(applyBlindSpotOverride('REJECT', 'green', { enabled: true }).verdict).toBe('REJECT')
    expect(applyBlindSpotOverride('REJECT', 'red', { enabled: true }).verdict).toBe('REJECT')
    expect(applyBlindSpotOverride('ESCALATE', 'red', { enabled: true }).verdict).toBe('ESCALATE')
  })
  it('no advisor vote → machine verdict unchanged', () => {
    const r = applyBlindSpotOverride('PASS', null, { enabled: true })
    expect(r.verdict).toBe('PASS')
    expect(r.overridden).toBe(false)
  })
  it('reads the env flag when enabled not passed', () => {
    process.env.SALA_GPT55_ADVISOR_ENABLED = 'true'
    expect(applyBlindSpotOverride('PASS', 'red').verdict).toBe('ESCALATE')
    delete process.env.SALA_GPT55_ADVISOR_ENABLED
    expect(applyBlindSpotOverride('PASS', 'red').verdict).toBe('PASS')
  })
})
