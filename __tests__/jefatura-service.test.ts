/**
 * Tests · JEFATURA núcleo (F1.1) · routing por política + ensamblado del veredicto.
 * Graders mockeados · sin DB ni red · verifica que el SHELL rutea/ensambla bien.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  gradeArtifact,
  atLoopCap,
  type JefaturaDeps,
  type CanonGrader,
  type CanonGraderResult,
  type CorrectionGrader,
} from '@/lib/jefatura/service'
import type { JefaturaGradingPolicy, JefaturaInput, JefaturaCorrection } from '@/lib/jefatura/contract'

const CORRECTION: JefaturaCorrection = {
  eje: 'voz',
  severidad: 'ambar',
  donde: 'headline',
  problema: 'x',
  por_que: 'y',
  cambio_sugerido: 'z',
}

function policy(over: Partial<JefaturaGradingPolicy>): JefaturaGradingPolicy {
  return {
    artifact_type: 'brand_book',
    artifact_class: 'cimiento',
    correction_enabled: true,
    judgment_enabled: false,
    canon_grader: 'fidelity',
    counterweight: 'shadow_scorer',
    max_cycles: 1,
    fidelity_threshold: 0.85,
    vote_config: null,
    is_active: true,
    ...over,
  }
}

const input: JefaturaInput = {
  artifact_type: 'brand_book',
  artifact_id: 'a1',
  client_id: 'c1',
  journey_id: 'j1',
  payload: {},
}

function makeDeps(over: {
  policy?: JefaturaGradingPolicy | null
  correction?: readonly JefaturaCorrection[]
  fidelity?: Awaited<ReturnType<CanonGrader['grade']>>
  vote?: Awaited<ReturnType<CanonGrader['grade']>>
}): JefaturaDeps & { calls: { fidelity: number; vote: number } } {
  const calls = { fidelity: 0, vote: 0 }
  const defaultFidelity: CanonGraderResult = { verdict: 'PASS', scores: { fidelity: 0.9 }, corrections: [] }
  const defaultVote: CanonGraderResult = {
    verdict: 'PASS',
    scores: { votes: { green: 3, amber: 0, red: 0, total: 3 } },
    corrections: [],
  }
  const correction: CorrectionGrader = { correct: vi.fn(async () => over.correction ?? []) }
  const fidelity: CanonGrader = {
    grade: vi.fn(async () => {
      calls.fidelity++
      return over.fidelity ?? defaultFidelity
    }),
  }
  const vote3ofN: CanonGrader = {
    grade: vi.fn(async () => {
      calls.vote++
      return over.vote ?? defaultVote
    }),
  }
  return {
    fetchPolicy: vi.fn(async () => (over.policy === undefined ? policy({}) : over.policy)),
    graders: { correction, fidelity, vote3ofN },
    genTraceId: () => 'trace-fixed',
    calls,
  }
}

describe('JEFATURA núcleo · gradeArtifact', () => {
  it('cimiento → rutea al grader de FIDELIDAD (no al voto)', async () => {
    const deps = makeDeps({ policy: policy({ artifact_class: 'cimiento', canon_grader: 'fidelity' }) })
    const out = await gradeArtifact(input, deps)
    expect(deps.calls.fidelity).toBe(1)
    expect(deps.calls.vote).toBe(0)
    expect(out.verdict).toBe('PASS')
    expect(out.trace_id).toBe('trace-fixed')
  })

  it('contenido → rutea al VOTO 3-de-N', async () => {
    const deps = makeDeps({
      policy: policy({ artifact_type: 'ad_creative', artifact_class: 'contenido', judgment_enabled: true, canon_grader: 'vote_3_of_n', fidelity_threshold: null }),
    })
    const out = await gradeArtifact(input, deps)
    expect(deps.calls.vote).toBe(1)
    expect(deps.calls.fidelity).toBe(0)
    expect(out.scores.votes?.green).toBe(3)
  })

  it('CORRECCIÓN siempre se ejecuta (correction_enabled)', async () => {
    const deps = makeDeps({ correction: [CORRECTION] })
    const out = await gradeArtifact(input, deps)
    expect(out.corrections).toHaveLength(1)
    expect(out.corrections[0].donde).toBe('headline')
  })

  it('tipo desconocido → ESCALATE (nunca aprueba a ciegas)', async () => {
    const deps = makeDeps({ policy: null })
    const out = await gradeArtifact(input, deps)
    expect(out.verdict).toBe('ESCALATE')
  })

  it('política inactiva → ESCALATE', async () => {
    const deps = makeDeps({ policy: policy({ is_active: false }) })
    expect((await gradeArtifact(input, deps)).verdict).toBe('ESCALATE')
  })

  it('no-circularidad · cimiento con judgment_enabled → ESCALATE (defensa en profundidad)', async () => {
    const deps = makeDeps({ policy: policy({ artifact_class: 'cimiento', judgment_enabled: true }) })
    const out = await gradeArtifact(input, deps)
    expect(out.verdict).toBe('ESCALATE')
    expect(deps.calls.fidelity).toBe(0) // ni siquiera llama al grader
  })

  it('REJECT sin correcciones → ESCALATE (un rojo sin correcciones es un bug · §58)', async () => {
    const deps = makeDeps({
      policy: policy({ artifact_class: 'contenido', judgment_enabled: true, canon_grader: 'vote_3_of_n' }),
      vote: { verdict: 'REJECT', scores: { votes: { green: 0, amber: 0, red: 2, total: 2 } }, corrections: [] },
    })
    expect((await gradeArtifact(input, deps)).verdict).toBe('ESCALATE')
  })

  it('REJECT con correcciones → se mantiene REJECT', async () => {
    const deps = makeDeps({
      policy: policy({ artifact_class: 'contenido', judgment_enabled: true, canon_grader: 'vote_3_of_n' }),
      vote: { verdict: 'REJECT', scores: {}, corrections: [CORRECTION] },
    })
    expect((await gradeArtifact(input, deps)).verdict).toBe('REJECT')
  })

  it('loop-cap central · CORRECTED en el cap → ESCALATE', async () => {
    const deps = makeDeps({
      policy: policy({ max_cycles: 1 }),
      fidelity: { verdict: 'CORRECTED', scores: {}, corrections: [CORRECTION] },
    })
    // cycle 0 · cycle+1=1 >= max_cycles 1 → cap alcanzado
    const out = await gradeArtifact(input, deps, 0)
    expect(out.verdict).toBe('ESCALATE')
  })

  it('atLoopCap · respeta max_cycles', () => {
    expect(atLoopCap(0, policy({ max_cycles: 1 }))).toBe(false)
    expect(atLoopCap(1, policy({ max_cycles: 1 }))).toBe(true)
    expect(atLoopCap(2, policy({ max_cycles: 3 }))).toBe(false)
    expect(atLoopCap(3, policy({ max_cycles: 3 }))).toBe(true)
  })
})
