/**
 * Notion sync helper · Sprint 5 wire-in.
 *
 * Direct lib invocation (no HTTP round-trip) for server-side callers ·
 * OnboardingOrchestrator + NEXUS Phase 7 OPTIMIZE close + weekly cron.
 * Maintains the same fail-open contract as the `/api/notion/sync-report`
 * route (which is now a thin wrapper around the same helpers) ·
 * callers NEVER catch errors · this helper swallows everything and
 * surfaces a structured outcome for telemetry / log.
 *
 * Why direct instead of HTTP ·
 *   - Same process · no auth dance · no JSON parse round-trip
 *   - Failure mode identical (503 unconfigured · 502 upstream · 200 ok)
 *   - Test isolation via existing `createPage` / `getReportDatabaseId` mocks
 */
import { createPage, getReportDatabaseId } from "./client"

export type NotionSyncType = "campaign" | "client" | "weekly"

export interface NotionSyncOutcome {
  ok: boolean
  type: NotionSyncType
  page_id?: string
  url?: string
  status: "synced" | "unconfigured" | "upstream_error" | "invalid_input"
  detail?: string
}

export async function syncReport(
  type: NotionSyncType,
  payload: Record<string, unknown>,
): Promise<NotionSyncOutcome> {
  const databaseId = getReportDatabaseId(type)
  if (!databaseId) {
    return {
      ok: false,
      type,
      status: "unconfigured",
      detail: `NOTION_DATABASE_${type.toUpperCase()}S env missing`,
    }
  }
  const result = await createPage(databaseId, payload)
  if (!result.ok) {
    if (result.code === "NotConfigured") {
      return {
        ok: false,
        type,
        status: "unconfigured",
        detail: result.detail,
      }
    }
    if (result.code === "InvalidInput") {
      return {
        ok: false,
        type,
        status: "invalid_input",
        detail: result.detail,
      }
    }
    return {
      ok: false,
      type,
      status: "upstream_error",
      detail: result.detail,
    }
  }
  return {
    ok: true,
    type,
    status: "synced",
    page_id: result.data?.id,
    url: result.data?.url,
  }
}

/**
 * Best-effort wrapper · used by orchestrators that MUST NOT fail when
 * Notion is unconfigured · returns the outcome for logging but never
 * throws and never propagates. Designed to drop into `.catch()` chains
 * or `void syncReportSafe(...)` patterns.
 */
export async function syncReportSafe(
  type: NotionSyncType,
  payload: Record<string, unknown>,
  logPrefix = "[notion-sync]",
): Promise<NotionSyncOutcome> {
  try {
    const outcome = await syncReport(type, payload)
    if (!outcome.ok && outcome.status !== "unconfigured") {
      // Unconfigured is the steady-state pre-Emilio-populate · NOT noise
      // worth a log line. Upstream errors + invalid input DO get logged
      // so the operator notices schema drift on the Notion side.
      console.warn(
        `${logPrefix} ${outcome.status} · ${type} · ${outcome.detail ?? "no detail"}`,
      )
    }
    return outcome
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.warn(`${logPrefix} unexpected_throw · ${type} · ${detail}`)
    return {
      ok: false,
      type,
      status: "upstream_error",
      detail: detail.slice(0, 400),
    }
  }
}
