/**
 * ZERO RISK V3 — Pipeline Orchestrator
 * Pilar 3: Core logic for the 9-step campaign pipeline
 *
 * Architecture:
 * - Each step runs a Claude Managed Agent (via /api/agents/run)
 * - Steps chain outputs forward (step N's output becomes step N+1's input context)
 * - HITL steps pause the pipeline and persist state to Supabase
 * - n8n steps trigger mechanical workflows via webhook
 * - Client Brain RAG is injected at every agent step
 *
 * This module is called by /api/pipeline/run and /api/hitl/resolve/[id]
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { MissionControlBridge } from './mc-bridge'
import { FeedbackCollector } from './feedback-collector'

// ============================================================
// Types
// ============================================================

export interface PipelineConfig {
  clientId: string
  objective: string
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'n8n'
  triggerSource?: string
  createdBy?: string
  templateName?: string
  // Optional overrides
  skipSteps?: number[]     // step indexes to skip
  startFromStep?: number   // resume from specific step
}

export interface StepDefinition {
  index: number
  name: string
  display_name: string
  agent: string | null
  description: string
  hitl_required: boolean
  depends_on: number[]
  timeout_minutes: number | null
  is_parallel?: boolean
  sub_agents?: string[]
  is_n8n?: boolean
  n8n_workflow?: string
  delay_hours?: number
}

export interface StepResult {
  success: boolean
  outputText: string
  outputData: Record<string, unknown>
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  error?: string
}

export interface PipelineState {
  pipelineId: string
  status: string
  currentStepIndex: number
  steps: StepDefinition[]
  chainOutputs: Record<number, string>  // stepIndex → output text
}

// ============================================================
// Cost calculation (Sonnet pricing)
// ============================================================

const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000   // $3 per 1M input tokens (Sonnet)
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000  // $15 per 1M output tokens (Sonnet)

function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN)
}

// ============================================================
// Pipeline Orchestrator Class
// ============================================================

export class PipelineOrchestrator {
  private supabase: SupabaseClient
  private baseUrl: string
  private mc: MissionControlBridge
  private feedback: FeedbackCollector

  constructor(supabase: SupabaseClient, baseUrl: string) {
    this.supabase = supabase
    this.baseUrl = baseUrl
    this.mc = new MissionControlBridge({ zrBaseUrl: baseUrl })
    this.feedback = new FeedbackCollector(supabase)
  }

  // ----------------------------------------------------------
  // CREATE: Initialize a new pipeline execution
  // ----------------------------------------------------------

  async createPipeline(config: PipelineConfig): Promise<string> {
    const templateName = config.templateName || 'campaign_full_9step'

    // Get template from database function
    const { data: templateData, error: templateError } = await this.supabase
      .rpc('get_pipeline_template', { template_name: templateName })

    if (templateError || !templateData) {
      throw new Error(`Failed to load pipeline template "${templateName}": ${templateError?.message}`)
    }

    const steps: StepDefinition[] = templateData as StepDefinition[]

    // Create pipeline execution record
    const { data: pipeline, error: pipelineError } = await this.supabase
      .from('pipeline_executions')
      .insert({
        client_id: config.clientId,
        trigger_type: config.triggerType,
        trigger_source: config.triggerSource || null,
        objective: config.objective,
        pipeline_template: templateName,
        steps_config: steps,
        status: 'pending',
        current_step_index: config.startFromStep || 0,
        created_by: config.createdBy || 'system',
      })
      .select('id')
      .single()

    if (pipelineError || !pipeline) {
      throw new Error(`Failed to create pipeline: ${pipelineError?.message}`)
    }

    // Create step records
    const stepRecords = steps.map((step) => ({
      pipeline_id: pipeline.id,
      step_index: step.index,
      step_name: step.name,
      step_display_name: step.display_name,
      agent_name: step.agent,
      status: config.skipSteps?.includes(step.index) ? 'skipped' : 'pending',
      hitl_required: step.hitl_required,
    }))

    const { error: stepsError } = await this.supabase
      .from('pipeline_steps')
      .insert(stepRecords)

    if (stepsError) {
      throw new Error(`Failed to create pipeline steps: ${stepsError.message}`)
    }

    // Notify Mission Control about new pipeline
    const { data: client } = await this.supabase
      .from('clients')
      .select('name')
      .eq('id', config.clientId)
      .single()

    this.mc.onPipelineCreated(
      pipeline.id,
      client?.name || config.clientId,
      config.objective,
      steps.map(s => ({
        index: s.index,
        name: s.name,
        display_name: s.display_name,
        agent: s.agent,
        hitl_required: s.hitl_required,
      }))
    ).catch(err => console.warn('[Pipeline] MC notification failed (non-blocking):', err))

    return pipeline.id
  }

  // ----------------------------------------------------------
  // EXECUTE: Run pipeline from current step forward
  // ----------------------------------------------------------

  async executePipeline(pipelineId: string): Promise<void> {
    // Load pipeline state
    const state = await this.loadPipelineState(pipelineId)

    if (state.status === 'completed' || state.status === 'cancelled') {
      throw new Error(`Pipeline ${pipelineId} is already ${state.status}`)
    }

    // Mark as running
    await this.updatePipelineStatus(pipelineId, 'running')

    // Build chain of previous outputs (for resumed pipelines)
    const chainOutputs = { ...state.chainOutputs }

    // Execute steps sequentially from current index
    for (let i = state.currentStepIndex; i < state.steps.length; i++) {
      const stepDef = state.steps[i]

      // Check if step should be skipped
      const stepRecord = await this.getStepRecord(pipelineId, i)
      if (stepRecord?.status === 'skipped') {
        continue
      }

      // Check for delay (e.g. optimization step waits 48h)
      if (stepDef.delay_hours && stepDef.delay_hours > 0) {
        // In production: schedule a delayed trigger via n8n or cron
        // For now: mark as pending with metadata
        await this.updateStep(pipelineId, i, {
          status: 'pending',
          input_context: { delay_hours: stepDef.delay_hours, scheduled_for: new Date(Date.now() + stepDef.delay_hours * 3600 * 1000).toISOString() },
        })
        await this.updatePipelineStatus(pipelineId, 'paused_hitl', i) // reuse paused state
        return // Exit — n8n cron will resume this pipeline later
      }

      // Update current step
      await this.supabase
        .from('pipeline_executions')
        .update({ current_step_index: i })
        .eq('id', pipelineId)

      // Execute the step
      let result: StepResult

      if (stepDef.hitl_required && !stepDef.agent) {
        // Pure HITL step — pause pipeline
        await this.pauseForHITL(pipelineId, i, chainOutputs)
        return // Pipeline paused — will resume via /api/hitl/resolve
      } else if (stepDef.is_n8n) {
        // Mechanical step — trigger n8n workflow
        result = await this.executeN8nStep(stepDef, chainOutputs, pipelineId)
      } else if (stepDef.is_parallel && stepDef.sub_agents) {
        // Parallel agent execution (content creation)
        result = await this.executeParallelAgents(stepDef, chainOutputs, pipelineId)
      } else if (stepDef.agent) {
        // Single agent execution
        result = await this.executeAgentStep(stepDef, chainOutputs, pipelineId)
      } else {
        // No agent, no n8n, not HITL — skip
        await this.updateStep(pipelineId, i, { status: 'skipped' })
        continue
      }

      // Record step result
      await this.recordStepResult(pipelineId, i, result)

      if (!result.success) {
        // Notify MC about failure
        this.mc.onStepFailed(pipelineId, i, stepDef.display_name, result.error || 'Unknown error')
          .catch(err => console.warn('[Pipeline] MC step-failed notification failed:', err))

        // Step failed — check retries
        const canRetry = await this.handleStepFailure(pipelineId, i, result)
        if (!canRetry) {
          await this.updatePipelineStatus(pipelineId, 'failed', i)
          return
        }
        // Retry: decrement i to re-execute this step
        i--
        continue
      }

      // Store output in chain
      chainOutputs[i] = result.outputText

      // Update pipeline token totals
      await this.updatePipelineCosts(pipelineId, result)

      // Notify MC about completion
      this.mc.onStepCompleted(pipelineId, i, stepDef.display_name, {
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }).catch(err => console.warn('[Pipeline] MC step-complete notification failed:', err))

      // Record outcome in feedback loop (Pilar 5)
      // Non-HITL steps get auto-approved; HITL steps get updated later via recordHITLVerdict
      if (stepDef.agent && result.success) {
        const clientId = (await this.supabase
          .from('pipeline_executions')
          .select('client_id')
          .eq('id', pipelineId)
          .single()).data?.client_id || ''

        this.feedback.recordStepOutcome(
          pipelineId, i, stepDef.name, stepDef.agent, result, clientId
        ).catch(err => console.warn('[Pipeline] Feedback recording failed (non-blocking):', err))
      }

      // Check if this step has HITL required (agent + HITL, like reporting)
      if (stepDef.hitl_required && stepDef.agent) {
        await this.pauseForHITL(pipelineId, i, chainOutputs)
        return
      }
    }

    // All steps completed
    await this.updatePipelineStatus(pipelineId, 'completed')

    // Notify MC about pipeline completion
    const { data: finalPipeline } = await this.supabase
      .from('pipeline_executions')
      .select('total_cost_usd, started_at, completed_at')
      .eq('id', pipelineId)
      .single()
    const totalDuration = finalPipeline?.started_at && finalPipeline?.completed_at
      ? new Date(finalPipeline.completed_at).getTime() - new Date(finalPipeline.started_at).getTime()
      : 0
    this.mc.onPipelineCompleted(
      pipelineId,
      finalPipeline?.total_cost_usd || 0,
      state.steps.length,
      totalDuration
    ).catch(err => console.warn('[Pipeline] MC pipeline-complete notification failed:', err))
  }

  // ----------------------------------------------------------
  // AGENT STEP: Execute a single agent via /api/agents/run
  // ----------------------------------------------------------

  private async executeAgentStep(
    stepDef: StepDefinition,
    chainOutputs: Record<number, string>,
    pipelineId: string
  ): Promise<StepResult> {
    const startTime = Date.now()

    try {
      // Mark step as running
      await this.updateStep(pipelineId, stepDef.index, { status: 'running', started_at: new Date().toISOString() })

      // Notify Mission Control
      this.mc.onStepStarted(pipelineId, stepDef.index, stepDef.display_name)
        .catch(err => console.warn('[Pipeline] MC step-start notification failed:', err))

      // Build chain context from previous steps
      const chain = Object.entries(chainOutputs).map(([idx, output]) => ({
        agent: `step_${idx}`,
        output: output.substring(0, 3000), // Truncate to manage tokens
      }))

      // Get client_id for Client Brain context
      const { data: pipeline } = await this.supabase
        .from('pipeline_executions')
        .select('client_id, objective')
        .eq('id', pipelineId)
        .single()

      // Build the task with pipeline context
      const taskParts = [
        `## Objetivo de la campaña:\n${pipeline?.objective || 'No objective specified'}`,
        `\n## Tu paso en el pipeline: ${stepDef.display_name}`,
        `\n## Instrucciones: ${stepDef.description}`,
      ]

      // Add relevant previous outputs
      if (chain.length > 0) {
        taskParts.push(`\n## Outputs de pasos anteriores:`)
        for (const c of chain.slice(-3)) { // Last 3 steps to manage context
          taskParts.push(`\n### ${c.agent}:\n${c.output}`)
        }
      }

      const task = taskParts.join('\n')

      // Build a targeted RAG query based on step purpose + objective
      const ragQuery = `${pipeline?.objective || ''} — ${stepDef.description || stepDef.display_name}`

      // Call /api/agents/run
      const response = await fetch(`${this.baseUrl}/api/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: stepDef.agent,
          task,
          context: {
            chain,
            client_id: pipeline?.client_id,
            rag_query: ragQuery,           // targeted RAG search per step
            rag_match_count: 5,
            pipeline_id: pipelineId,
            step_name: stepDef.name,
          },
          caller: 'pipeline',
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        return {
          success: false,
          outputText: '',
          outputData: data,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: Date.now() - startTime,
          error: data.error || `Agent ${stepDef.agent} returned error`,
        }
      }

      const inputTokens = data.input_tokens || 0
      const outputTokens = data.output_tokens || 0

      return {
        success: true,
        outputText: data.response || '',
        outputData: {
          agent: data.agent,
          model: data.model,
          skills_loaded: data.skills_loaded,
        },
        inputTokens,
        outputTokens,
        costUsd: calculateCost(inputTokens, outputTokens),
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        outputText: '',
        outputData: {},
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // ----------------------------------------------------------
  // PARALLEL AGENTS: Execute multiple agents concurrently
  // ----------------------------------------------------------

  private async executeParallelAgents(
    stepDef: StepDefinition,
    chainOutputs: Record<number, string>,
    pipelineId: string
  ): Promise<StepResult> {
    const startTime = Date.now()
    const subAgents = stepDef.sub_agents || []

    await this.updateStep(pipelineId, stepDef.index, { status: 'running', started_at: new Date().toISOString() })

    // Get the Jefe Marketing's decomposition (step 2 output)
    const jefeOutput = chainOutputs[2] || ''

    // Get pipeline info
    const { data: pipeline } = await this.supabase
      .from('pipeline_executions')
      .select('client_id, objective')
      .eq('id', pipelineId)
      .single()

    // Parse subtasks from Jefe's output (best-effort)
    // In production, Jefe Marketing would return structured JSON
    // For now, each sub-agent gets the full context and self-selects relevant work
    const agentPromises = subAgents.map(async (agentName) => {
      try {
        const task = [
          `## Objetivo de la campaña:\n${pipeline?.objective}`,
          `\n## Brief de campaña (Campaign Brief Agent):\n${(chainOutputs[1] || '').substring(0, 2000)}`,
          `\n## Subtasks asignados por Jefe de Marketing:\n${jefeOutput.substring(0, 2000)}`,
          `\n## Tu rol: Ejecuta SOLO las subtasks que correspondan a tu especialidad como ${agentName}.`,
          `\nSi ninguna subtask es para ti, responde "NO_TASKS_FOR_ME" y nada más.`,
        ].join('\n')

        const ragQuery = `${pipeline?.objective || ''} — content creation by ${agentName}`

        const response = await fetch(`${this.baseUrl}/api/agents/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: agentName,
            task,
            context: {
              client_id: pipeline?.client_id,
              rag_query: ragQuery,
              rag_match_count: 3,  // fewer results for parallel agents to save tokens
              pipeline_id: pipelineId,
              step_name: stepDef.name,
            },
            caller: 'pipeline',
          }),
        })

        const data = await response.json()
        return {
          agent: agentName,
          success: response.ok && data.success,
          output: data.response || '',
          inputTokens: data.input_tokens || 0,
          outputTokens: data.output_tokens || 0,
        }
      } catch (error) {
        return {
          agent: agentName,
          success: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          inputTokens: 0,
          outputTokens: 0,
        }
      }
    })

    const results = await Promise.all(agentPromises)

    // Combine outputs (skip NO_TASKS_FOR_ME responses)
    const activeResults = results.filter(r => r.success && !r.output.includes('NO_TASKS_FOR_ME'))
    const combinedOutput = activeResults
      .map(r => `## ${r.agent}:\n${r.output}`)
      .join('\n\n---\n\n')

    const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0)
    const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0)

    return {
      success: activeResults.length > 0,
      outputText: combinedOutput,
      outputData: {
        agents_executed: results.map(r => r.agent),
        agents_active: activeResults.map(r => r.agent),
        agents_skipped: results.filter(r => r.output.includes('NO_TASKS_FOR_ME')).map(r => r.agent),
        agents_failed: results.filter(r => !r.success).map(r => r.agent),
      },
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: calculateCost(totalInputTokens, totalOutputTokens),
      durationMs: Date.now() - startTime,
    }
  }

  // ----------------------------------------------------------
  // N8N STEP: Trigger mechanical workflow via webhook
  // ----------------------------------------------------------

  private async executeN8nStep(
    stepDef: StepDefinition,
    chainOutputs: Record<number, string>,
    pipelineId: string
  ): Promise<StepResult> {
    const startTime = Date.now()
    await this.updateStep(pipelineId, stepDef.index, { status: 'running', started_at: new Date().toISOString() })

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL
    if (!n8nWebhookUrl) {
      return {
        success: false,
        outputText: '',
        outputData: {},
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: 'N8N_WEBHOOK_URL not configured',
      }
    }

    try {
      // Get pipeline info
      const { data: pipeline } = await this.supabase
        .from('pipeline_executions')
        .select('client_id, objective')
        .eq('id', pipelineId)
        .single()

      // Get approved content from HITL step (step 5)
      const approvedContent = chainOutputs[5] || chainOutputs[4] || chainOutputs[3] || ''

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: stepDef.n8n_workflow || 'publish_content',
          pipeline_id: pipelineId,
          client_id: pipeline?.client_id,
          step_name: stepDef.name,
          content: approvedContent.substring(0, 10000),
          objective: pipeline?.objective,
        }),
      })

      const data = await response.json()

      return {
        success: response.ok,
        outputText: data.message || 'n8n workflow triggered',
        outputData: data,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        outputText: '',
        outputData: {},
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'n8n webhook failed',
      }
    }
  }

  // ----------------------------------------------------------
  // HITL: Pause pipeline for human review
  // ----------------------------------------------------------

  private async pauseForHITL(
    pipelineId: string,
    stepIndex: number,
    chainOutputs: Record<number, string>
  ): Promise<void> {
    // Get the last agent output for preview
    const latestOutput = chainOutputs[stepIndex] || chainOutputs[stepIndex - 1] || ''

    await this.updateStep(pipelineId, stepIndex, {
      status: 'paused_hitl',
      hitl_status: 'pending',
      output_text: latestOutput.substring(0, 10000),
      input_context: { chain_outputs_snapshot: chainOutputs },
    })

    await this.updatePipelineStatus(pipelineId, 'paused_hitl', stepIndex)

    // Get step ID for HITL resolve URL
    const stepRecord = await this.getStepRecord(pipelineId, stepIndex)

    // Notify Mission Control — HITL inbox message
    this.mc.onHITLPaused(
      pipelineId,
      stepIndex,
      `step-${stepIndex}`,
      latestOutput.substring(0, 1000),
      stepRecord?.id || ''
    ).catch(err => console.warn('[Pipeline] MC HITL notification failed:', err))
  }

  // ----------------------------------------------------------
  // RESUME: Continue pipeline after HITL approval
  // ----------------------------------------------------------

  async resumeAfterHITL(
    pipelineId: string,
    stepIndex: number,
    decision: 'approved' | 'rejected' | 'edited',
    feedback?: string,
    editedContent?: string
  ): Promise<void> {
    // Update the HITL step
    await this.updateStep(pipelineId, stepIndex, {
      hitl_status: decision,
      hitl_reviewer: 'emilio', // hardcoded for single-tenant
      hitl_feedback: feedback || null,
      hitl_resolved_at: new Date().toISOString(),
      status: decision === 'rejected' ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
    })

    // Record HITL verdict in feedback loop (Pilar 5)
    this.feedback.recordHITLVerdict(
      pipelineId, stepIndex, decision, feedback, editedContent
    ).catch(err => console.warn('[Pipeline] HITL feedback recording failed (non-blocking):', err))

    if (decision === 'rejected') {
      await this.updatePipelineStatus(pipelineId, 'failed', stepIndex)
      return
    }

    // Load chain outputs from snapshot
    const stepRecord = await this.getStepRecord(pipelineId, stepIndex)
    const chainOutputs: Record<number, string> = stepRecord?.input_context?.chain_outputs_snapshot || {}

    // If edited, replace the output
    if (decision === 'edited' && editedContent) {
      chainOutputs[stepIndex] = editedContent
    } else if (stepRecord?.output_text) {
      chainOutputs[stepIndex] = stepRecord.output_text
    }

    // Move to next step
    const nextStep = stepIndex + 1
    await this.supabase
      .from('pipeline_executions')
      .update({ current_step_index: nextStep, status: 'running' })
      .eq('id', pipelineId)

    // Continue execution from next step
    const state = await this.loadPipelineState(pipelineId)
    state.currentStepIndex = nextStep
    state.chainOutputs = chainOutputs

    await this.executePipeline(pipelineId)
  }

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------

  private async loadPipelineState(pipelineId: string): Promise<PipelineState> {
    const { data: pipeline, error } = await this.supabase
      .from('pipeline_executions')
      .select('*')
      .eq('id', pipelineId)
      .single()

    if (error || !pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`)
    }

    // Load completed step outputs for chain
    const { data: completedSteps } = await this.supabase
      .from('pipeline_steps')
      .select('step_index, output_text')
      .eq('pipeline_id', pipelineId)
      .eq('status', 'completed')
      .not('output_text', 'is', null)
      .order('step_index')

    const chainOutputs: Record<number, string> = {}
    if (completedSteps) {
      for (const step of completedSteps) {
        chainOutputs[step.step_index] = step.output_text
      }
    }

    return {
      pipelineId: pipeline.id,
      status: pipeline.status,
      currentStepIndex: pipeline.current_step_index,
      steps: pipeline.steps_config as StepDefinition[],
      chainOutputs,
    }
  }

  private async getStepRecord(pipelineId: string, stepIndex: number) {
    const { data } = await this.supabase
      .from('pipeline_steps')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .eq('step_index', stepIndex)
      .single()
    return data
  }

  private async updateStep(pipelineId: string, stepIndex: number, updates: Record<string, unknown>) {
    await this.supabase
      .from('pipeline_steps')
      .update(updates)
      .eq('pipeline_id', pipelineId)
      .eq('step_index', stepIndex)
  }

  private async updatePipelineStatus(pipelineId: string, status: string, stepIndex?: number) {
    const updates: Record<string, unknown> = { status }
    if (status === 'running' && !stepIndex) {
      updates.started_at = new Date().toISOString()
    }
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString()
    }
    if (status === 'paused_hitl') {
      updates.paused_at = new Date().toISOString()
    }
    if (stepIndex !== undefined) {
      updates.current_step_index = stepIndex
    }
    await this.supabase
      .from('pipeline_executions')
      .update(updates)
      .eq('id', pipelineId)
  }

  private async recordStepResult(pipelineId: string, stepIndex: number, result: StepResult) {
    await this.updateStep(pipelineId, stepIndex, {
      status: result.success ? 'completed' : 'failed',
      output_text: result.outputText.substring(0, 50000),
      output_result: result.outputData,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      completed_at: new Date().toISOString(),
      error_message: result.error || null,
    })
  }

  private async updatePipelineCosts(pipelineId: string, result: StepResult) {
    // Increment totals
    await this.supabase.rpc('increment_pipeline_costs', {
      p_pipeline_id: pipelineId,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
      p_cost_usd: result.costUsd,
    })
  }

  private async handleStepFailure(pipelineId: string, stepIndex: number, result: StepResult): Promise<boolean> {
    const stepRecord = await this.getStepRecord(pipelineId, stepIndex)
    if (!stepRecord) return false

    if (stepRecord.retry_count < stepRecord.max_retries) {
      await this.updateStep(pipelineId, stepIndex, {
        retry_count: stepRecord.retry_count + 1,
        status: 'pending',
        error_message: `Retry ${stepRecord.retry_count + 1}/${stepRecord.max_retries}: ${result.error}`,
      })
      return true // Will retry
    }

    return false // Max retries exceeded
  }
}
