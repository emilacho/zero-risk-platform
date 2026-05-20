/**
 * /api/ghl/primary-champion · 410 Gone · Stack V4 canon 2026-05-20.
 *
 * Replacement · TBD `client_champions` table + endpoint (Sprint 4 build).
 */
import { buildDeprecatedResponse } from "@/lib/deprecation/response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  return buildDeprecatedResponse({
    endpoint: "ghl/primary-champion",
    replacement: null,
    request,
  })
}
