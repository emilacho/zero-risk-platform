/**
 * JEFATURA · hardening pre-P3 · normalización de la emisión de scores del judge
 * =============================================================================
 * Gap de DESPERDICIO cazado en la sonda P2 (CC#3 · E1/E3): Haiku a veces emite `scores` como
 * un STRING pseudo-JSON con centinelas `<UNKNOWN>` en los campos no-fácticos, en vez de un objeto.
 * El consumidor (worker `faithfulness-judge.js:41-45` · o `grade-cimiento`→`clamp01`) indexa
 * `scores[campo]`: si `scores` es un string, TODOS los campos dan undefined → todo se pisa a 0 →
 * over-ESCALATE de un cimiento LEGÍTIMO → desperdicia la corrida pagada P3.
 *
 * Es SEGURO (nunca falso-verde · el floor-0 es conservador) pero DESPERDICIA. Esta normalización
 * recupera los scores numéricos reales del string ANTES de indexar · fallback al floor-0 actual si
 * no parsea (conservador se mantiene). $0 · función pura · sin modelo.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeFidelityScores,
  normalizeFidelityToolInput,
  gradeFidelity,
} from '../src/lib/jefatura/fidelity-grader'

// El quirk EXACTO observado en P2 corrida-1 · `scores` llegó como este string (con `<UNKNOWN>`).
const P2_QUIRK_STRING =
  '{\n  "positioning": 1,\n  "icp_summary": 0,\n  "voice_description": 0.8,\n' +
  '  "customer_angle": <UNKNOWN>,\n  "retention_notes": <UNKNOWN>\n}'

describe('normalizeFidelityScores · recupera el quirk string/<UNKNOWN> de Haiku', () => {
  it('el string pseudo-JSON con <UNKNOWN> del P2 → recupera los numéricos, omite los <UNKNOWN>', () => {
    const out = normalizeFidelityScores(P2_QUIRK_STRING)
    expect(out.positioning).toBe(1)
    expect(out.icp_summary).toBe(0)
    expect(out.voice_description).toBe(0.8)
    // los <UNKNOWN> NO se fabrican · se omiten (caen al floor-0 seguro del consumidor).
    expect('customer_angle' in out).toBe(false)
    expect('retention_notes' in out).toBe(false)
  })

  it('un objeto de números pasa igual (caso feliz intacto · valores preservados)', () => {
    expect(normalizeFidelityScores({ positioning: 0.95, icp_summary: 0.9 })).toEqual({
      positioning: 0.95,
      icp_summary: 0.9,
    })
  })

  it('un objeto con un valor <UNKNOWN>/no-numérico → omite ese campo, conserva los válidos', () => {
    expect(normalizeFidelityScores({ positioning: 0.95, customer_angle: '<UNKNOWN>' })).toEqual({
      positioning: 0.95,
    })
  })

  it('string JSON bien-formado (sin centinelas) → se parsea a objeto', () => {
    const out = normalizeFidelityScores('{"positioning":0.91,"icp_summary":0.88}')
    expect(out).toEqual({ positioning: 0.91, icp_summary: 0.88 })
  })

  it('string con valores numéricos entre comillas → también se recupera', () => {
    const out = normalizeFidelityScores('{"positioning": "0.87", "icp_summary": "0.9"}')
    expect(out.positioning).toBe(0.87)
    expect(out.icp_summary).toBe(0.9)
  })

  it('string irrecuperable → {} (floor-0 conservador · se mantiene el comportamiento seguro)', () => {
    expect(normalizeFidelityScores('las notas de fidelidad no fueron capturadas')).toEqual({})
    expect(normalizeFidelityScores(null)).toEqual({})
    expect(normalizeFidelityScores(undefined)).toEqual({})
    expect(normalizeFidelityScores(42)).toEqual({})
  })
})

describe('normalizeFidelityToolInput · normaliza {scores,...} preservando la forma', () => {
  it('input con scores-string → devuelve scores como objeto de números', () => {
    const out = normalizeFidelityToolInput({ scores: P2_QUIRK_STRING })
    expect(out.scores).toMatchObject({ positioning: 1, icp_summary: 0, voice_description: 0.8 })
  })

  it('input nulo/no-objeto → { scores: {} } (nunca rompe el surface)', () => {
    expect(normalizeFidelityToolInput(null)).toEqual({ scores: {} })
    expect(normalizeFidelityToolInput(undefined)).toEqual({ scores: {} })
  })
})

describe('waste-prevention · el gate deja de over-ESCALATE un cimiento legítimo por el quirk', () => {
  const gradeArgs = { fidelityCycle: 3, maxCycles: 3, traceId: 'probe' as const }

  it('SIN normalizar · scores-string → el gate pisa todo a 0 → ESCALATE (desperdicio)', () => {
    // reproduce el bug: pasar el string crudo al grader (como haría el consumidor hoy).
    const bug = gradeFidelity({ scores: P2_QUIRK_STRING as unknown as Record<string, unknown>, ...gradeArgs })
    expect(bug.scores.fidelity).toBe(0) // positioning=1 real, pero el string indexado da 0
    expect(bug.verdict).toBe('ESCALATE') // over-ESCALATE de un cimiento que puntuó bien
  })

  it('CON normalizar · un cimiento legítimo (ambos fácticos ≥0.85) → PASS, no se desperdicia', () => {
    // string bien-fundado que el quirk habría hundido a 0.
    const grounded = '{\n  "positioning": 0.95,\n  "icp_summary": 0.9,\n  "voice_description": <UNKNOWN>\n}'
    const fixed = gradeFidelity({ scores: normalizeFidelityScores(grounded), ...gradeArgs })
    expect(fixed.scores.fidelity).toBe(0.9) // min(0.95, 0.9)
    expect(fixed.verdict).toBe('PASS')
  })

  it('CON normalizar · el falso-verde (E3) SIGUE cazado · el dato inventado hunde el campo', () => {
    // positioning fundado 0.95 · icp_summary con dato inventado = 0.4 → gate frena (nunca falso-verde).
    const contaminated = '{"positioning": 0.95, "icp_summary": 0.4}'
    const graded = gradeFidelity({ scores: normalizeFidelityScores(contaminated), ...gradeArgs })
    expect(graded.scores.fidelity).toBe(0.4)
    expect(graded.verdict).toBe('ESCALATE')
    expect(graded.low_fields).toEqual(['icp_summary'])
  })
})
