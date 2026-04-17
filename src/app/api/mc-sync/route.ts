import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { MissionControlBridge } from '@/lib/mc-bridge'

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
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body.action || 'sync_pipeline'
    const pipelineId = body.pipeline_id

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
      { error: `Unknown action: ${action}. Valid: sync_pipeline, sync_all_active, health_check` },
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
    },
    example_body: {
      action: 'sync_pipeline',
      pipeline_id: '85204163-8439-452b-9033-8749296ab851',
    },
  })
}
