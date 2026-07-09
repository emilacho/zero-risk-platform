/**
 * Tests · JEFATURA Peldaño 1 · BORDES (bucket B · $0 · ADR-020 §7 · §148).
 *
 * Complementa (NO duplica) jefatura-fidelity-grader.test.ts + jefatura-service.test.ts.
 * Cubre los bordes que el harness previo NO ejercita explícitamente:
 *  - Umbral EXACTO 0.85 (pasa · `<` estricto) vs 0.849 (no pasa · un pelo abajo).
 *  - cap=0 degenerado (lección bb-worker · §7/§121) → jamás abre ciclo · ESCALATE.
 *  - Evidencia FALTANTE (scores vacíos + refs vacías) → falla + prose_only + corrections.
 *  - Política malformada cap=0 ruteada por el núcleo → ESCALATE (no loop infinito).
 *
 * §148 · funciones puras · cero LLM · cero red · cero prod · $0.
 */
import { describe, it, expect } from 'vitest'
import {
  gradeFidelity,
  DEFAULT_FIDELITY_THRESHOLD,
  type FidelityGradeParams,
} from '../src/lib/jefatura/fidelity-grader'
import { gradeArtifact, atLoopCap, type JefaturaDeps } from '@/lib/jefatura/service'
import type { JefaturaGradingPolicy, JefaturaInput } from '@/lib/jefatura/contract'

const grade = (over: Partial<FidelityGradeParams> = {}): FidelityGradeParams => ({
  scores: { positioning: 0.9, icp_summary: 0.9 },
  fidelityCycle: 1,
  maxCycles: 3,
  traceId: 'trace-b',
  ...over,
})

describe('JEFATURA Peldaño 1 · B · umbral EXACTO 0.85 vs 0.849', () => {
  it('score == 0.85 (umbral) → PASS · el gate es `<` estricto, no `<=`', () => {
    const r = gradeFidelity(grade({ scores: { positioning: 0.85, icp_summary: 0.85 } }))
    expect(r.verdict).toBe('PASS')
    expect(r.low_fields).toEqual([])
    expect(r.scores.fidelity).toBeCloseTo(0.85)
    // el umbral canónico no cambió bajo los pies del test
    expect(DEFAULT_FIDELITY_THRESHOLD).toBe(0.85)
  })

  it('score == 0.849 (un pelo abajo) → NO PASS · el campo bloquea', () => {
    const r = gradeFidelity(grade({ scores: { positioning: 0.849, icp_summary: 0.9 } }))
    expect(r.verdict).not.toBe('PASS')
    expect(r.low_fields).toEqual(['positioning'])
    // quedan ciclos (1 de 3) ⇒ CORRECTED, no ESCALATE
    expect(r.verdict).toBe('CORRECTED')
    expect(r.exhausted).toBe(false)
  })

  it('0.85 en un campo · 0.849 en el otro → falla por el 0.849 (el min gatea)', () => {
    const r = gradeFidelity(grade({ scores: { positioning: 0.85, icp_summary: 0.849 } }))
    expect(r.low_fields).toEqual(['icp_summary'])
    expect(r.scores.fidelity).toBeCloseTo(0.849)
    expect(r.verdict).not.toBe('PASS')
  })
})

describe('JEFATURA Peldaño 1 · B · cap=0 degenerado (§7/§121 · bb-worker)', () => {
  it('cap=0 + fallo → ESCALATE inmediato · jamás abre un ciclo de corrección', () => {
    const r = gradeFidelity(grade({ scores: { positioning: 0.5, icp_summary: 0.9 }, fidelityCycle: 0, maxCycles: 0 }))
    expect(r.exhausted).toBe(true) // 0 >= 0
    expect(r.verdict).toBe('ESCALATE')
    expect(r.corrections.length).toBeGreaterThan(0) // ESCALATE viaja con correcciones (§58)
  })

  it('cap=0 + PASS → sigue PASS · el cap sólo muerde en el fallo', () => {
    const r = gradeFidelity(grade({ scores: { positioning: 0.9, icp_summary: 0.9 }, fidelityCycle: 0, maxCycles: 0 }))
    expect(r.verdict).toBe('PASS')
  })

  it('atLoopCap · cap=0 está agotado desde el ciclo 0 (nunca hay ciclo válido)', () => {
    const cap0 = { max_cycles: 0 } as unknown as JefaturaGradingPolicy
    expect(atLoopCap(0, cap0)).toBe(true)
    expect(atLoopCap(1, cap0)).toBe(true)
  })
})

describe('JEFATURA Peldaño 1 · B · evidencia FALTANTE', () => {
  it('scores vacíos + refs vacías → falla · grounding prose_only · corrections accionables', () => {
    const r = gradeFidelity(grade({ scores: {}, evidenceRefs: [], fidelityCycle: 1, maxCycles: 3 }))
    // sin score, cada campo gateado cae a 0 → ambos bloquean
    expect([...r.low_fields].sort()).toEqual(['icp_summary', 'positioning'])
    expect(r.grounding).toBe('prose_only') // no se sobre-vende groundedness que no existe
    expect(r.scores.fidelity).toBe(0)
    expect(r.corrections).toHaveLength(2)
    for (const c of r.corrections) {
      expect(c.severidad).toBe('rojo')
      expect(c.cambio_sugerido).toBeTruthy()
    }
  })
})

describe('JEFATURA Peldaño 1 · B · política malformada ruteada por el núcleo', () => {
  const input: JefaturaInput = {
    artifact_type: 'brand_book',
    artifact_id: 'a1',
    client_id: 'c1',
    journey_id: 'j1',
    payload: {},
  }
  const cap0Policy: JefaturaGradingPolicy = {
    artifact_type: 'brand_book',
    artifact_class: 'cimiento',
    correction_enabled: true,
    judgment_enabled: false,
    canon_grader: 'fidelity',
    counterweight: 'shadow_scorer',
    max_cycles: 0, // MALFORMADA · la migración lo prohíbe (BETWEEN 1 AND 3) · el núcleo igual la contiene
    fidelity_threshold: 0.85,
    vote_config: null,
    is_active: true,
  }

  it('cap=0 + grader devuelve CORRECTED → el núcleo ESCALA (no genera loop degenerado)', async () => {
    const deps: JefaturaDeps = {
      fetchPolicy: async () => cap0Policy,
      graders: {
        correction: { correct: async () => [] },
        fidelity: { grade: async () => ({ verdict: 'CORRECTED', scores: {}, corrections: [
          { eje: 'factual', severidad: 'rojo', donde: 'icp_summary', problema: 'x', por_que: 'y', cambio_sugerido: 'z' },
        ] }) },
        vote3ofN: { grade: async () => ({ verdict: 'PASS', scores: {}, corrections: [] }) },
      },
      genTraceId: () => 'trace-cap0',
    }
    const out = await gradeArtifact(input, deps, 0)
    // cycle+1 = 1 >= max_cycles 0 → cap alcanzado → ESCALATE
    expect(out.verdict).toBe('ESCALATE')
  })
})
