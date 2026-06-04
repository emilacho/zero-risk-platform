/**
 * Canon canonical · Stub Interpreter · Track G placeholder
 *
 * Sprint 12 Fase 0 Ronda 3 Track K · CC#1.
 *
 * Track G (CC#4 · canon canon-canon-aterrice próximamente) implementará el
 * canon-real interpreter con predicados nombrados + JSONPath sobre el
 * blackboard. Este stub evalúa static refs y conditional refs con
 * predicados básicos para que la integración E2E funcione hoy.
 *
 * Canon canonical-replaceable · canon canon-cuando Track G aterrice, swap
 * `defaultStubInterpreter` por `realInterpreter` y los tests no cambian.
 */
import type { Libreto, NextStepRef, Step } from '@/lib/sala/libretos/types'
import type { BlackboardState } from '@/lib/sala-blackboard'
import type { NextStepResolution, StubInterpreter } from './types'

/**
 * Canon canonical · simple predicate registry · canon canon-Track G
 * extenderá con el catálogo completo de predicados nombrados.
 *
 * Convention canonical · `when` puede ser:
 *   - `"always"` · canon-true siempre
 *   - `"has:<key>"` · canon-true si blackboard.artifacts[key] existe
 *   - `"missing:<key>"` · canon-true si blackboard.artifacts[key] no existe
 *   - `"approved"` · canon-true (canon canon-canon-shortcut para gate-approved branches)
 *   - other · canon-false (canon-defensive · stub canon canon-canon-no asume nada)
 */
export function evaluateStubPredicate(
  when: string,
  blackboard: BlackboardState,
): boolean {
  if (when === 'always') return true
  if (when === 'approved') return true
  if (when.startsWith('has:')) {
    const key = when.slice(4)
    return key in blackboard.artifacts
  }
  if (when.startsWith('missing:')) {
    const key = when.slice(8)
    return !(key in blackboard.artifacts)
  }
  return false
}

export class DefaultStubInterpreter implements StubInterpreter {
  resolveNextStep(
    libreto: Libreto,
    current_step_id: string,
    blackboard: BlackboardState,
  ): NextStepResolution {
    const currentStep = this.findStep(libreto, current_step_id)
    if (!currentStep) {
      return { kind: 'unknown', target: current_step_id }
    }

    // canon · canon canon-canon-terminal steps don't have next_step
    if (
      currentStep.step_type === 'terminal_success' ||
      currentStep.step_type === 'terminal_failure'
    ) {
      return { kind: 'terminal', step: currentStep }
    }

    // canon · canon canon-canon-fork/join handled like static for stub
    if (currentStep.step_type === 'fork') {
      // canon · canon canon-canon-stub treats fork as direct jump to join_at (defensive)
      const target = currentStep.join_at
      return this.lookupTarget(libreto, target)
    }

    if (currentStep.step_type === 'join') {
      return this.followRef(libreto, currentStep.next_step, blackboard)
    }

    // canon · canon canon-action + gate steps both have next_step
    if (
      currentStep.step_type === 'action' ||
      currentStep.step_type === 'gate_camino_iii' ||
      currentStep.step_type === 'gate_hitl' ||
      currentStep.step_type === 'gate_144'
    ) {
      return this.followRef(libreto, currentStep.next_step, blackboard)
    }

    return { kind: 'unknown', target: current_step_id }
  }

  private followRef(
    libreto: Libreto,
    ref: NextStepRef,
    blackboard: BlackboardState,
  ): NextStepResolution {
    if (ref.kind === 'static') {
      return this.lookupTarget(libreto, ref.step_id)
    }
    // canon canon-canon · conditional · evaluate predicates in order
    for (const branch of ref.conditions) {
      if (evaluateStubPredicate(branch.when, blackboard)) {
        return this.lookupTarget(libreto, branch.then)
      }
    }
    return this.lookupTarget(libreto, ref.default)
  }

  private lookupTarget(libreto: Libreto, target_id: string): NextStepResolution {
    const target = this.findStep(libreto, target_id)
    if (!target) {
      return { kind: 'unknown', target: target_id }
    }
    if (
      target.step_type === 'terminal_success' ||
      target.step_type === 'terminal_failure'
    ) {
      return { kind: 'terminal', step: target }
    }
    return { kind: 'next', step: target }
  }

  private findStep(libreto: Libreto, step_id: string): Step | null {
    return libreto.steps.find((s) => s.step_id === step_id) ?? null
  }
}

export const defaultStubInterpreter = new DefaultStubInterpreter()
