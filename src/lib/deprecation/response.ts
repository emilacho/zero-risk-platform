/**
 * Deprecation 410 Gone response builder · Sprint 3 Día 5.
 *
 * Single canonical surface for the 8 `/api/ghl/*` thin wrappers. Each
 * endpoint passes its own slug + replacement target; this helper handles
 * the logging side-effect, header shape, and JSON body.
 *
 * Header set follows RFC 8594 (`Deprecation` + `Sunset`) plus the
 * `X-Deprecated` / `X-Sunset-Date` / `X-Replacement` legacy triplet so
 * both modern and legacy n8n / curl callers can detect the signal.
 */
import { NextResponse } from "next/server"
import { logDeprecation } from "./log"

export const GHL_SUNSET_DATE = "2026-07-31"
export const GHL_DEPRECATION_DOCS =
  "zr-vault/raw/refs/2026-05-20-stack-v4-ghl-out-migration-master-plan.md"

export interface DeprecatedResponseOptions {
  endpoint: string
  replacement: string | null
  request: Request
}

export async function buildDeprecatedResponse({
  endpoint,
  replacement,
  request,
}: DeprecatedResponseOptions): Promise<NextResponse> {
  const timestamp = new Date().toISOString()
  await logDeprecation({
    endpoint,
    method: request.method,
    user_agent: request.headers.get("user-agent") ?? "unknown",
    client_ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    timestamp,
    sunset_date: GHL_SUNSET_DATE,
    replacement,
  })

  return NextResponse.json(
    {
      error: "Gone",
      message: `Endpoint ${endpoint} deprecated · Stack V4 canon 2026-05-20 · GHL OUT`,
      sunset_date: GHL_SUNSET_DATE,
      replacement,
      docs: GHL_DEPRECATION_DOCS,
    },
    {
      status: 410,
      headers: {
        "X-Deprecated": "true",
        "X-Sunset-Date": GHL_SUNSET_DATE,
        "X-Replacement": replacement ?? "tbd",
        Deprecation: `date="${GHL_SUNSET_DATE}"`,
        Sunset: GHL_SUNSET_DATE,
      },
    },
  )
}
