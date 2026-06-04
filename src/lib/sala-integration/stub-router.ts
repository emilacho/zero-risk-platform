/**
 * Canon canonical · Stub Router · Track H placeholder
 *
 * Sprint 12 Fase 0 Ronda 3 Track K · CC#1.
 *
 * Track H (CC#3 · canon canon-canon-aterrice próximamente) implementará la
 * canon-real `decide({event, blackboard, journey, libreto}) → Dispatch[]`
 * stateless function. Este stub satisface la forma canónica con lógica
 * deterministic-walk-the-libreto para que la integración E2E funcione hoy.
 *
 * Canon canonical · función TOTAL · cero drop silente.
 */
import type { Libreto, Step } from '@/lib/sala/libretos/types'
import type { DispatchDecision, RouterContext, StubRouter } from './types'
import { defaultStubInterpreter, type DefaultStubInterpreter } from './stub-interpreter'

export interface DefaultStubRouterOptions {
  /** Canon canonical · interpreter para resolver next-step · default
   * canon-defaultStubInterpreter. Track G aterrice canon canon-replace. */
  readonly interpreter?: DefaultStubInterpreter
  /**
   * Canon canonical · simular budget exceeded para tests · canon-cuando
   * Track H aterrice, canon canon-replace con bucket atómico G6 real.
   */
  readonly simulateBudgetExceeded?: boolean
  /**
   * Canon canonical · simular needs_judgment para tests · canon-cuando
   * unknown step encontrado o predicado off-script.
   */
  readonly simulateNeedsJudgment?: boolean
}

export class DefaultStubRouter implements StubRouter {
  constructor(private readonly options: DefaultStubRouterOptions = {}) {}

  decide(ctx: RouterContext): DispatchDecision {
    const interpreter = this.options.interpreter ?? defaultStubInterpreter

    // canon · canon canon-canon-budget check simulated (Track H real G6 binding)
    if (this.options.simulateBudgetExceeded) {
      return {
        kind: 'budget_blocked',
        bucket_key: `${ctx.libreto.journey_type}:${ctx.journey.client_id ?? 'unknown'}`,
      }
    }

    // canon · canon canon-canon-needs_judgment simulated (§H-a off-script)
    if (this.options.simulateNeedsJudgment) {
      return {
        kind: 'needs_judgment',
        reason: 'stub_router_off_script',
      }
    }

    // canon · canon canon-canon-determine the step canon canon-to dispatch
    let candidateStep: Step

    if (ctx.journey.current_step) {
      // canon · canon canon-canon-already on a step · canon-resolve next
      const resolution = interpreter.resolveNextStep(
        ctx.libreto,
        ctx.journey.current_step,
        ctx.blackboard,
      )
      if (resolution.kind === 'unknown') {
        return {
          kind: 'needs_judgment',
          reason: `unknown_step_target_${resolution.target}`,
        }
      }
      if (resolution.kind === 'terminal') {
        return {
          kind: 'terminal',
          step_id: resolution.step.step_id,
          outcome:
            resolution.step.step_type === 'terminal_success' ? 'success' : 'failure',
        }
      }
      candidateStep = resolution.step
    } else {
      // canon · canon canon-canon-no current step · canon canon-canon-this is the first event in the stream
      const first = ctx.libreto.steps.find(
        (s) => s.step_id === ctx.libreto.entry_step_id,
      )
      if (!first) {
        return {
          kind: 'needs_judgment',
          reason: 'libreto_missing_entry_step',
        }
      }
      candidateStep = first
    }

    // canon · canon canon-canon-decide based on step type
    if (candidateStep.step_type === 'gate_camino_iii') {
      return { kind: 'gate_pending', step_id: candidateStep.step_id, gate_type: 'camino_iii' }
    }
    if (candidateStep.step_type === 'gate_hitl') {
      return { kind: 'gate_pending', step_id: candidateStep.step_id, gate_type: 'hitl' }
    }
    if (candidateStep.step_type === 'gate_144') {
      return { kind: 'gate_pending', step_id: candidateStep.step_id, gate_type: '§144' }
    }
    if (
      candidateStep.step_type === 'terminal_success' ||
      candidateStep.step_type === 'terminal_failure'
    ) {
      return {
        kind: 'terminal',
        step_id: candidateStep.step_id,
        outcome: candidateStep.step_type === 'terminal_success' ? 'success' : 'failure',
      }
    }
    if (candidateStep.step_type === 'action') {
      return {
        kind: 'dispatch',
        step_id: candidateStep.step_id,
        agent_id: candidateStep.agent_id,
        operation_type: `${ctx.libreto.journey_type}.${candidateStep.step_id}`,
      }
    }
    // canon canon-canon · fork/join · canon canon-canon-treat as needs_judgment in stub
    return {
      kind: 'needs_judgment',
      reason: `stub_unsupported_step_type_${(candidateStep as { step_type: string }).step_type}`,
    }
  }
}

export const defaultStubRouter = new DefaultStubRouter()
