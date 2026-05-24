/**
 * /api/ghl/relationships · 410 Gone · Stack V4 canon 2026-05-20.
 *
 * Replacement · TBD `contact_relationships` table + endpoint (Sprint 4 build).
 * Preserves the dual GET+POST surface the legacy stub exposed so callers
 * that picked either verb still receive the signal uniformly.
 */
import { buildDeprecatedResponse } from "@/lib/deprecation/response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  return buildDeprecatedResponse({
    endpoint: "ghl/relationships",
    replacement: null,
    request,
  })
}

export async function POST(request: Request) {
  // Auth · NO check needed · 410 Gone deprecated endpoint (Stack V4 canon).
  return buildDeprecatedResponse({
    endpoint: "ghl/relationships",
    replacement: null,
    request,
  })
}
