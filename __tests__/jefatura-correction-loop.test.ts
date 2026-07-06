/**
 * Tests · JEFATURA F1 · Lazo A generalizado + convergencia §7 · funciones puras · $0.
 */
import { describe, it, expect } from 'vitest'
import {
  triageCorrections,
  orderByAxisPrecedence,
  detectIrreconcilable,
  buildCreatorReSynthInput,
  decideConvergence,
  AXIS_OWNER,
  type ConvergenceAction,
} from '../src/lib/jefatura/correction-loop'
import type { JefaturaCorrection } from '../src/lib/jefatura/contract'

const c = (
  eje: JefaturaCorrection['eje'],
  severidad: JefaturaCorrection['severidad'],
  donde = 'campo',
  cambio = 'x',
): JefaturaCorrection => ({
  eje,
  severidad,
  donde,
  problema: 'p',
  por_que: 'pq',
  cambio_sugerido: cambio,
})

describe('§7.4 · dueño-de-eje', () => {
  it('cada eje tiene un jefe dueño', () => {
    expect(AXIS_OWNER.posicionamiento).toBe('brand-strategist')
    expect(AXIS_OWNER.factual).toBe('editor-en-jefe')
    expect(AXIS_OWNER.cliente).toBe('jefe-client-success')
  })
})

describe('§7.3 · triage · severidad + relevancia-al-gate', () => {
  it('CIMIENTO · solo rojo relevante-al-gate (factual/posicionamiento) es bloqueante', () => {
    const t = triageCorrections(
      [c('factual', 'rojo'), c('voz', 'rojo'), c('cliente', 'rojo'), c('posicionamiento', 'rojo')],
      { artifactClass: 'cimiento' },
    )
    // factual + posicionamiento bloquean · voz + cliente (estilístico) → advisory
    expect(t.blocking.map((x) => x.eje).sort()).toEqual(['factual', 'posicionamiento'])
    expect(t.advisory.map((x) => x.eje).sort()).toEqual(['cliente', 'voz'])
    expect(t.triggers_cycle).toBe(true)
  })

  it('el ÁMBAR nunca bloquea · es advisory (no cicla · §7.3)', () => {
    const t = triageCorrections([c('factual', 'ambar'), c('posicionamiento', 'ambar')], {
      artifactClass: 'cimiento',
    })
    expect(t.blocking).toHaveLength(0)
    expect(t.triggers_cycle).toBe(false)
    expect(t.advisory).toHaveLength(2)
  })

  it('CONTENIDO · todo rojo es bloqueante (mueve el voto)', () => {
    const t = triageCorrections([c('voz', 'rojo'), c('cliente', 'rojo')], {
      artifactClass: 'contenido',
    })
    expect(t.blocking).toHaveLength(2)
  })

  it('presupuesto top-N · las rojas extra quedan diferidas (no ocultas)', () => {
    const reds = Array.from({ length: 8 }, () => c('factual', 'rojo'))
    const t = triageCorrections(reds, { artifactClass: 'cimiento', topN: 3 })
    expect(t.blocking).toHaveLength(3)
    expect(t.deferred_blocking_count).toBe(5)
    // las diferidas van a advisory (registradas · §148)
    expect(t.advisory).toHaveLength(5)
  })

  it('perilla de Emilio · gateRelevantEjes override', () => {
    const t = triageCorrections([c('voz', 'rojo')], {
      artifactClass: 'cimiento',
      gateRelevantEjes: new Set(['voz']),
    })
    expect(t.blocking).toHaveLength(1) // voz ahora cuenta
  })
})

describe('§7.4 · precedencia + integración del creador', () => {
  it('orden por precedencia de eje · groundedness primero · estable', () => {
    const ordered = orderByAxisPrecedence([c('cliente', 'rojo'), c('factual', 'rojo'), c('voz', 'rojo')])
    expect(ordered.map((x) => x.eje)).toEqual(['factual', 'voz', 'cliente'])
  })

  it('irreconciliable · dos rojos cruzando ejes en el MISMO donde con cambios distintos', () => {
    const r = detectIrreconcilable([
      c('factual', 'rojo', 'hero', 'A'),
      c('posicionamiento', 'rojo', 'hero', 'B'),
    ])
    expect(r.irreconcilable).toBe(true)
    expect(r.conflicts).toHaveLength(1)
  })

  it('NO irreconciliable · mismo eje o distinto donde', () => {
    expect(detectIrreconcilable([c('factual', 'rojo', 'hero', 'A'), c('factual', 'rojo', 'hero', 'B')]).irreconcilable).toBe(false)
    expect(detectIrreconcilable([c('factual', 'rojo', 'hero', 'A'), c('voz', 'rojo', 'cta', 'B')]).irreconcilable).toBe(false)
  })

  it('buildCreatorReSynthInput · los jefes NO reescriben · el creador integra', () => {
    const inp = buildCreatorReSynthInput({ positioning: 'x' }, [c('factual', 'rojo')])
    expect(inp.blocking_corrections).toHaveLength(1)
    expect(inp.instruction).toContain('CREADOR')
    expect(inp.instruction.toLowerCase()).toContain('triage')
  })
})

describe('§7.5 + §7.6 · decideConvergence · la vara decide', () => {
  const cimiento = { artifact_class: 'cimiento' as const, fidelity_threshold: 0.85, max_cycles: 1 }
  const redTriage = triageCorrections([c('factual', 'rojo')], { artifactClass: 'cimiento' })
  const noTriage = triageCorrections([c('voz', 'ambar')], { artifactClass: 'cimiento' })

  it('la vara pasa → PASS (no se corrige lo que ya pasa)', () => {
    const a = decideConvergence({ cycle: 0, fidelity: 0.9 }, redTriage, cimiento)
    expect(a.action).toBe('pass')
  })

  it('cap agotado → ESCALATE a humano', () => {
    const a = decideConvergence({ cycle: 1, fidelity: 0.7 }, redTriage, cimiento)
    expect(a.action).toBe('escalate')
    expect(a.reason).toContain('cap')
  })

  it('irreconciliable → ESCALATE', () => {
    const a = decideConvergence({ cycle: 0, fidelity: 0.7 }, redTriage, cimiento, true)
    expect(a.action).toBe('escalate')
  })

  it('vara falla + sin bloqueantes → ESCALATE (gaps sin resolver → humano)', () => {
    const a = decideConvergence({ cycle: 0, fidelity: 0.7 }, noTriage, cimiento)
    expect(a.action).toBe('escalate')
  })

  it('vara falla + bloqueantes + cap disponible → CORRECT al creador', () => {
    const a = decideConvergence({ cycle: 0, fidelity: 0.7 }, redTriage, cimiento) as Extract<ConvergenceAction, { action: 'correct' }>
    expect(a.action).toBe('correct')
    expect(a.corrections).toHaveLength(1)
  })

  it('§7.6 · progreso no-monótono → STOP_BEST (re-síntesis no subió la fidelidad)', () => {
    const policy3 = { ...cimiento, max_cycles: 3 }
    const a = decideConvergence({ cycle: 1, fidelity: 0.7, prevFidelity: 0.72 }, redTriage, policy3)
    expect(a.action).toBe('stop_best')
  })

  it('§7.6 · progreso monótono (subió) → sigue corrigiendo', () => {
    const policy3 = { ...cimiento, max_cycles: 3 }
    const a = decideConvergence({ cycle: 1, fidelity: 0.8, prevFidelity: 0.72 }, redTriage, policy3)
    expect(a.action).toBe('correct')
  })

  it('CONTENIDO · voto aprueba → PASS', () => {
    const a = decideConvergence(
      { cycle: 0, votePassed: true },
      triageCorrections([], { artifactClass: 'contenido' }),
      { artifact_class: 'contenido', fidelity_threshold: null, max_cycles: 1 },
    )
    expect(a.action).toBe('pass')
  })
})
