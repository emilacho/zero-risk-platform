/**
 * /api/experiments/[id]
 *  GET   → fetch one
 *  PATCH → update status / results / dates
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  return genericGetById('experiments', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  return genericPatch('experiments', ctx.params.id, request, [
    'status', 'results', 'started_at', 'ended_at', 'growthbook_experiment_id', 'guardrail_metrics',
  ])
}
