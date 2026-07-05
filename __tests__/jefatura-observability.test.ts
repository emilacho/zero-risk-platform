/**
 * Tests · JEFATURA · Observabilidad M1 · namespace `metadata.jefatura`
 * ADR-020 Anexo M1 · sustrato $0 · builders puros + enforcement §148-queryable.
 */
import { describe, it, expect } from 'vitest'
import {
  buildJefaturaInvocationMeta,
  buildJefaturaVerdictMeta,
  deriveGrounding,
  CIMIENTO_ARTIFACT_TYPES,
  type BuildInvocationInput,
  type BuildVerdictInput,
  type JefaturaEvidenceRef,
} from '../src/lib/jefatura/observability'
import { JEFATURA_QUERIES, Q_EVIDENCE_REFS_COVERAGE } from '../src/lib/jefatura/queries'

const policy = { mecanismo: 'fidelity' as const, threshold: 0.85, max_cycles: 1 }

const invBase: BuildInvocationInput = {
  reviewId: 'rev-1',
  artifactType: 'brand_book',
  artifactId: 'art-1',
  clientId: 'client-1',
  policyId: 'pol-cimiento-v1',
  policySnapshot: policy,
  role: 'fidelity_scorer',
  cycle: 0,
  nominalAgent: 'gpt-5.5-advisor',
  effectiveModel: 'claude-sonnet-4-6',
  workflowId: 'wf-1',
  workflowExecutionId: 'exec-1',
}

const verdictBase: BuildVerdictInput = {
  reviewId: 'rev-1',
  artifactType: 'brand_book',
  verdict: 'pass',
  scores: { positioning: 0.95, icp_summary: 0.92, _aggregate: 0.93 },
  correctionsCount: 1,
  costUsd: 0.42,
}

describe('metadata.jefatura · invocación', () => {
  it('arma el namespace completo con los campos del Anexo M1 §1', () => {
    const m = buildJefaturaInvocationMeta(invBase)
    expect(m.review_id).toBe('rev-1')
    expect(m.artifact_type).toBe('brand_book')
    expect(m.policy_snapshot).toEqual(policy)
    expect(m.role).toBe('fidelity_scorer')
    expect(m.cycle).toBe(0)
    expect(m.workflow_id).toBe('wf-1')
    expect(m.braintrust_exported).toBe(false)
    expect(m.contract_violations).toEqual([])
  })

  it('herencia F1.2 · registra nominal_agent + effective_model sin mentir el modelo', () => {
    const m = buildJefaturaInvocationMeta(invBase)
    expect(m.nominal_agent).toBe('gpt-5.5-advisor')
    expect(m.effective_model).toBe('claude-sonnet-4-6') // NO dice gpt-5.5
  })

  it('§149 · detecta workflow_id / workflow_execution_id faltantes (no tira · registra)', () => {
    const m = buildJefaturaInvocationMeta({ ...invBase, workflowId: null, workflowExecutionId: undefined })
    expect(m.contract_violations).toContain('missing_workflow_id')
    expect(m.contract_violations).toContain('missing_workflow_execution_id')
  })

  it('loop-cap · marca cycle que excede max_cycles', () => {
    const m = buildJefaturaInvocationMeta({ ...invBase, cycle: 3 })
    expect(m.contract_violations).toContain('cycle_exceeds_max_cycles')
  })
})

describe('metadata.jefatura_verdict · veredicto', () => {
  it('arma el veredicto con los campos del Anexo M1 §2 (caso limpio · cimiento chunk_linked)', () => {
    const v = buildJefaturaVerdictMeta({
      ...verdictBase,
      evidenceRefs: [
        { field: 'positioning', chunk_id: 'c1' },
        { field: 'icp_summary', chunk_id: 'c2' },
      ],
    })
    expect(v.verdict).toBe('pass')
    expect(v.scores.positioning).toBe(0.95)
    expect(v.corrections_count).toBe(1)
    expect(v.cost_usd).toBe(0.42)
    expect(v.grounding).toBe('chunk_linked')
    expect(v.contract_violations).toEqual([]) // cimiento con chunk_linked · sin violación
  })

  it('corrections_count ≥ 1 SIEMPRE · 0 = bug detectado', () => {
    const v = buildJefaturaVerdictMeta({ ...verdictBase, correctionsCount: 0 })
    expect(v.contract_violations).toContain('corrections_count_zero')
  })

  it('rechazo sin correcciones = bug duro (rojo sin correcciones)', () => {
    const v = buildJefaturaVerdictMeta({ ...verdictBase, verdict: 'corrections', correctionsCount: 0 })
    expect(v.contract_violations).toContain('rejection_without_corrections')
  })

  it('voto de contenido lleva vote_tally', () => {
    const v = buildJefaturaVerdictMeta({
      ...verdictBase,
      artifactType: 'ad_creative',
      voteTally: { green: 2, amber: 1, red: 0 },
    })
    expect(v.vote_tally).toEqual({ green: 2, amber: 1, red: 0 })
  })
})

describe('grounding honesto (evidence_refs)', () => {
  it('sin refs → prose_only', () => {
    expect(deriveGrounding([])).toBe('prose_only')
  })

  it('refs con chunk_id null (surfacing no existe) → prose_only', () => {
    const refs: JefaturaEvidenceRef[] = [{ field: 'positioning', chunk_id: null }]
    expect(deriveGrounding(refs)).toBe('prose_only')
  })

  it('todas las refs con chunk_id real → chunk_linked', () => {
    const refs: JefaturaEvidenceRef[] = [
      { field: 'positioning', chunk_id: 'c1' },
      { field: 'icp_summary', chunk_id: 'c2' },
    ]
    expect(deriveGrounding(refs)).toBe('chunk_linked')
  })

  it('cimiento con prose_only se marca (no se sobre-vende groundedness)', () => {
    const v = buildJefaturaVerdictMeta({ ...verdictBase, evidenceRefs: [] })
    expect(v.grounding).toBe('prose_only')
    expect(v.contract_violations).toContain('cimiento_prose_only')
    expect(CIMIENTO_ARTIFACT_TYPES.has('brand_book')).toBe(true)
  })

  it('cimiento chunk_linked NO marca violación', () => {
    const v = buildJefaturaVerdictMeta({
      ...verdictBase,
      evidenceRefs: [{ field: 'positioning', chunk_id: 'c1' }],
    })
    expect(v.grounding).toBe('chunk_linked')
    expect(v.contract_violations).not.toContain('cimiento_prose_only')
  })

  it('contenido con prose_only NO marca cimiento_prose_only', () => {
    const v = buildJefaturaVerdictMeta({ ...verdictBase, artifactType: 'ad_creative', evidenceRefs: [] })
    expect(v.contract_violations).not.toContain('cimiento_prose_only')
  })
})

describe('queries §148 predefinidas', () => {
  it('expone las 6 queries del Anexo M1 §4 con SQL no vacío', () => {
    expect(JEFATURA_QUERIES).toHaveLength(6)
    for (const q of JEFATURA_QUERIES) {
      expect(q.name).toBeTruthy()
      expect(q.sql.length).toBeGreaterThan(20)
    }
  })

  it('la query de cobertura mide evidence_refs no-vacío + chunk_linked', () => {
    expect(Q_EVIDENCE_REFS_COVERAGE.sql).toContain('evidence_refs')
    expect(Q_EVIDENCE_REFS_COVERAGE.sql).toContain('chunk_linked')
  })
})
