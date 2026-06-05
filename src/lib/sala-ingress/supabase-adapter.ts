/**
 * Canon canonical · Supabase `IngressTablesAdapter` · production reader.
 *
 * Reads from public.ingress_sources + public.routing_rules · RLS canon
 * service_role only (denied for anon/authenticated · see migration §RLS).
 *
 * §148 honest · this adapter SELECTs only the active rows per query;
 * the unique partial index on routing_rules guarantees at most 1
 * active rule per (source, intent).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IngressSource,
  IngressTablesAdapter,
  RoutingRule,
} from './types'

export class SupabaseIngressTables implements IngressTablesAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async getSource(source: string): Promise<IngressSource | null> {
    const { data, error } = await this.client
      .from('ingress_sources')
      .select(
        'source, tier, auth_method, auth_secret_env_var, intents_allowed, description, active',
      )
      .eq('source', source)
      .maybeSingle()
    if (error) {
      throw new Error(`getSource(${source}) · ${error.message}`)
    }
    return data
      ? {
          source: data.source,
          tier: data.tier,
          auth_method: data.auth_method,
          auth_secret_env_var: data.auth_secret_env_var,
          intents_allowed: data.intents_allowed,
          description: data.description,
          active: data.active,
        }
      : null
  }

  async getRoutingRule(
    source: string,
    intent: string,
  ): Promise<RoutingRule | null> {
    const { data, error } = await this.client
      .from('routing_rules')
      .select(
        'id, source, intent, journey_type, worker_workflow_id, active, priority, description',
      )
      .eq('source', source)
      .eq('intent', intent)
      .eq('active', true)
      .maybeSingle()
    if (error) {
      throw new Error(`getRoutingRule(${source}, ${intent}) · ${error.message}`)
    }
    return data
      ? {
          id: data.id,
          source: data.source,
          intent: data.intent,
          journey_type: data.journey_type,
          worker_workflow_id: data.worker_workflow_id,
          active: data.active,
          priority: data.priority,
          description: data.description,
        }
      : null
  }
}
