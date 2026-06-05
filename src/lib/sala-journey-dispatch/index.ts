/**
 * Public surface · `src/lib/sala-journey-dispatch/`
 *
 * Sprint 12 Fase 0 prep finale · Model B (conexión 2026-06-05) ·
 * adapter library that connects the sala router's `dispatch` decision
 * to existing n8n worker workflows · plus the projection + reconciliation
 * helpers that bring events back to the event log.
 *
 * §148 honest · this lib is DEFAULT-OFF · `SALA_WORKFLOW_DISPATCH_ENABLED`
 * + `SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED` gates control whether
 * anything actually fires. With both off, the lib is a noop · canon
 * §144 escalón 6 flip flips them on.
 */

export {
  CANONICAL_PHASES_LyVoKcrypS5uLyuu,
  JOURNEY_WORKFLOW_MAP,
  getJourneyWorkflowTarget,
  isCanonicalPhase,
  isWorkflowJourney,
} from './journey-workflow-map'
export type {
  CanonicalPhaseLyVo,
  JourneyWorkflowTarget,
} from './journey-workflow-map'

export {
  isWorkflowDispatchEnabled,
  buildDispatchIdempotencyToken,
  dispatchToWorkflow,
} from './workflow-dispatcher'
export type {
  WorkflowDispatchInput,
  WorkflowDispatchResult,
  WorkflowDispatchLogger,
} from './workflow-dispatcher'

export {
  isAgentInvocationsProjectionEnabled,
  isWorkflowIdASalaStream,
  projectAgentInvocation,
  runAgentInvocationsProjection,
} from './agent-invocations-projection'
export type {
  AgentInvocationRow,
  ProjectAgentInvocationOptions,
  RunAgentInvocationsProjectionInput,
  RunAgentInvocationsProjectionHandle,
  ProjectionLogger,
} from './agent-invocations-projection'

export {
  reconcileObserved,
  postReconciliationAlert,
} from './reconciliation'

export {
  checkSalaWebhookAuth,
  parseIngressBody,
  parseCallbackBody,
  buildIngressIdempotencyOperationType,
  buildCallbackIdempotencyOperationType,
} from './webhook-receiver'

export {
  MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION,
  MODELB_PREDECESSOR_NODE_NAME,
  MODELB_RUNSDK_NODE_NAMES,
  MODELB_WORKER_ID,
  MODELB_EXPRESSION_INVARIANTS,
  checkExpressionInvariants,
} from './modelb-canonical-expression'

export {
  NAUFRAGO_PHASE1_RUN_CAP_USD,
  NAUFRAGO_DAILY_ALERT_USD,
  NAUFRAGO_TENANT_ID_HINT,
  isNaufragoCapEnforced,
  evaluateNaufragoRunCap,
  getNaufragoCapSnapshot,
} from './naufrago-cost-cap'
export type {
  NaufragoCostCapInput,
  NaufragoCostCapResult,
} from './naufrago-cost-cap'
export type {
  SalaWebhookAuthResult,
  SalaWebhookAuthInput,
  IngressBody,
  CallbackBody,
  ParsedBody,
} from './webhook-receiver'
export type {
  ReconcileInput,
  ReconcileResult,
  ReconcileMismatchKind,
  PostReconciliationAlertInput,
  AlertLogger,
} from './reconciliation'
