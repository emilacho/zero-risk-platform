/**
 * Canon canonical · stream_id minting · sala-ingress · §149 nace en la entrada.
 *
 * Opus VEREDICTO §6 · "§149 nace en la entrada · ingress acuña stream_id
 * /correlation_id en el sobre". Deterministic derivation from the envelope
 * idempotency_key + source + intent · two POSTs with the same envelope
 * yield the SAME stream_id → the event-log's UNIQUE idempotency_key
 * constraint catches the second.
 *
 * Format canon · `sala/v1/{tenant_id}/{client_id}/{intent}/{logical_period}/{short_hash}`
 *   - sala-prefix matches `isWorkflowIdASalaStream` heuristic (PR #172) so
 *     the projection lifts agent_invocations rows back to this stream
 *   - short_hash is 12-char SHA-256 over `source.intent.idempotency_key`
 *     for forensic uniqueness without leaking the key
 */
import crypto from 'node:crypto'

export interface MintStreamIdInput {
  readonly source: string
  readonly intent: string
  readonly idempotency_key: string
  readonly logical_period: string
  readonly tenant_id: string
  readonly client_id: string
}

export function mintStreamId(input: MintStreamIdInput): string {
  const seed = `${input.source}.${input.intent}.${input.idempotency_key}`
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12)
  return [
    'sala',
    'v1',
    sanitizePart(input.tenant_id),
    sanitizePart(input.client_id),
    sanitizePart(input.intent),
    sanitizePart(input.logical_period),
    hash,
  ].join('/')
}

export function mintCorrelationId(): string {
  return crypto.randomUUID()
}

function sanitizePart(s: string): string {
  // Path-safe · cero invalid characters · max 64 chars per part.
  return s.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 64)
}
