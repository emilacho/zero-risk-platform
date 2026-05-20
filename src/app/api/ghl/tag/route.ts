/**
 * /api/ghl/tag · 410 Gone · Stack V4 canon 2026-05-20.
 *
 * Replacement · TBD `contact_tags` table + endpoint (Sprint 4 build).
 */
import { buildDeprecatedResponse } from "@/lib/deprecation/response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  return buildDeprecatedResponse({
    endpoint: "ghl/tag",
    replacement: null,
    request,
  })
}
