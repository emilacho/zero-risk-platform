/**
 * JEFATURA · Observabilidad M1 · queries §148 predefinidas
 * ========================================================
 * ADR-020 Anexo M1 §4 · "el build las deja corriendo, no las improvisa". Todas leen el
 * namespace `metadata.jefatura` (por-invocación) y `metadata.jefatura_verdict` (veredicto ·
 * en la invocación decisora) de `agent_invocations`. Read-only · $0.
 *
 * Convención de paths:
 *   - metadata->'jefatura'          → JefaturaInvocationMeta (cada jefe/scorer)
 *   - metadata->'jefatura_verdict'  → JefaturaVerdictMeta    (solo la invocación decisora)
 *
 * NOTA · son plantillas SQL parametrizables ($1, $2, ...) · el build las expone como vistas
 * o endpoints read-only. No se ejecutan desde este módulo (sustrato · sin apply).
 */

export interface JefaturaQuery {
  name: string
  description: string
  /** parámetros posicionales esperados ($1, $2, ...). */
  params: string[]
  sql: string
}

/** 1 · Resoluciones por artifact_type / cliente / período. */
export const Q_RESOLUTIONS_BY_TYPE: JefaturaQuery = {
  name: 'resolutions_by_type',
  description: 'Resoluciones (review_id distintos) por artifact_type + cliente en un período.',
  params: ['client_id', 'from_ts', 'to_ts'],
  sql: `
    select
      metadata->'jefatura'->>'artifact_type' as artifact_type,
      count(distinct metadata->'jefatura'->>'review_id') as resolutions,
      count(*) as invocations
    from agent_invocations
    where metadata ? 'jefatura'
      and metadata->'jefatura'->>'client_id' = $1
      and created_at >= $2 and created_at < $3
    group by 1
    order by resolutions desc;
  `.trim(),
}

/** 2 · % de resoluciones con evidence_refs no-vacío (meta: 100% en cimiento). */
export const Q_EVIDENCE_REFS_COVERAGE: JefaturaQuery = {
  name: 'evidence_refs_coverage',
  description:
    'Cobertura de evidence_refs por artifact_type · % con evidence_refs no-vacío y % chunk_linked (meta 100% en cimiento).',
  params: [],
  sql: `
    select
      metadata->'jefatura'->>'artifact_type' as artifact_type,
      count(*) as verdicts,
      round(100.0 * avg((jsonb_array_length(coalesce(metadata->'jefatura_verdict'->'evidence_refs','[]')) > 0)::int), 1) as pct_non_empty,
      round(100.0 * avg((metadata->'jefatura_verdict'->>'grounding' = 'chunk_linked')::int), 1) as pct_chunk_linked
    from agent_invocations
    where metadata ? 'jefatura_verdict'
    group by 1
    order by artifact_type;
  `.trim(),
}

/** 3 · Acuerdo judge-vs-sombra (patrón F1.2) · desde el shadow_scoring del scorer sombra. */
export const Q_JUDGE_SHADOW_AGREEMENT: JefaturaQuery = {
  name: 'judge_shadow_agreement',
  description:
    'Acuerdo judge-vs-sombra (mean_abs_delta) por resolución · rol=shadow · patrón F1.2 (metadata.fidelity_forced_emit.shadow_scoring).',
  params: ['from_ts'],
  sql: `
    select
      metadata->'jefatura'->>'review_id' as review_id,
      metadata->'jefatura'->>'effective_model' as shadow_model,
      (metadata->'fidelity_forced_emit'->'shadow_scoring'->>'mean_abs_delta')::float as mean_abs_delta,
      (metadata->'fidelity_forced_emit'->'shadow_scoring'->>'fields_compared')::int as fields_compared
    from agent_invocations
    where metadata->'jefatura'->>'role' = 'shadow'
      and metadata->'fidelity_forced_emit' ? 'shadow_scoring'
      and created_at >= $1
    order by mean_abs_delta desc nulls last;
  `.trim(),
}

/** 4 · Costo por resolución vs cap (§150). */
export const Q_COST_PER_RESOLUTION: JefaturaQuery = {
  name: 'cost_per_resolution',
  description:
    'Costo total por resolución (suma de invocaciones del review_id) vs el cost_usd declarado del veredicto · flag si excede un cap.',
  params: ['cap_usd'],
  sql: `
    select
      inv.review_id,
      inv.artifact_type,
      round(inv.cost_sum::numeric, 4) as cost_from_invocations,
      round(v.verdict_cost::numeric, 4) as cost_declared_verdict,
      (inv.cost_sum > $1) as over_cap
    from (
      select
        metadata->'jefatura'->>'review_id' as review_id,
        max(metadata->'jefatura'->>'artifact_type') as artifact_type,
        sum(cost_usd) as cost_sum
      from agent_invocations
      where metadata ? 'jefatura'
      group by 1
    ) inv
    left join (
      select
        metadata->'jefatura'->>'review_id' as review_id,
        (metadata->'jefatura_verdict'->>'cost_usd')::float as verdict_cost
      from agent_invocations
      where metadata ? 'jefatura_verdict'
    ) v using (review_id)
    order by cost_from_invocations desc;
  `.trim(),
}

/** 5 · Ciclos consumidos vs max_cycles (loop-cap central · auditado contra `cycle`). */
export const Q_CYCLES_VS_CAP: JefaturaQuery = {
  name: 'cycles_vs_cap',
  description:
    'Ciclos consumidos (max cycle observado) por resolución vs max_cycles de la política · flag si excede.',
  params: [],
  sql: `
    select
      metadata->'jefatura'->>'review_id' as review_id,
      max((metadata->'jefatura'->>'cycle')::int) as cycles_used,
      max((metadata->'jefatura'->'policy_snapshot'->>'max_cycles')::int) as max_cycles,
      bool_or((metadata->'jefatura'->>'cycle')::int > (metadata->'jefatura'->'policy_snapshot'->>'max_cycles')::int) as over_cap
    from agent_invocations
    where metadata ? 'jefatura'
    group by 1
    order by cycles_used desc;
  `.trim(),
}

/** 6 · Violaciones de contrato §148 (corrections_count=0 · cimiento prose_only · §149 faltante). */
export const Q_CONTRACT_VIOLATIONS: JefaturaQuery = {
  name: 'contract_violations',
  description:
    'Toda invocación/veredicto con contract_violations no-vacío · el bug se ve en la traza, no se pierde.',
  params: [],
  sql: `
    select
      metadata->'jefatura'->>'review_id' as review_id,
      metadata->'jefatura'->>'artifact_type' as artifact_type,
      coalesce(metadata->'jefatura'->'contract_violations', '[]'::jsonb) as invocation_violations,
      coalesce(metadata->'jefatura_verdict'->'contract_violations', '[]'::jsonb) as verdict_violations,
      created_at
    from agent_invocations
    where jsonb_array_length(coalesce(metadata->'jefatura'->'contract_violations','[]')) > 0
       or jsonb_array_length(coalesce(metadata->'jefatura_verdict'->'contract_violations','[]')) > 0
    order by created_at desc;
  `.trim(),
}

/** Todas las queries §148 predefinidas de la Jefatura. */
export const JEFATURA_QUERIES: JefaturaQuery[] = [
  Q_RESOLUTIONS_BY_TYPE,
  Q_EVIDENCE_REFS_COVERAGE,
  Q_JUDGE_SHADOW_AGREEMENT,
  Q_COST_PER_RESOLUTION,
  Q_CYCLES_VS_CAP,
  Q_CONTRACT_VIOLATIONS,
]
