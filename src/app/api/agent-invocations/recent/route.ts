/**
 * GET /api/agent-invocations/recent · Sprint 8D Brain RAG Gap 5 list endpoint.
 *
 * Returns last 30 agent_invocations (most recent first) con metadata clave para
 * la tabla del Mission Control brain observability panel.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const clientId = url.searchParams.get("client_id");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("agent_invocations")
    .select("id,agent_id,agent_name,client_id,model,cost_usd,duration_ms,started_at,metadata,status")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 502 });
  }

  const rows = (data ?? []).map((r) => {
    const md = (r.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: r.id,
      agent: r.agent_id || r.agent_name,
      client_id: r.client_id,
      model: r.model,
      cost_usd: r.cost_usd,
      duration_ms: r.duration_ms,
      started_at: r.started_at,
      status: r.status,
      brain_hit: md.brain_hit ?? null,
      brain_chunks_count: md.brain_chunks_count ?? null,
      brain_query_ms: md.brain_query_ms ?? null,
      task_text_preview: typeof md.task_text === "string" ? (md.task_text as string).slice(0, 80) : "",
    };
  });

  return NextResponse.json({ ok: true, count: rows.length, invocations: rows }, { status: 200 });
}
