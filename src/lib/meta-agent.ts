/**
 * ZERO RISK V3 — Meta-Agent (Pilar 5)
 *
 * Weekly analysis engine that reviews agent_outcomes and proposes improvements.
 *
 * CRITICAL INVARIANT: The meta-agent NEVER applies changes directly.
 * All proposals go through HITL (Emilio via MC inbox or Slack).
 * No exceptions. Ever.
 *
 * Flow:
 *   1. n8n cron (weekly) → POST /api/analytics/meta-agent-run
 *   2. MetaAgent.runWeeklyAnalysis()
 *   3. Fetches unprocessed agent_outcomes
 *   4. Calls Claude (Sonnet) to analyze patterns
 *   5. Stores patterns + improvement proposals in DB
 *   6. Sends summary to MC inbox → Emilio reviews
 *   7. Emilio approves/rejects each proposal → /api/analytics/proposals/[id]/resolve
 *
 * Model: claude-sonnet-4-20250514 (cost-effective for analysis)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { FeedbackCollector } from './feedback-collector'
import { MissionControlBridge } from './mc-bridge'

// ============================================================
// Types
// ============================================================

export interface PatternDetected {
  pattern_id: string
  agent_name: string
  pattern_type: 'rejection_pattern' | 'quality_decline' | 'performance_trend' | 'cost_anomaly' | 'improvement_opportunity'
  description: string
  confidence: number          // 0.0 - 1.0
  evidence_count: number
  evidence_ids: string[]      // agent_outcome UUIDs
}

export interface ImprovementProposal {
  agent_name: string
  proposal_type: 'identity_update' | 'skill_adjustment' | 'model_change' | 'workflow_change' | 'parameter_tuning' | 'retirement'
  title: string
  rationale: string
  current_value?: string
  proposed_value?: string
  expected_impact: string
  pattern_id: string          // Reference to PatternDetected
  supporting_outcomes: string[]
  confidence_score: number
  priority: 'low' | 'medium' | 'high' | 'critical'
}

export interface MetaAgentRunResult {
  runId: string
  status: 'completed' | 'failed'
  outcomesAnalyzed: number
  patternsDetected: PatternDetected[]
  improvementsProposed: number
  executiveSummary: string
  costUsd: number
  durationMs: number
  error?: string
}

interface MetaAgentConfig {
  model?: string              // Default: claude-sonnet-4-20250514
  maxOutcomes?: number        // Default: 100
  sinceDays?: number          // Default: 7
  runType?: 'weekly' | 'manual' | 'triggered'
}

// Cost constants for Sonnet
const SONNET_INPUT_COST = 3.0 / 1_000_000
const SONNET_OUTPUT_COST = 15.0 / 1_000_000

// ============================================================
// Meta-Agent Class
// ============================================================

export class MetaAgent {
  private supabase: SupabaseClient
  private collector: FeedbackCollector
  private mc: MissionControlBridge
  private claudeApiKey: string
  private baseUrl: string

  constructor(supabase: SupabaseClient, options?: { baseUrl?: string }) {
    this.supabase = supabase
    this.collector = new FeedbackCollector(supabase)
    this.mc = new MissionControlBridge({ zrBaseUrl: options?.baseUrl })
    this.claudeApiKey = process.env.CLAUDE_API_KEY || ''
    this.baseUrl = options?.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  }

  // ----------------------------------------------------------
  // MAIN: Run weekly analysis
  // ----------------------------------------------------------

  async runWeeklyAnalysis(config: MetaAgentConfig = {}): Promise<MetaAgentRunResult> {
    const startTime = Date.now()
    const runType = config.runType || 'weekly'
    const maxOutcomes = config.maxOutcomes || 100
    const sinceDays = config.sinceDays || 7
    const model = config.model || 'claude-sonnet-4-20250514'

    // Step 1: Create meta_agent_runs record
    const { data: run, error: runError } = await this.supabase
      .from('meta_agent_runs')
      .insert({
        run_type: runType,
        status: 'running',
        started_at: new Date().toISOString(),
        date_range_start: new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString(),
        date_range_end: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (runError || !run) {
      return {
        runId: '',
        status: 'failed',
        outcomesAnalyzed: 0,
        patternsDetected: [],
        improvementsProposed: 0,
        executiveSummary: `Failed to create meta-agent run: ${runError?.message}`,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: runError?.message,
      }
    }

    const runId = run.id

    try {
      // Step 2: Fetch unprocessed outcomes
      const outcomes = await this.collector.getUnprocessedOutcomes(maxOutcomes, sinceDays)

      if (outcomes.length === 0) {
        await this.updateRun(runId, {
          status: 'completed',
          outcomes_analyzed: 0,
          executive_summary: 'No unprocessed outcomes found for analysis period.',
          completed_at: new Date().toISOString(),
        })

        return {
          runId,
          status: 'completed',
          outcomesAnalyzed: 0,
          patternsDetected: [],
          improvementsProposed: 0,
          executiveSummary: 'No unprocessed outcomes found for analysis period.',
          costUsd: 0,
          durationMs: Date.now() - startTime,
        }
      }

      // Step 3: Also fetch agent scorecards for context
      const scorecards = await this.collector.getAgentScorecards(undefined, sinceDays)

      // Step 4: Also fetch recent campaign results
      const campaignPerf = await this.collector.getCampaignPerformance(undefined, sinceDays)

      // Step 5: Build prompt and call Claude
      const analysisResult = await this.callClaudeForAnalysis(
        outcomes, scorecards, campaignPerf, model
      )

      // Step 6: Parse patterns and proposals from Claude's response
      const { patterns, proposals, summary, inputTokens, outputTokens } = analysisResult

      const costUsd = (inputTokens * SONNET_INPUT_COST) + (outputTokens * SONNET_OUTPUT_COST)

      // Step 7: Store patterns in meta_agent_runs
      const outcomeIds = outcomes.map((o: { id: string }) => o.id)

      await this.updateRun(runId, {
        status: 'completed',
        outcomes_analyzed: outcomes.length,
        outcomes_ids: outcomeIds,
        patterns_detected: patterns,
        improvements_proposed: proposals.length,
        executive_summary: summary,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      // Step 8: Store improvement proposals
      for (const proposal of proposals) {
        await this.storeProposal(runId, proposal)
      }

      // Step 9: Mark outcomes as processed
      await this.collector.markOutcomesProcessed(outcomeIds, runId)

      // Step 10: Notify Mission Control
      await this.notifyMissionControl(runId, patterns.length, proposals.length, summary)

      return {
        runId,
        status: 'completed',
        outcomesAnalyzed: outcomes.length,
        patternsDetected: patterns,
        improvementsProposed: proposals.length,
        executiveSummary: summary,
        costUsd,
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      await this.updateRun(runId, {
        status: 'failed',
        executive_summary: `Meta-agent analysis failed: ${errorMsg}`,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })

      return {
        runId,
        status: 'failed',
        outcomesAnalyzed: 0,
        patternsDetected: [],
        improvementsProposed: 0,
        executiveSummary: `Analysis failed: ${errorMsg}`,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: errorMsg,
      }
    }
  }

  // ----------------------------------------------------------
  // Call Claude (Sonnet) for pattern analysis
  // ----------------------------------------------------------

  private async callClaudeForAnalysis(
    outcomes: unknown[],
    scorecards: unknown[],
    campaignPerf: unknown[],
    model: string
  ): Promise<{
    patterns: PatternDetected[]
    proposals: ImprovementProposal[]
    summary: string
    inputTokens: number
    outputTokens: number
  }> {
    const systemPrompt = `Eres el Meta-Agente de Zero Risk, una agencia de marketing agéntica.
Tu rol es analizar el desempeño de los agentes del pipeline de campañas y detectar patrones de calidad.

REGLAS CRÍTICAS:
- NUNCA propongas cambios que se apliquen directamente. Todo pasa por HITL (aprobación humana).
- Sé específico con evidencia: cita IDs de outcomes y números concretos.
- Prioriza insights accionables sobre observaciones genéricas.
- Un pattern debe tener al menos 2 evidencias para ser reportado.
- Las proposals deben incluir el valor actual y el valor propuesto cuando aplique.

Tu output debe ser JSON válido con esta estructura exacta:
{
  "patterns": [
    {
      "pattern_id": "P001",
      "agent_name": "nombre-del-agente",
      "pattern_type": "rejection_pattern|quality_decline|performance_trend|cost_anomaly|improvement_opportunity",
      "description": "Descripción clara del patrón detectado",
      "confidence": 0.85,
      "evidence_count": 3,
      "evidence_ids": ["uuid1", "uuid2", "uuid3"]
    }
  ],
  "proposals": [
    {
      "agent_name": "nombre-del-agente",
      "proposal_type": "identity_update|skill_adjustment|model_change|workflow_change|parameter_tuning|retirement",
      "title": "Título corto de la mejora propuesta",
      "rationale": "Por qué se propone este cambio (con datos)",
      "current_value": "Valor o comportamiento actual (si aplica)",
      "proposed_value": "Valor o comportamiento propuesto",
      "expected_impact": "Impacto esperado (cuantificado si posible)",
      "pattern_id": "P001",
      "supporting_outcomes": ["uuid1", "uuid2"],
      "confidence_score": 0.80,
      "priority": "low|medium|high|critical"
    }
  ],
  "executive_summary": "Resumen ejecutivo en 2-3 oraciones para Emilio. Incluye: patterns detectados, mejoras propuestas, tendencia general."
}

Responde SOLO con el JSON, sin texto adicional.`

    const userMessage = `## Datos para análisis semanal

### Agent Outcomes (${outcomes.length} resultados recientes):
${JSON.stringify(outcomes, null, 2).substring(0, 30000)}

### Agent Scorecards (resumen de rendimiento):
${JSON.stringify(scorecards, null, 2).substring(0, 5000)}

### Campaign Performance (resultados post-publicación):
${JSON.stringify(campaignPerf, null, 2).substring(0, 5000)}

Analiza estos datos y genera tu reporte JSON con patterns y proposals.
Si no hay suficientes datos para detectar patterns significativos, devuelve arrays vacíos y explícalo en el executive_summary.`

    // Call Claude API directly
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 500)}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || '{}'
    const inputTokens = data.usage?.input_tokens || 0
    const outputTokens = data.usage?.output_tokens || 0

    // Parse the JSON response
    let parsed: {
      patterns?: PatternDetected[]
      proposals?: ImprovementProposal[]
      executive_summary?: string
    }

    try {
      // Handle potential markdown code blocks around JSON
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[MetaAgent] Failed to parse Claude response as JSON:', content.substring(0, 500))
      parsed = {
        patterns: [],
        proposals: [],
        executive_summary: 'Meta-agent analysis completed but response parsing failed. Raw output saved for review.',
      }
    }

    return {
      patterns: parsed.patterns || [],
      proposals: parsed.proposals || [],
      summary: parsed.executive_summary || 'No summary generated.',
      inputTokens,
      outputTokens,
    }
  }

  // ----------------------------------------------------------
  // Store an improvement proposal in the database
  // ----------------------------------------------------------

  private async storeProposal(runId: string, proposal: ImprovementProposal): Promise<void> {
    // Try to find the agent's UUID from agents table
    const { data: agent } = await this.supabase
      .from('agents')
      .select('id')
      .eq('name', proposal.agent_name)
      .single()

    await this.supabase
      .from('agent_improvement_proposals')
      .insert({
        meta_agent_run_id: runId,
        agent_name: proposal.agent_name,
        agent_id: agent?.id || null,
        proposal_type: proposal.proposal_type,
        title: proposal.title,
        rationale: proposal.rationale,
        current_value: proposal.current_value || null,
        proposed_value: proposal.proposed_value || null,
        expected_impact: proposal.expected_impact,
        pattern_id: proposal.pattern_id,
        supporting_outcomes: proposal.supporting_outcomes,
        confidence_score: proposal.confidence_score,
        priority: proposal.priority,
        status: 'pending', // ALWAYS pending — requires HITL
      })
  }

  // ----------------------------------------------------------
  // Notify Mission Control about analysis results
  // ----------------------------------------------------------

  private async notifyMissionControl(
    runId: string,
    patternsCount: number,
    proposalsCount: number,
    summary: string
  ): Promise<void> {
    try {
      const mcBaseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:3001'
      const mcApiKey = process.env.MC_API_TOKEN || ''

      // Send inbox message with summary
      await fetch(`${mcBaseUrl}/api/inbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mcApiKey,
        },
        body: JSON.stringify({
          from: 'Meta-Agent (Pilar 5)',
          to: 'Emilio',
          type: 'report',
          subject: `Análisis Semanal: ${patternsCount} patterns, ${proposalsCount} mejoras propuestas`,
          body: [
            `## Reporte del Meta-Agente`,
            `**Run ID:** ${runId}`,
            `**Patterns detectados:** ${patternsCount}`,
            `**Mejoras propuestas:** ${proposalsCount}`,
            '',
            `### Resumen Ejecutivo`,
            summary,
            '',
            proposalsCount > 0
              ? `⚠️ Hay ${proposalsCount} propuestas de mejora pendientes de tu aprobación. Revísalas en /api/analytics/proposals`
              : '✅ No se requieren acciones en este momento.',
          ].join('\n'),
        }),
      })

      // If there are proposals, create a task in MC
      if (proposalsCount > 0) {
        await fetch(`${mcBaseUrl}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': mcApiKey,
          },
          body: JSON.stringify({
            title: `Revisar ${proposalsCount} mejoras de agentes (Meta-Agent)`,
            importance: proposalsCount >= 3 ? 3 : 2,
            urgency: 2,
            description: `El Meta-Agente detectó ${patternsCount} patterns y propone ${proposalsCount} mejoras. Requiere tu aprobación.`,
            kanban: 'Bandeja de entrada',
            tags: ['zero-risk', 'meta-agent', 'pilar-5', 'hitl'],
          }),
        })
      }
    } catch (err) {
      console.warn('[MetaAgent] Failed to notify Mission Control (non-blocking):', err)
    }
  }

  // ----------------------------------------------------------
  // Apply an approved proposal (only after HITL approval)
  // ----------------------------------------------------------

  async applyApprovedProposal(proposalId: string): Promise<boolean> {
    // Verify the proposal is approved
    const { data: proposal, error } = await this.supabase
      .from('agent_improvement_proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('status', 'approved')
      .single()

    if (error || !proposal) {
      console.error('[MetaAgent] Proposal not found or not approved:', proposalId)
      return false
    }

    // Apply based on proposal type
    switch (proposal.proposal_type) {
      case 'identity_update': {
        // Update agent identity_content in Supabase
        if (proposal.agent_id && proposal.proposed_value) {
          const { error: updateError } = await this.supabase
            .from('agents')
            .update({ identity_content: proposal.proposed_value })
            .eq('id', proposal.agent_id)

          if (updateError) {
            console.error('[MetaAgent] Failed to update agent identity:', updateError.message)
            return false
          }
        }
        break
      }

      case 'model_change': {
        if (proposal.agent_id && proposal.proposed_value) {
          const { error: updateError } = await this.supabase
            .from('agents')
            .update({ model: proposal.proposed_value })
            .eq('id', proposal.agent_id)

          if (updateError) {
            console.error('[MetaAgent] Failed to update agent model:', updateError.message)
            return false
          }
        }
        break
      }

      // Other proposal types are informational — applied manually
      case 'skill_adjustment':
      case 'workflow_change':
      case 'parameter_tuning':
      case 'retirement':
        // These require manual implementation
        // Just mark as applied for tracking
        break

      default:
        console.warn('[MetaAgent] Unknown proposal type:', proposal.proposal_type)
    }

    // Mark proposal as applied
    await this.supabase
      .from('agent_improvement_proposals')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    return true
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private async updateRun(runId: string, updates: Record<string, unknown>): Promise<void> {
    await this.supabase
      .from('meta_agent_runs')
      .update(updates)
      .eq('id', runId)
  }

  /**
   * Get history of meta-agent runs
   */
  async getRunHistory(limit: number = 10) {
    const { data, error } = await this.supabase
      .from('meta_agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[MetaAgent] Failed to get run history:', error.message)
      return []
    }

    return data || []
  }

  /**
   * Get details of a specific run including its proposals
   */
  async getRunDetails(runId: string) {
    const [
      { data: run },
      { data: proposals },
    ] = await Promise.all([
      this.supabase
        .from('meta_agent_runs')
        .select('*')
        .eq('id', runId)
        .single(),
      this.supabase
        .from('agent_improvement_proposals')
        .select('*')
        .eq('meta_agent_run_id', runId)
        .order('priority'),
    ])

    return { run, proposals: proposals || [] }
  }
}
