/**
 * Deprecation telemetry · Sprint 3 Día 5.
 *
 * Appends one JSONL line per call to a deprecated endpoint. File path:
 *   `logs/deprecation-YYYY-MM-DD.jsonl`
 *
 * Fallback strategy ·
 *   1. Try `fs.appendFile` (Node runtime · works locally + on long-running hosts)
 *   2. On any IO error (Vercel read-only filesystem · permission denied ·
 *      ENOSPC · etc) capture + emit a `console.warn` structured log so the
 *      same payload still lands in Vercel's log drain.
 *   3. NEVER throw · the caller is a 410 handler · log failures must not
 *      bubble up and bork the deprecation signal.
 *
 * Schema kept narrow + flat so the JSONL is grep-able with `jq` without
 * unwrap gymnastics. The `endpoint` field is the canonical bucket key.
 *
 * NOTE · the canonical `deprecation_metrics` Supabase table does NOT exist
 * (CC#4 ground-truth audit 2026-05-20). When it lands in Sprint 4 we add
 * a secondary writer; the file fallback stays as the redundant trail.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

export interface DeprecationLogEntry {
  endpoint: string
  method: string
  user_agent: string
  timestamp: string
  sunset_date?: string
  replacement?: string | null
  client_ip?: string | null
}

function dateBucket(iso: string): string {
  // YYYY-MM-DD slice · UTC · stable bucket for tail/aggregation
  return iso.slice(0, 10)
}

export async function logDeprecation(
  entry: DeprecationLogEntry,
): Promise<void> {
  const line = JSON.stringify(entry) + "\n"
  const filename = `deprecation-${dateBucket(entry.timestamp)}.jsonl`
  // Use CWD as anchor · works for `next dev` + `next build` runtime.
  // On Vercel the workdir is `/var/task` and is read-only · the catch
  // below kicks in and we fall back to console.warn.
  const target = path.join(process.cwd(), "logs", filename)

  try {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.appendFile(target, line, "utf8")
    return
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // Structured fallback · Vercel log drain captures stdout/stderr,
    // so this still produces a searchable trail with the same payload.
    console.warn(
      "[deprecation-log-fallback]",
      JSON.stringify({ ...entry, _io_error: reason }),
    )
  }
}
