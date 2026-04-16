/**
 * ZERO RISK V3 — Feedback Collector (Pilar 5)
 *
 * Captures agent outcomes after each pipeline step completes.
 * Records performance data for the meta-agent's weekly analysis.
 *
 * Lifecycle:
 *   Pipeline step completes → FeedbackCollector.recordOutcome()
 *   HITL resolves → FeedbackCollector.recordHITLVerdict()
 *   Optimization Agent runs → FeedbackCollector.recordCampaignResults()
 *
 * The collector is PASSIVE — it only records data.
 * The meta-agent (meta-agent.ts) reads this data for weekly analysis.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { StepResult } from './pipeline-orchestrator'

// ============================================================
// Types
// ============================================================

export interface OutcomeRecord {
  clientId: string
  pipelineId: string
  stepIndex: number
  stepName: string
  agentName: string
  taskType: string
  taskInput?: string         // Truncated input sent to agent
  outputSummary?: string     // Truncated output
  outputId?: string          // Reference to client_historical_outputs
  finalVerdict: 'approved' | 'rejected' | 'edited' | 'escalated'
  humanFeedback?: string
  editedDelta?: string
  performanceMetrics?: Record<string, unknown>  // CTR, engagement, etc.
  costUsd: number
  durationMs: number
  tokensUsed: number
}

export interface CampaignResultRecord {
  clientId: string
  pipelineId: string
  outputId?: string
  contentType: string
  channel: string
  publishedUrl?: string
  publishedAt?: string
  // Core metrics
  impressions?: number
  clicks?: number
  ctr?: number
  conversions?: number
  conversionRate?: number
  costPerClick?: number
  costPerConversion?: number
  adSpend?: number
  // Engagement
  likes?: number
  shares?: number
  comments?: number
  saves?: number
  engagementRate?: number
  // Email-specific
  openRate?: number
  bounceRate?: number
  unsubscribeRate?: number
  // Revenue
  revenueAttributed?: number
  roas?: number
  // Raw data
  rawMetrics?: Record<string, unknown>
  optimizationNotes?: string
  performanceGrade?: 'A' | 'B' | 'C' | 'D' | 'F'
  collectionSource?: string
}

export interface AgentScorecard {
  agent_name: string
  total_outcomes: number
  approved_count: number
  rejected_count: number
  edited_count: number
  escalated_count: number
  approval_rate: number
  avg_cost_usd: number
  avg_duration_ms: number
  total_tokens: number
  total_cost: number
}

// ============================================================
// Feedback Collector Class
// ============================================================

export class FeedbackCollector {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ----------------------------------------------------------
  // Record an agent outcome after a pipeline step
  // Called by pipeline-orchestrator after step completion
  // ----------------------------------------------------------

  async recordOutcome(outcome: OutcomeRecord): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('agent_outcomes')
        .insert({
          client_id: outcome.clientId,
          pipeline_id: outcome.pipelineId,
          step_index: outcome.stepIndex,
          step_name: outcome.stepName,
          agent_name: outcome.agentName,
          task_type: outcome.taskType,
          task_input: outcome.taskInput?.substring(0, 5000) || null,
          output_summary: outcome.outputSummary?.substring(0, 5000) || null,
          output_id: outcome.outputId || null,
          final_verdict: outcome.finalVerdict,
          human_feedback: outcome.humanFeedback || null,
          edited_delta: outcome.editedDelta || null,
          performance_metrics: outcome.performanceMetrics || {},
          cost_usd: outcome.costUsd,
          duration_ms: outcome.durationMs,
          tokens_used: outcome.tokensUsed,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[FeedbackCollector] Failed to record outcome:', error.message)
        return null
      }

      return data?.id || null
    } catch (err) {
      console.error('[FeedbackCollector] Error recording outcome:', err)
      return null
    }
  }

  // ----------------------------------------------------------
  // Record an outcome from a step that was initially "completed"
  // but hasn't been HITL-reviewed yet — verdict defaults to "approved"
  // Called automatically for non-HITL steps
  // ----------------------------------------------------------

  async recordStepOutcome(
    pipelineId: string,
    stepIndex: number,
    stepName: string,
    agentName: string,
    result: StepResult,
    clientId: string
  ): Promise<string | null> {
    return this.recordOutcome({
      clientId,
      pipelineId,
      stepIndex,
      stepName,
      agentName,
      taskType: stepName,
      taskInput: undefined, // Input is in pipeline_steps already
      outputSummary: result.outputText.substring(0, 2000),
      finalVerdict: result.success ? 'approved' : 'rejected',
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      tokensUsed: result.inputTokens + result.outputTokens,
    })
  }

  // ----------------------------------------------------------
  // Update an existing outcome with HITL verdict
  // Called when Emilio approves/rejects/edits in Mission Control
  // ----------------------------------------------------------

  async recordHITLVerdict(
    pipelineId: string,
    stepIndex: number,
    verdict: 'approved' | 'rejected' | 'edited',
    feedback?: string,
    editedDelta?: string
  ): Promise<boolean> {
    try {
      // Find the outcome for this pipeline step
      const { data: existing } = await this.supabase
        .from('agent_outcomes')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('step_index', stepIndex)
        .single()

      if (existing) {
        // Update existing outcome with HITL decision
        const { error } = await this.supabase
          .from('agent_outcomes')
          .update({
            final_verdict: verdict,
            human_feedback: feedback || null,
            edited_delta: editedDelta || null,
          })
          .eq('id', existing.id)

        if (error) {
          console.error('[FeedbackCollector] Failed to update HITL verdict:', error.message)
          return false
        }
        return true
      }

      // No existing outcome — create one (shouldn't happen normally)
      console.warn('[FeedbackCollector] No existing outcome for HITL verdict, creating new record')
      const { data: pipeline } = await this.supabase
        .from('pipeline_executions')
        .select('client_id')
        .eq('id', pipelineId)
        .single()

      const { data: step } = await this.supabase
        .from('pipeline_steps')
        .select('step_name, agent_name, cost_usd, duration_ms, input_tokens, output_tokens')
        .eq('pipeline_id', pipelineId)
        .eq('step_index', stepIndex)
        .single()

      await this.recordOutcome({
        clientId: pipeline?.client_id || '',
        pipelineId,
        stepIndex,
        stepName: step?.step_name || `step_${stepIndex}`,
        agentName: step?.agent_name || 'unknown',
        taskType: step?.step_name || 'hitl_review',
        finalVerdict: verdict,
        humanFeedback: feedback,
        editedDelta,
        costUsd: step?.cost_usd || 0,
        durationMs: step?.duration_ms || 0,
        tokensUsed: (step?.input_tokens || 0) + (step?.output_tokens || 0),
      })

      return true
    } catch (err) {
      console.error('[FeedbackCollector] Error recording HITL verdict:', err)
      return false
    }
  }

  // ----------------------------------------------------------
  // Record post-publication campaign performance results
  // Called by Optimization Agent (step 7) after 48h delay
  // ----------------------------------------------------------

  async recordCampaignResults(results: CampaignResultRecord): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('campaign_results')
        .insert({
          client_id: results.clientId,
          pipeline_id: results.pipelineId,
          output_id: results.outputId || null,
          content_type: results.contentType,
          channel: results.channel,
          published_url: results.publishedUrl || null,
          published_at: results.publishedAt || null,
          impressions: results.impressions || 0,
          clicks: results.clicks || 0,
          ctr: results.ctr || 0,
          conversions: results.conversions || 0,
          conversion_rate: results.conversionRate || 0,
          cost_per_click: results.costPerClick || null,
          cost_per_conversion: results.costPerConversion || null,
          ad_spend: results.adSpend || 0,
          likes: results.likes || 0,
          shares: results.shares || 0,
          comments: results.comments || 0,
          saves: results.saves || 0,
          engagement_rate: results.engagementRate || 0,
          open_rate: results.openRate || null,
          bounce_rate: results.bounceRate || null,
          unsubscribe_rate: results.unsubscribeRate || null,
          revenue_attributed: results.revenueAttributed || 0,
          roas: results.roas || null,
          raw_metrics: results.rawMetrics || {},
          optimization_notes: results.optimizationNotes || null,
          performance_grade: results.performanceGrade || null,
          collection_source: results.collectionSource || null,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[FeedbackCollector] Failed to record campaign results:', error.message)
        return null
      }

      // Also update the corresponding agent_outcomes with performance metrics
      if (results.pipelineId) {
        const perfMetrics = {
          impressions: results.impressions,
          clicks: results.clicks,
          ctr: results.ctr,
          conversions: results.conversions,
          engagement_rate: results.engagementRate,
          revenue: results.revenueAttributed,
          roas: results.roas,
          grade: results.performanceGrade,
        }

        // Update all outcomes for this pipeline with performance data
        await this.supabase
          .from('agent_outcomes')
          .update({ performance_metrics: perfMetrics })
          .eq('pipeline_id', results.pipelineId)
      }

      return data?.id || null
    } catch (err) {
      console.error('[FeedbackCollector] Error recording campaign results:', err)
      return null
    }
  }

  // ----------------------------------------------------------
  // Queries for dashboards and meta-agent
  // ----------------------------------------------------------

  /**
   * Get agent scorecards — performance summary per agent
   */
  async getAgentScorecards(
    agentName?: string,
    sinceDays: number = 30
  ): Promise<AgentScorecard[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString()

    const { data, error } = await this.supabase.rpc('get_agent_performance', {
      p_agent_name: agentName || null,
      p_since: since,
    })

    if (error) {
      console.error('[FeedbackCollector] Failed to get agent scorecards:', error.message)
      return []
    }

    return (data || []) as AgentScorecard[]
  }

  /**
   * Get unprocessed outcomes for meta-agent analysis
   */
  async getUnprocessedOutcomes(limit: number = 100, sinceDays: number = 7) {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString()

    const { data, error } = await this.supabase.rpc('get_unprocessed_outcomes', {
      p_limit: limit,
      p_since: since,
    })

    if (error) {
      console.error('[FeedbackCollector] Failed to get unprocessed outcomes:', error.message)
      return []
    }

    return data || []
  }

  /**
   * Get campaign performance summary
   */
  async getCampaignPerformance(clientId?: string, sinceDays: number = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString()

    const { data, error } = await this.supabase.rpc('get_campaign_performance_summary', {
      p_client_id: clientId || null,
      p_since: since,
    })

    if (error) {
      console.error('[FeedbackCollector] Failed to get campaign performance:', error.message)
      return []
    }

    return data || []
  }

  /**
   * Mark outcomes as processed by meta-agent
   */
  async markOutcomesProcessed(outcomeIds: string[], metaAgentRunId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('mark_outcomes_processed', {
      p_outcome_ids: outcomeIds,
      p_meta_agent_run_id: metaAgentRunId,
    })

    if (error) {
      console.error('[FeedbackCollector] Failed to mark outcomes processed:', error.message)
      return 0
    }

    return data || 0
  }

  /**
   * Get recent outcomes for a specific pipeline (for debugging/review)
   */
  async getPipelineOutcomes(pipelineId: string) {
    const { data, error } = await this.supabase
      .from('agent_outcomes')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('step_index')

    if (error) {
      console.error('[FeedbackCollector] Failed to get pipeline outcomes:', error.message)
      return []
    }

    return data || []
  }

  /**
   * Get pending improvement proposals (for MC inbox)
   */
  async getPendingProposals() {
    const { data, error } = await this.supabase
      .from('agent_improvement_proposals')
      .select(`
        *,
        meta_agent_runs (
          executive_summary,
          outcomes_analyzed,
          completed_at
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[FeedbackCollector] Failed to get pending proposals:', error.message)
      return []
    }

    return data || []
  }

  /**
   * Resolve an improvement proposal (HITL decision by Emilio)
   */
  async resolveProposal(
    proposalId: string,
    decision: 'approved' | 'rejected' | 'deferred',
    reviewNotes?: string
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('agent_improvement_proposals')
      .update({
        status: decision,
        reviewed_by: 'emilio',
        review_notes: reviewNotes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    if (error) {
      console.error('[FeedbackCollector] Failed to resolve proposal:', error.message)
      return false
    }

    return true
  }
}
