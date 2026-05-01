import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { MissionControlBridge } from '@/lib/mc-bridge'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

/**
 * POST /api/mc-sync
 * Sync pipeline data from Supabase → Mission Control.
 *
 * Use cases:
 * 1. Sync an existing pipeline that was created before MC bridge was installed
 * 2. Re-sync after MC restart (JSON data lost)
 * 3. Manual "refresh" button in MC
 *
 * Body: {
 *   pipeline_id: uuid (optional) — sync specific pipeline
 *   action: "sync_pipeline" | "sync_all_active" | "health_check"
 *         | "hitl_cycle_complete" | "meta_learning_complete"
 *
 *   For action="hitl_cycle_complete" (B-001 fix · W14-T4):
 *     cycle_id: string (required)
 *     queue_depth: integer >= 0 (required)
 *     items_processed: integer >= 0 (required)
 *     timestamp: ISO date-time string (required)
 *
 *   For action="meta_learning_complete" (W15-T6):
 *     week: string (required)
 *     tasks_analyzed: integer >= 0 (required)
 *     success_rate: string (required)
 *     proposals_queued: integer >= 0 (required)
 *     timestamp: ISO date-time string (required)
 * }
 */
export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  const v = validateObject<Record<string, unknown>>(raw, 'mc-sync')
  if (!v.ok) return v.response
  const body = v.data as Record<string, any>

  try {
    const action = (body.action as string) || 'sync_pipeline'
    const pipelineId = body.pipeline_id as string | undefined

    // ---- Meta-Agent Weekly Learning Cycle telemetry (W15-T6) ---------------
    // Workflow: `Zero Risk - Meta-Agent Weekly Learning Cycle` (cron Mon 9am).
    // Same shape pattern as hitl_cycle_complete: strict re-validation + insert
    // into a dedicated audit table. Closes the gap surfaced by the W15-T5 MC
    // integration audit (was returning silent 400 "Unknown action").
    if (action === 'meta_learning_complete') {
      const v2 = validateObject<Record<string, any>>(body, 'mc-sync-meta-learning')
      if (!v2.ok) return v2.response
      const p = v2.data

      try {
        const supabase = getSupabaseAdmin()
        const { data, error } = await supabase
          .from('mc_inbox_meta_learning_cycles')
          .insert({
            week: p.week,
            tasks_analyzed: p.tasks_analyzed,
            success_rate: p.success_rate,
            proposals_queued: p.proposals_queued,
            cycle_timestamp: p.timestamp,
            payload: p,
            source: 'n8n-meta-agent-weekly-cycle',
          })
          .select('id')
          .single()

        if (error) {
          return NextResponse.json(
            {
              error: 'persist_failed',
              code: 'E-DB-INSERT',
              detail: error.message,
            },
            { status: 500 }
          )
        }

        return NextResponse.json({
          ok: true,
          action: 'meta_learning_complete',
          persisted_id: data?.id,
        })
      } catch (err) {
        return NextResponse.json(
          {
            error: 'persist_failed',
            code: 'E-DB-INSERT',
            detail: err instanceof Error ? err.message : 'Unknown DB error',
          },
          { status: 500 }
        )
      }
    }

    // ---- HITL cycle-complete telemetry (B-001 fix · W14-T4) ----------------
    // n8n's HITL workflow pings this every 15 min after draining the queue.
    // We re-validate against a stricter schema (cycle_id, queue_depth,
    // items_processed, timestamp all required + correctly typed) and persist
    // to a dedicated audit table. No MC bridge call required.
    if (action === 'hitl_cycle_complete') {
      const v2 = validateObject<Record<string, any>>(body, 'mc-sync-hitl-cycle')
      if (!v2.ok) return v2.response
      const p = v2.data

      try {
        const supabase = getSupabaseAdmin()
        const { data, error } = await supabase
          .from('mc_inbox_hitl_cycles')
          .insert({
            cycle_id: p.cycle_id,
            queue_depth: p.queue_depth,
            items_processed: p.items_processed,
            cycle_timestamp: p.timestamp,
            payload: p,
            source: 'n8n-hitl-workflow',
          })
          .select('id')
          .single()

        if (error) {
          return NextResponse.json(
            {
              error: 'persist_failed',
              code: 'E-DB-INSERT',
              detail: error.message,
            },
            { status: 500 }
          )
        }

        return NextResponse.json({
          ok: true,
          action: 'hitl_cycle_complete',
          persisted_id: data?.id,
        })
      } catch (err) {
        return NextResponse.json(
          {
            error: 'persist_failed',
            code: 'E-DB-INSERT',
            detail: err instanceof Error ? err.message : 'Unknown DB error',
          },
          { status: 500 }
        )
      }
    }

    // Soft-handle NEXUS/research-workflow actions (no sync needed, just ack)
    const NOTIFY_ACTIONS = new Set([
      'phase_complete', 'phase_started', 'phase_failed',
      'pipeline_complete', 'pipeline_failed',
      // Task creation notifications — Sentry/UptimeRobot/Ops workflows
      'create_task', 'routing_decision', 'task_assigned', 'incident_logged',
    ])
    if (NOTIFY_ACTIONS.has(action)) {
      // Fire-and-forget ack: these come from n8n workflows to inform MC of progress/tasks.
      // When a `task` object is included we log it for audit; otherwise bare ack.
      if (body.task || body.incident) {
        try {
          const supabase = getSupabaseAdmin()
          await supabase.from('error_events').insert({
            source: body.action || 'mc-sync',
            severity: body.task?.priority === 'critical' ? 'P0' : 'P2',
            title: body.task?.title || body.incident?.title || `mc-sync:${action}`,
            data: body,
          })
        } catch {
          // log-only; don't block the caller
        }
      }
      return NextResponse.json({
        ok: true,
        action,
        acknowledged: true,
        note: 'notification acknowledged, no sync performed',
      })
    }

    const supabase = getSupabaseAdmin()
    const mc = new MissionControlBridge()

    // Health check first
    const mcAvailable = await mc.isAvailable()

    if (action === 'health_check') {
      return NextResponse.json({
        mission_control: mcAvailable ? 'online' : 'offline',
        mc_url: process.env.MC_BASE_URL || 'http://localhost:3001',
        timestamp: new Date().toISOString(),
      })
    }

    if (!mcAvailable) {
      return NextResponse.json(
        {
          error: 'Mission Control is not reachable',
          mc_url: process.env.MC_BASE_URL || 'http://localhost:3001',
          hint: 'Check MC_BASE_URL env var points to Railway deployment (https://zero-risk-mission-control-production.up.railway.app)',
        },
        { status: 503 }
      )
    }

    if (action === 'sync_pipeline') {
      if (!pipelineId) {
        return NextResponse.json(
          { error: 'pipeline_id is required for sync_pipeline action' },
          { status: 400 }
        )
      }

      const result = await mc.syncPipelineToMC(supabase, pipelineId)

      return NextResponse.json({
        success: result.errors.length === 0,
        action: 'sync_pipeline',
        pipeline_id: pipelineId,
        tasks_created: result.tasksCreated,
        hitl_inbox_sent: result.inboxSent,
        errors: result.errors,
      })
    }

    if (action === 'sync_all_active') {
      // Find all active pipelines (running or paused)
      const { data: pipelines, error } = await supabase
        .from('pipeline_executions')
        .select('id')
        .in('status', ['running', 'paused_hitl', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (error || !pipelines) {
        return NextResponse.json(
          { error: `Failed to find active pipelines: ${error?.message}` },
          { status: 500 }
        )
      }

      const results = []
      for (const p of pipelines) {
        const result = await mc.syncPipelineToMC(supabase, p.id)
        results.push({
          pipeline_id: p.id,
          tasks_created: result.tasksCreated,
          hitl_inbox_sent: result.inboxSent,
          errors: result.errors,
        })
      }

      const totalTasks = results.reduce((sum, r) => sum + r.tasks_created, 0)
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

      return NextResponse.json({
        success: totalErrors === 0,
        action: 'sync_all_active',
        pipelines_synced: results.length,
        total_tasks_created: totalTasks,
        total_errors: totalErrors,
        details: results,
      })
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}. Valid: sync_pipeline, sync_all_active, health_check, hitl_cycle_complete, meta_learning_complete` },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/mc-sync — endpoint info + health check
 */
export async function GET() {
  const mc = new MissionControlBridge()
  const mcAvailable = await mc.isAvailable()

  return NextResponse.json({
    endpoint: '/api/mc-sync',
    method: 'POST',
    description: 'Sync pipeline data from Supabase to Mission Control dashboard.',
    mission_control: mcAvailable ? 'online' : 'offline',
    mc_url: process.env.MC_BASE_URL || 'http://localhost:3001',
    actions: {
      health_check: 'Check if Mission Control is reachable',
      sync_pipeline: 'Sync a specific pipeline (requires pipeline_id)',
      sync_all_active: 'Sync all active/paused pipelines',
      hitl_cycle_complete: 'Persist HITL workflow cycle-complete telemetry (cycle_id, queue_depth, items_processed, timestamp required)',
      meta_learning_complete: 'Persist Meta-Agent Weekly Learning Cycle telemetry (week, tasks_analyzed, success_rate, proposals_queued, timestamp required)',
    },
    example_body: {
      action: 'sync_pipeline',
      pipeline_id: '85204163-8439-452b-9033-8749296ab851',
    },
  })
}
