/**
 * ZERO RISK V3 — Mission Control Bridge
 * Syncs pipeline data from Supabase → Mission Control dashboard.
 *
 * Mission Control (MeisnerDan/mission-control) deployed on Railway:
 *   Production: https://zero-risk-mission-control-production.up.railway.app
 *   Local dev:  http://127.0.0.1:3001 (fallback when MC_BASE_URL not set)
 *
 * This bridge pushes pipeline events to MC via its REST API so Emilio
 * can visualize and control the pipeline from MC's UI.
 *
 * Sync directions:
 *   Supabase → MC: pipeline steps → tasks, HITL pauses → inbox
 *   MC → Supabase: HITL approval in MC → /api/hitl/resolve
 *
 * Used by: pipeline-orchestrator.ts (after each step)
 *          /api/mc-sync (manual sync endpoint)
 */

// ============================================================
// Types
// ============================================================

/** Mission Control task (POST /api/tasks) */
interface MCTask {
  title: string
  description?: string
  importance: 'important' | 'not-important'
  urgency: 'urgent' | 'not-urgent'
  kanban?: 'todo' | 'in-progress' | 'done'
  assignedTo?: string | null
  projectId?: string
  tags?: string[]
  notes?: string
  estimatedMinutes?: number | null
  subtasks?: MCSubtask[]
}

interface MCSubtask {
  title: string
  done: boolean
}

/** Mission Control inbox message (POST /api/inbox) */
interface MCInboxMessage {
  from: string
  to: string
  type: string
  taskId: string
  subject: string
  body: string
}

/** Response from MC task creation */
interface MCTaskResponse {
  id: string
  title: string
  kanban: string
  createdAt: string
}

/** Response from MC inbox creation */
interface MCInboxResponse {
  id: string
  status: string
  createdAt: string
}

/** Pipeline step data from Supabase */
interface PipelineStepData {
  id: string
  pipeline_id: string
  step_index: number
  step_name: string
  step_display_name: string
  agent_name: string | null
  status: string
  hitl_required: boolean
  hitl_status?: string
  output_text?: string
  cost_usd?: number
  duration_ms?: number
  input_tokens?: number
  output_tokens?: number
  error_message?: string
}

/** Mapping from MC task ID ↔ Supabase step ID */
interface StepTaskMapping {
  stepId: string
  mcTaskId: string
  pipelineId: string
  stepIndex: number
}

// ============================================================
// Agent Role Mapping
// ============================================================

/**
 * Maps Zero Risk agent names to Mission Control agent roles.
 * MC has built-in roles: leader, researcher, developer, marketer, analyst, tester
 * We map our 53 agents to these + custom roles.
 */
const AGENT_ROLE_MAP: Record<string, string> = {
  // Leadership
  'ruflo': 'leader',
  'jefe-marketing': 'leader',
  'jefe-client-success': 'leader',

  // Research
  'competitive_intelligence_agent': 'researcher',
  'market-research': 'researcher',
  'customer-research': 'researcher',
  'ad-intelligence-agent': 'researcher',

  // Content / Marketing
  'campaign-brief-agent': 'marketer',
  'content-creator': 'marketer',
  'social-media-strategist': 'marketer',
  'email-marketer': 'marketer',
  'community-manager': 'marketer',
  'influencer-manager': 'marketer',
  'brand-strategist': 'marketer',
  'creative-director': 'marketer',

  // Analysis / Optimization
  'optimization-agent': 'analyst',
  'reporting-agent': 'analyst',
  'tracking-specialist': 'analyst',
  'cro-specialist': 'analyst',
  'seo-specialist': 'analyst',
  'growth-hacker': 'analyst',

  // QA / Review
  'editor_en_jefe': 'tester',

  // Execution
  'media-buyer': 'marketer',
  'web-designer': 'developer',
  'video-editor': 'developer',

  // Sales
  'sales-enablement': 'marketer',
  'account-manager': 'marketer',
  'onboarding-specialist': 'marketer',
}

function getMCRole(agentName: string | null): string | null {
  if (!agentName) return null
  return AGENT_ROLE_MAP[agentName] || 'marketer' // default to marketer for unknown agents
}

// ============================================================
// Mission Control Bridge Class
// ============================================================

export class MissionControlBridge {
  private mcBaseUrl: string
  private mcApiToken: string | null
  private zrBaseUrl: string
  private enabled: boolean

  // In-memory mapping of step IDs → MC task IDs (for this pipeline run)
  private stepTaskMap: Map<string, string> = new Map()

  constructor(options?: {
    mcBaseUrl?: string
    mcApiToken?: string
    zrBaseUrl?: string
  }) {
    this.mcBaseUrl = options?.mcBaseUrl
      || process.env.MC_BASE_URL
      || 'http://127.0.0.1:3001'
    this.mcApiToken = options?.mcApiToken
      || process.env.MC_API_TOKEN
      || null
    this.zrBaseUrl = options?.zrBaseUrl
      || process.env.NEXT_PUBLIC_BASE_URL
      || 'http://localhost:3000'

    // Bridge is enabled if MC URL is configured
    this.enabled = !!this.mcBaseUrl
  }

  // ----------------------------------------------------------
  // Core: Fetch wrapper with MC auth
  // ----------------------------------------------------------

  private async mcFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (this.mcApiToken) {
      headers['x-api-key'] = this.mcApiToken
    }

    const url = `${this.mcBaseUrl}${path}`

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })
      return response
    } catch (error) {
      console.warn(`[MC Bridge] Failed to reach Mission Control at ${url}:`, error instanceof Error ? error.message : error)
      throw error
    }
  }

  // ----------------------------------------------------------
  // Pipeline → MC: Create project for pipeline
  // ----------------------------------------------------------

  /**
   * Called when a new pipeline starts.
   * Creates a MC project + tasks for each pipeline step.
   */
  async onPipelineCreated(
    pipelineId: string,
    clientName: string,
    objective: string,
    steps: Array<{ index: number; name: string; display_name: string; agent: string | null; hitl_required: boolean }>
  ): Promise<void> {
    if (!this.enabled) return

    try {
      // Create tasks for each pipeline step
      for (const step of steps) {
        const task: MCTask = {
          title: `[P${step.index}] ${step.display_name}`,
          description: [
            `Pipeline: ${pipelineId.substring(0, 8)}...`,
            `Cliente: ${clientName}`,
            `Objetivo: ${objective}`,
            `Paso ${step.index} de ${steps.length - 1}`,
            step.hitl_required ? '⚠️ Requiere aprobación humana (HITL)' : '',
            `\n---\nZero Risk Pipeline Step | Agent: ${step.agent || 'N/A'}`,
          ].filter(Boolean).join('\n'),
          importance: step.hitl_required ? 'important' : 'not-important',
          urgency: step.index === 0 ? 'urgent' : 'not-urgent',
          kanban: step.index === 0 ? 'in-progress' : 'todo',
          assignedTo: getMCRole(step.agent),
          tags: ['zero-risk', 'pipeline', `step-${step.index}`],
          notes: `pipeline_id:${pipelineId}|step_index:${step.index}|step_name:${step.name}`,
        }

        const response = await this.mcFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(task),
        })

        if (response.ok) {
          const data: MCTaskResponse = await response.json()
          this.stepTaskMap.set(`${pipelineId}:${step.index}`, data.id)
          console.log(`[MC Bridge] Created task ${data.id} for step ${step.index} (${step.display_name})`)
        } else {
          const errText = await response.text()
          console.warn(`[MC Bridge] Failed to create task for step ${step.index}: ${response.status} ${errText}`)
        }
      }
    } catch (error) {
      console.warn('[MC Bridge] onPipelineCreated failed (non-blocking):', error instanceof Error ? error.message : error)
    }
  }

  // ----------------------------------------------------------
  // Step Events → MC: Update task status
  // ----------------------------------------------------------

  /**
   * Called when a pipeline step starts executing.
   */
  async onStepStarted(pipelineId: string, stepIndex: number, stepName: string): Promise<void> {
    if (!this.enabled) return

    try {
      const taskId = this.stepTaskMap.get(`${pipelineId}:${stepIndex}`)
      if (!taskId) return

      await this.mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          kanban: 'in-progress',
          urgency: 'urgent',
        }),
      })
      console.log(`[MC Bridge] Step ${stepIndex} (${stepName}) → in-progress`)
    } catch (error) {
      console.warn(`[MC Bridge] onStepStarted failed for step ${stepIndex}:`, error instanceof Error ? error.message : error)
    }
  }

  /**
   * Called when a pipeline step completes successfully.
   */
  async onStepCompleted(
    pipelineId: string,
    stepIndex: number,
    stepName: string,
    result: { costUsd: number; durationMs: number; inputTokens: number; outputTokens: number }
  ): Promise<void> {
    if (!this.enabled) return

    try {
      const taskId = this.stepTaskMap.get(`${pipelineId}:${stepIndex}`)
      if (!taskId) return

      const durationSec = Math.round(result.durationMs / 1000)

      await this.mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          kanban: 'done',
          urgency: 'not-urgent',
          notes: [
            `✅ Completado en ${durationSec}s`,
            `Tokens: ${result.inputTokens} in / ${result.outputTokens} out`,
            `Costo: $${result.costUsd.toFixed(4)}`,
            `pipeline_id:${pipelineId}|step_index:${stepIndex}`,
          ].join('\n'),
        }),
      })

      // Mark next step as urgent
      const nextTaskId = this.stepTaskMap.get(`${pipelineId}:${stepIndex + 1}`)
      if (nextTaskId) {
        await this.mcFetch(`/api/tasks/${nextTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            urgency: 'urgent',
          }),
        })
      }

      console.log(`[MC Bridge] Step ${stepIndex} (${stepName}) → done ($${result.costUsd.toFixed(4)})`)
    } catch (error) {
      console.warn(`[MC Bridge] onStepCompleted failed for step ${stepIndex}:`, error instanceof Error ? error.message : error)
    }
  }

  /**
   * Called when a pipeline step fails.
   */
  async onStepFailed(
    pipelineId: string,
    stepIndex: number,
    stepName: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.enabled) return

    try {
      const taskId = this.stepTaskMap.get(`${pipelineId}:${stepIndex}`)
      if (!taskId) return

      await this.mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          kanban: 'todo',  // Back to todo for retry
          importance: 'important',
          urgency: 'urgent',
          notes: `❌ Error: ${errorMessage}\npipeline_id:${pipelineId}|step_index:${stepIndex}`,
        }),
      })

      // Also send inbox message about the failure
      if (taskId) {
        await this.sendInboxMessage({
          from: stepName,
          to: 'leader',
          type: 'escalation',
          taskId,
          subject: `❌ Pipeline Step ${stepIndex} Failed: ${stepName}`,
          body: [
            `El paso "${stepName}" falló con el siguiente error:`,
            `\n${errorMessage}`,
            `\nPipeline: ${pipelineId.substring(0, 8)}...`,
            `\nAcción requerida: revisar el error y decidir si reintentar o cancelar.`,
          ].join('\n'),
        })
      }

      console.log(`[MC Bridge] Step ${stepIndex} (${stepName}) → FAILED: ${errorMessage}`)
    } catch (error) {
      console.warn(`[MC Bridge] onStepFailed failed for step ${stepIndex}:`, error instanceof Error ? error.message : error)
    }
  }

  // ----------------------------------------------------------
  // HITL → MC Inbox: Human review needed
  // ----------------------------------------------------------

  /**
   * Called when pipeline pauses for HITL review.
   * Creates an inbox message in MC so Emilio sees it in the dashboard.
   */
  async onHITLPaused(
    pipelineId: string,
    stepIndex: number,
    stepName: string,
    contentPreview: string,
    stepId: string
  ): Promise<void> {
    if (!this.enabled) return

    try {
      const taskId = this.stepTaskMap.get(`${pipelineId}:${stepIndex}`) || stepId

      // Update task to show it needs human review
      if (this.stepTaskMap.has(`${pipelineId}:${stepIndex}`)) {
        await this.mcFetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            kanban: 'in-progress',
            importance: 'important',
            urgency: 'urgent',
            notes: [
              '⏸️ ESPERANDO APROBACIÓN HUMANA',
              `Pipeline paused at step ${stepIndex}`,
              `Approve via: POST ${this.zrBaseUrl}/api/hitl/resolve`,
              `Step ID: ${stepId}`,
              `pipeline_id:${pipelineId}|step_index:${stepIndex}`,
            ].join('\n'),
          }),
        })
      }

      // Create inbox message for Emilio
      await this.sendInboxMessage({
        from: stepName || `step-${stepIndex}`,
        to: 'leader',
        type: 'decision',
        taskId,
        subject: `⏸️ Aprobación Requerida — Pipeline Step ${stepIndex}`,
        body: [
          `El pipeline necesita tu aprobación para continuar.`,
          `\n## Paso: ${stepName} (Step ${stepIndex})`,
          `\n## Preview del contenido:`,
          contentPreview.substring(0, 500),
          contentPreview.length > 500 ? '\n...(truncado)' : '',
          `\n---`,
          `**Para aprobar:** POST ${this.zrBaseUrl}/api/hitl/resolve`,
          `Body: { "step_id": "${stepId}", "decision": "approved" }`,
          `\n**Para rechazar:** cambiar "decision" a "rejected"`,
          `**Para editar:** incluir "edited_content" con el texto corregido`,
        ].join('\n'),
      })

      console.log(`[MC Bridge] HITL pause → inbox message sent for step ${stepIndex}`)
    } catch (error) {
      console.warn(`[MC Bridge] onHITLPaused failed for step ${stepIndex}:`, error instanceof Error ? error.message : error)
    }
  }

  // ----------------------------------------------------------
  // Pipeline Complete → MC
  // ----------------------------------------------------------

  /**
   * Called when the entire pipeline completes.
   */
  async onPipelineCompleted(
    pipelineId: string,
    totalCost: number,
    totalSteps: number,
    durationMs: number
  ): Promise<void> {
    if (!this.enabled) return

    try {
      const durationMin = Math.round(durationMs / 60000)

      // Send summary inbox message
      await this.sendInboxMessage({
        from: 'pipeline-orchestrator',
        to: 'leader',
        type: 'status',
        taskId: pipelineId.substring(0, 8),
        subject: `✅ Pipeline Completado — ${totalSteps} pasos, $${totalCost.toFixed(2)}`,
        body: [
          `El pipeline de campaña se completó exitosamente.`,
          `\n## Resumen:`,
          `- Pasos completados: ${totalSteps}`,
          `- Costo total: $${totalCost.toFixed(2)}`,
          `- Duración: ~${durationMin} minutos`,
          `- Pipeline ID: ${pipelineId}`,
          `\nRevisa los resultados en el dashboard de Mission Control.`,
        ].join('\n'),
      })

      console.log(`[MC Bridge] Pipeline ${pipelineId.substring(0, 8)} completed → notification sent`)
    } catch (error) {
      console.warn('[MC Bridge] onPipelineCompleted failed:', error instanceof Error ? error.message : error)
    }
  }

  // ----------------------------------------------------------
  // Inbox helper
  // ----------------------------------------------------------

  private async sendInboxMessage(message: MCInboxMessage): Promise<MCInboxResponse | null> {
    try {
      const response = await this.mcFetch('/api/inbox', {
        method: 'POST',
        body: JSON.stringify(message),
      })

      if (response.ok) {
        return await response.json()
      } else {
        const errText = await response.text()
        console.warn(`[MC Bridge] Inbox message failed: ${response.status} ${errText}`)
        return null
      }
    } catch (error) {
      console.warn('[MC Bridge] sendInboxMessage failed:', error instanceof Error ? error.message : error)
      return null
    }
  }

  // ----------------------------------------------------------
  // Bulk Sync: Sync existing Supabase pipeline to MC
  // ----------------------------------------------------------

  /**
   * Sync an existing pipeline from Supabase to Mission Control.
   * Useful for pipelines that were created before the bridge was installed,
   * or after MC was restarted and lost its JSON data.
   */
  async syncPipelineToMC(
    supabase: import('@supabase/supabase-js').SupabaseClient,
    pipelineId: string
  ): Promise<{ tasksCreated: number; inboxSent: boolean; errors: string[] }> {
    const errors: string[] = []
    let tasksCreated = 0
    let inboxSent = false

    try {
      // Load pipeline
      const { data: pipeline, error: pipelineError } = await supabase
        .from('pipeline_executions')
        .select('*, clients(name)')
        .eq('id', pipelineId)
        .single()

      if (pipelineError || !pipeline) {
        return { tasksCreated: 0, inboxSent: false, errors: [`Pipeline not found: ${pipelineError?.message}`] }
      }

      const clientName = (pipeline as Record<string, unknown>).clients
        ? ((pipeline as Record<string, unknown>).clients as Record<string, string>).name
        : 'Unknown Client'

      // Load steps
      const { data: steps, error: stepsError } = await supabase
        .from('pipeline_steps')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('step_index')

      if (stepsError || !steps) {
        return { tasksCreated: 0, inboxSent: false, errors: [`Steps not found: ${stepsError?.message}`] }
      }

      // Create MC tasks for each step
      for (const step of steps) {
        const kanban = step.status === 'completed' || step.status === 'skipped'
          ? 'done'
          : step.status === 'running' || step.status === 'paused_hitl'
            ? 'in-progress'
            : 'todo'

        const costInfo = step.cost_usd
          ? `\nCosto: $${step.cost_usd.toFixed(4)} | Tokens: ${step.input_tokens || 0} in / ${step.output_tokens || 0} out`
          : ''

        const durationInfo = step.duration_ms
          ? ` | Duración: ${Math.round(step.duration_ms / 1000)}s`
          : ''

        const statusEmoji = step.status === 'completed' ? '✅'
          : step.status === 'failed' ? '❌'
          : step.status === 'running' ? '🔄'
          : step.status === 'paused_hitl' ? '⏸️'
          : step.status === 'skipped' ? '⏭️'
          : '⬜'

        const task: MCTask = {
          title: `[P${step.step_index}] ${step.step_display_name}`,
          description: [
            `${statusEmoji} Estado: ${step.status}`,
            `Pipeline: ${pipelineId.substring(0, 8)}...`,
            `Cliente: ${clientName}`,
            `Objetivo: ${pipeline.objective}`,
            step.hitl_required ? '⚠️ Requiere aprobación humana (HITL)' : '',
            step.error_message ? `\n❌ Error: ${step.error_message}` : '',
            costInfo,
            durationInfo,
          ].filter(Boolean).join('\n'),
          importance: step.hitl_required || step.status === 'failed' ? 'important' : 'not-important',
          urgency: step.status === 'paused_hitl' || step.status === 'running' ? 'urgent' : 'not-urgent',
          kanban,
          assignedTo: getMCRole(step.agent_name),
          tags: ['zero-risk', 'pipeline', `step-${step.step_index}`, step.status],
          notes: [
            `pipeline_id:${pipelineId}|step_index:${step.step_index}|step_name:${step.step_name}`,
            step.status === 'paused_hitl' ? `\nstep_id:${step.id}\nApprove: POST ${this.zrBaseUrl}/api/hitl/resolve` : '',
          ].filter(Boolean).join('\n'),
        }

        try {
          const response = await this.mcFetch('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(task),
          })

          if (response.ok) {
            const data: MCTaskResponse = await response.json()
            this.stepTaskMap.set(`${pipelineId}:${step.step_index}`, data.id)
            tasksCreated++
          } else {
            const errText = await response.text()
            errors.push(`Step ${step.step_index}: ${response.status} ${errText}`)
          }
        } catch (e) {
          errors.push(`Step ${step.step_index}: ${e instanceof Error ? e.message : 'fetch failed'}`)
        }
      }

      // If pipeline is paused at HITL, also create inbox message
      if (pipeline.status === 'paused_hitl') {
        const hitlStep = steps.find((s: PipelineStepData) => s.status === 'paused_hitl' && s.hitl_status === 'pending')
        if (hitlStep) {
          const taskId = this.stepTaskMap.get(`${pipelineId}:${hitlStep.step_index}`) || hitlStep.id

          const inboxResult = await this.sendInboxMessage({
            from: hitlStep.step_name || `step-${hitlStep.step_index}`,
            to: 'leader',
            type: 'decision',
            taskId,
            subject: `⏸️ Aprobación Requerida — Pipeline Step ${hitlStep.step_index}`,
            body: [
              `El pipeline está pausado esperando tu aprobación.`,
              `\n## Paso: ${hitlStep.step_display_name} (Step ${hitlStep.step_index})`,
              `\n## Preview:`,
              (hitlStep.output_text || 'Sin preview disponible').substring(0, 500),
              `\n---`,
              `**Para aprobar:** POST ${this.zrBaseUrl}/api/hitl/resolve`,
              `Body: { "step_id": "${hitlStep.id}", "decision": "approved" }`,
            ].join('\n'),
          })

          inboxSent = !!inboxResult
        }
      }
    } catch (error) {
      errors.push(`Sync failed: ${error instanceof Error ? error.message : 'unknown'}`)
    }

    return { tasksCreated, inboxSent, errors }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.mcFetch('/api/tasks?limit=1', { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }
}
