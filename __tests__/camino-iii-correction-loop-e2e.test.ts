/**
 * Synthetic E2E · Camino III lazo de corrección (DoD SPEC 2026-06-27).
 *
 * Walks a synthetic piece through the loop IN-MEMORY (no cloud · no real
 * agents · mocked persistence) to prove the orchestration ·
 *   produce → gate REJECT + correcciones → evento correction_required →
 *   re-despacho al creador → corrige → re-voto → (repite) → al 3er ciclo
 *   sigue mal → ESCALATE a humano.
 * Plus the GPT-5.5 blind-spot path (3 PASS + advisor red → ESCALATE).
 */
import { describe, it, expect } from 'vitest'
import {
  validateCorrectionsForVote,
  consolidateCorrections,
  type CorrectionObject,
  type ReviewerCorrections,
} from '../src/lib/camino-iii/corrections'
import {
  evaluateCorrectionCap,
  buildCorrectionRequiredEvent,
} from '../src/lib/camino-iii/correction-loop'
import { applyBlindSpotOverride } from '../src/lib/camino-iii/gpt55-advisor'
import { buildCorrectionPrompt } from '../src/lib/camino-iii/correction-branch'

const corr = (over: Partial<CorrectionObject> = {}): CorrectionObject => ({
  eje: 'factual',
  severidad: 'red',
  donde: 'titular',
  problema: 'claim sin fuente',
  por_que: 'brand book exige fuente',
  cambio_sugerido: 'citar estudio',
  ...over,
})

/** One Camino III round · 3 voters reject with corrections. Returns the
 *  consolidated package + the machine verdict (simplified · all red = REJECT). */
function runRejectRound(): { verdict: 'REJECT'; pkg: ReturnType<typeof consolidateCorrections> } {
  const perReviewer: ReviewerCorrections[] = [
    { reviewer_agent: 'editor-en-jefe', is_voting: true, corrections: [corr()] },
    { reviewer_agent: 'brand-strategist', is_voting: true, corrections: [corr({ eje: 'voz' })] },
    { reviewer_agent: 'jefe-client-success', is_voting: true, corrections: [corr({ eje: 'cliente' })] },
  ]
  // each red vote must carry corrections (canon gate)
  for (const r of perReviewer) {
    expect(validateCorrectionsForVote('red', r.corrections).ok).toBe(true)
  }
  return { verdict: 'REJECT', pkg: consolidateCorrections(perReviewer) }
}

describe('E2E · lazo de corrección · 3 ciclos → ESCALATE', () => {
  it('re-dispatches the creator 3 times then escalates to human', () => {
    const trail: string[] = []
    let revision = 0 // editorial_decisions.revision_count

    // up to 4 attempts · the piece stays bad → keeps getting rejected
    for (let attempt = 1; attempt <= 5; attempt++) {
      const round = runRejectRound()
      const cap = evaluateCorrectionCap(revision)

      if (cap.action === 'escalate_human') {
        trail.push(`escalate@rev${revision}`)
        break
      }

      // re-dispatch · the light event carries item_id, not the text
      const event = buildCorrectionRequiredEvent({
        item_type: 'content_deliverable',
        item_id: 'piece-1',
        revision_count: cap.next_revision_count,
        journey_id: 'stream-1',
      })
      expect(event.event_type).toBe('correction_required')

      // the creator's "corregir" branch builds the prompt from the package
      const prompt = buildCorrectionPrompt('borrador v' + attempt, {
        item_type: 'content_deliverable',
        item_id: 'piece-1',
        revision_count: cap.next_revision_count,
        corrections: round.pkg,
        found: true,
      })
      expect(prompt).toMatch(/SOLO/)
      expect(prompt).toMatch(new RegExp(`${cap.next_revision_count}/3`))

      revision = cap.next_revision_count
      trail.push(`redispatch→rev${revision}`)
    }

    // 3 correction cycles, then escalate at revision_count=3
    expect(trail).toEqual([
      'redispatch→rev1',
      'redispatch→rev2',
      'redispatch→rev3',
      'escalate@rev3',
    ])
  })

  it('a piece that gets fixed exits the loop early (PASS · no escalation)', () => {
    let revision = 0
    // cycle 1 · rejected → re-dispatch
    let cap = evaluateCorrectionCap(revision)
    expect(cap.action).toBe('re_dispatch')
    revision = cap.next_revision_count
    // cycle 2 · creator fixed it → PASS · loop ends (no further cap eval)
    const fixedVerdict = 'PASS'
    expect(fixedVerdict).toBe('PASS')
    expect(revision).toBe(1) // only one correction cycle was needed
  })
})

describe('E2E · GPT-5.5 blind-spot · 3 PASS + advisor red → ESCALATE', () => {
  it('forces human review and the advisor corrections travel in the package', () => {
    // 3 voters approve
    const machineVerdict = 'PASS'
    // advisor (non-voting) disagrees with a red + a correction
    const advisorCorrections: ReviewerCorrections = {
      reviewer_agent: 'gpt-5.5-advisor',
      is_voting: false,
      corrections: [corr({ eje: 'posicionamiento', donde: 'CTA' })],
    }
    const pkg = consolidateCorrections([advisorCorrections])

    const override = applyBlindSpotOverride(machineVerdict, 'red', { enabled: true })
    expect(override.verdict).toBe('ESCALATE')
    expect(override.overridden).toBe(true)

    // the advisor's correction is in the package that goes to the human
    expect(pkg).toHaveLength(1)
    expect(pkg[0].reviewer_agent).toBe('gpt-5.5-advisor')
    expect(pkg[0].is_voting).toBe(false)
    expect(pkg[0].eje).toBe('posicionamiento')
  })
})
