/**
 * src/lib/brain/portero.ts · Brain FASE C · enforce flip + quarantine
 *
 * Helper compartido por las DOS vías de escritura al cerebro ·
 *   - /api/brain/ingest-source
 *   - lib/brain/persist-chunks (onboarding + discovery)
 *
 * §144-per-flip (ADR-012 §3.1 · "shadow-first + §144-per-flip enforce") ·
 * el flip shadow→enforce se controla por env var · NO hard-coded · así el flip
 * (y el rollback) es una variable · sin redeploy · sin revertir código · y el
 * merge del PR NO activa enforce por sí solo (queda shadow hasta el §144 flip).
 *
 * shadow (default) · runIngressFilter nunca bloquea · solo audita.
 * enforce (BRAIN_INGRESS_ENFORCE='true') · chunks bloqueados NO se escriben al
 * cerebro · van a `ingress_quarantine` (revisión HITL · ADR-012 §5.3).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_ROUTE_POLICY,
  type IngressRoutePolicy,
  type IngressFilterDecision,
} from '../ingress-filter'

/** §144-per-flip · enforce solo cuando BRAIN_INGRESS_ENFORCE='true'. Default shadow. */
export function brainEnforceEnabled(): boolean {
  return process.env.BRAIN_INGRESS_ENFORCE === 'true'
}

/**
 * Route policy del portero del cerebro · shadow por defecto · enforce vía env.
 * En enforce, shadow_mode=false → runIngressFilter retorna allow=false cuando
 * un gate bloquea ≥ default_severity_min_reject (HIGH).
 */
export function brainRoutePolicy(): IngressRoutePolicy {
  return { ...DEFAULT_ROUTE_POLICY, shadow_mode: !brainEnforceEnabled() }
}

/**
 * INSERT a `ingress_quarantine` cuando el portero rechaza en enforce.
 * Graceful · nunca lanza · devuelve true si insertó.
 */
export async function quarantineChunk(
  supabase: SupabaseClient,
  args: {
    decision: IngressFilterDecision
    source: string
    trustLevel: string
    ingressRoute: string
    sectionLabel: string
    chunkText: string
    clientId?: string | null
    workflowId?: string | null
    journeyId?: string | null
  },
): Promise<boolean> {
  try {
    const text = args.chunkText ?? ''
    const { error } = await supabase.from('ingress_quarantine').insert({
      source: args.source,
      trust_level: args.trustLevel,
      rejection_reason:
        args.decision.block_reason ?? args.decision.block_gate ?? 'ingress_filter_block',
      payload: {
        section_label: args.sectionLabel,
        chunk_text: text.slice(0, 8000),
        request_id: args.decision.request_id,
        shadow_blocks: args.decision.shadow_blocks,
      },
      client_id: args.clientId ?? null,
      journey_id: args.journeyId ?? null,
      ingress_route: args.ingressRoute,
      payload_size_bytes: Buffer.byteLength(text, 'utf8'),
      gate_decisions: args.decision.gates,
      severity: args.decision.block_severity ?? args.decision.severity,
      status: 'pending',
      ...(args.workflowId ? { workflow_id: args.workflowId } : {}),
    })
    return !error
  } catch {
    return false
  }
}
