/**
 * Tests · JEFATURA gate de voto de contenido (F1.3 · ADR-020).
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateContentVoteGate,
  statusToVerdict,
  RejectWithoutCorrectionsError,
} from '../src/lib/jefatura/content-vote-gate'
import type { VoteRecord } from '../src/lib/camino-iii/tabulate'

const goodCorrection = {
  eje: 'factual',
  severidad: 'red',
  donde: 'titular',
  problema: 'claim sin fuente',
  por_que: 'el brand book exige fuente en claims',
  cambio_sugerido: 'citar el estudio o quitar el claim',
}

const green = (agent: string): VoteRecord => ({ reviewer_agent: agent, vote: 'green' })
const red = (agent: string, corrections: unknown[] = [goodCorrection]): VoteRecord => ({
  reviewer_agent: agent,
  vote: 'red',
  corrections,
})
const amber = (agent: string): VoteRecord => ({ reviewer_agent: agent, vote: 'amber' })

describe('statusToVerdict', () => {
  it('mapea los 4 status al veredicto del contrato', () => {
    expect(statusToVerdict('approved')).toBe('PASS')
    expect(statusToVerdict('rejected')).toBe('REJECT')
    expect(statusToVerdict('escalated_hitl')).toBe('ESCALATE')
    expect(statusToVerdict('pending')).toBe('ESCALATE')
  })
})

describe('evaluateContentVoteGate · tabulador determinista', () => {
  it('≥2 verde + 0 rojo → PASS', () => {
    const out = evaluateContentVoteGate({ votes: [green('a'), green('b'), amber('c')], trace_id: 't1' })
    expect(out.verdict).toBe('PASS')
    expect(out.scores.votes).toEqual({ green: 2, amber: 1, red: 0, total: 3 })
    expect(out.corrections).toEqual([])
    expect(out.trace_id).toBe('t1')
  })

  it('≥2 rojo → REJECT + corrections consolidadas + severidad traducida rojo', () => {
    const out = evaluateContentVoteGate({ votes: [red('a'), red('b'), green('c')], trace_id: 't2' })
    expect(out.verdict).toBe('REJECT')
    expect(out.scores.votes).toEqual({ green: 1, amber: 0, red: 2, total: 3 })
    expect(out.corrections).toHaveLength(2)
    // severidad se traduce red → rojo (contrato en español)
    expect(out.corrections[0].severidad).toBe('rojo')
    expect(out.corrections[0].eje).toBe('factual')
  })

  it('split (1 verde · 1 ambar · 1 rojo) → ESCALATE', () => {
    const out = evaluateContentVoteGate({ votes: [green('a'), amber('b'), red('c')], trace_id: 't3' })
    expect(out.verdict).toBe('ESCALATE')
  })

  it('votos insuficientes (<expected) → ESCALATE · NUNCA auto-PASS', () => {
    const out = evaluateContentVoteGate({ votes: [green('a')], expectedVotes: 3, trace_id: 't4' })
    expect(out.verdict).toBe('ESCALATE')
  })

  it('REJECT sin corrections válidas → lanza RejectWithoutCorrectionsError (ADR-020 §58)', () => {
    // 2 rojos SIN corrections (o con corrections inválidas) → REJECT vacío = bug
    expect(() =>
      evaluateContentVoteGate({ votes: [red('a', []), red('b', [{ eje: 'x' }]), green('c')], trace_id: 't5' }),
    ).toThrow(RejectWithoutCorrectionsError)
  })

  it('descarta corrections inválidas pero conserva las válidas', () => {
    const out = evaluateContentVoteGate({
      votes: [red('a', [goodCorrection, { eje: 'nope' }]), red('b', [goodCorrection]), green('c')],
      trace_id: 't6',
    })
    expect(out.verdict).toBe('REJECT')
    expect(out.corrections).toHaveLength(2) // 2 válidas · 1 inválida descartada
  })

  it('advisors (is_voting:false) se excluyen del tally + de las corrections', () => {
    const advisor: VoteRecord = { reviewer_agent: 'gpt55', vote: 'red', corrections: [goodCorrection], is_voting: false }
    const out = evaluateContentVoteGate({ votes: [green('a'), green('b'), green('c'), advisor], trace_id: 't7' })
    expect(out.verdict).toBe('PASS') // el rojo del advisor NO cuenta
    expect(out.scores.votes?.total).toBe(3) // advisor excluido
    expect(out.corrections).toEqual([]) // corrections del advisor excluidas
  })
})
