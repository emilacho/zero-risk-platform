/**
 * Canon canonical · in-memory `IngressTablesAdapter` · sala-ingress.
 *
 * Test-friendly · cero DB · cero env reads. Tests + smoke seed the
 * sources/rules they need.
 */
import type {
  IngressSource,
  IngressTablesAdapter,
  RoutingRule,
} from './types'

export class InMemoryIngressTables implements IngressTablesAdapter {
  private readonly sources = new Map<string, IngressSource>()
  private readonly rules = new Map<string, RoutingRule>()

  seedSource(source: IngressSource): this {
    this.sources.set(source.source, source)
    return this
  }

  seedRule(rule: RoutingRule): this {
    this.rules.set(`${rule.source}::${rule.intent}`, rule)
    return this
  }

  async getSource(source: string): Promise<IngressSource | null> {
    return this.sources.get(source) ?? null
  }

  async getRoutingRule(source: string, intent: string): Promise<RoutingRule | null> {
    return this.rules.get(`${source}::${intent}`) ?? null
  }
}
