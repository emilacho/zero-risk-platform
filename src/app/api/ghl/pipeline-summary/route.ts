/**
 * /api/ghl/pipeline-summary · 410 Gone · Stack V4 canon 2026-05-20.
 *
 * Replacement · direct query a `journey_executions` (Sprint 4 UI build).
 */
import { buildDeprecatedResponse } from "@/lib/deprecation/response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  return buildDeprecatedResponse({
    endpoint: "ghl/pipeline-summary",
    replacement: null,
    request,
  })
}
