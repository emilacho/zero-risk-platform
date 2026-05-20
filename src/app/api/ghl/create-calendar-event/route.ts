/**
 * /api/ghl/create-calendar-event · 410 Gone · Stack V4 canon 2026-05-20.
 *
 * Replacement · `/api/calendar/book` (Cal.com · Sprint 3 D2/4 follow-up).
 */
import { buildDeprecatedResponse } from "@/lib/deprecation/response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  return buildDeprecatedResponse({
    endpoint: "ghl/create-calendar-event",
    replacement: "/api/calendar/book",
    request,
  })
}
