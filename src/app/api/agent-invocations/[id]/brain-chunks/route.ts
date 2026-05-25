/**
 * GET /api/agent-invocations/[id]/brain-chunks · Sprint 8D Brain RAG Gap 5 API.
 *
 * Observability endpoint · returns ·
 *   1. Invocation metadata (agent · client · model · cost · brain_hit · count · query_ms · cost)
 *   2. Live re-query del brain con same task_description (current chunks que retornaría
 *      ahora · NOT historical replay porque chunks no se almacenan per-invocation ·
 *      sino se buscan fresh cada vez)
 *
 * Auth · service-role only (admin Mission Control dashboard surface).
 * NO Bearer needed because Mission Control uses cookie session OR same-origin.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/brain/embed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1. Fetch invocation
  const { data: inv, error: invErr } = await supabase
    .from("agent_invocations")
    .select("id,agent_id,agent_name,client_id,model,cost_usd,duration_ms,tokens_input,tokens_output,started_at,metadata,status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return NextResponse.json({ error: "invocation_query_failed", detail: invErr.message }, { status: 502 });
  }
  if (!inv) {
    return NextResponse.json({ error: "invocation_not_found", invocation_id: id }, { status: 404 });
  }

  const md = (inv.metadata as Record<string, unknown> | null) ?? {};
  const taskText = (md.task_text as string) || "";
  const brain = {
    brain_hit: md.brain_hit ?? null,
    brain_chunks_count: md.brain_chunks_count ?? null,
    brain_query_ms: md.brain_query_ms ?? null,
    brain_cost_usd: md.brain_cost_usd ?? null,
  };

  // 2. Live re-query · re-embed task_text + RPC query_client_brain · returns current chunks
  let liveChunks: Array<{ chunk_id: string; source_table: string; source_id: string; section_label: string; chunk_text: string; similarity: number }> | null = null;
  let replayError: string | null = null;

  if (inv.client_id && taskText) {
    try {
      const queryText = `[${inv.agent_id || inv.agent_name || "agent"}] ${taskText}`;
      const embed = await generateEmbedding(queryText);
      if (embed.ok) {
        const { data: chunks, error: rpcErr } = await supabase.rpc("query_client_brain", {
          p_client_id: inv.client_id,
          p_query_embedding: embed.embedding,
          p_top_k: 5,
        });
        if (rpcErr) {
          replayError = `rpc · ${rpcErr.message}`;
        } else {
          liveChunks = (chunks ?? []) as typeof liveChunks;
        }
      } else {
        replayError = `embed · ${embed.code} · ${embed.detail}`;
      }
    } catch (e) {
      replayError = e instanceof Error ? e.message : "unknown";
    }
  } else {
    replayError = "missing_client_id_or_task_text · cannot replay";
  }

  return NextResponse.json(
    {
      ok: true,
      invocation: {
        id: inv.id,
        agent: inv.agent_id || inv.agent_name,
        client_id: inv.client_id,
        model: inv.model,
        cost_usd: inv.cost_usd,
        duration_ms: inv.duration_ms,
        tokens_input: inv.tokens_input,
        tokens_output: inv.tokens_output,
        started_at: inv.started_at,
        status: inv.status,
        task_text_preview: taskText.slice(0, 200),
      },
      brain_metadata: brain,
      live_replay: {
        chunks: liveChunks,
        error: replayError,
        note: liveChunks ? `Live replay · current top 5 chunks for this client+task · NOT historical (chunks no se almacenan per-invocation · estos son chunks que retornaría AHORA si la invocation se re-ejecutara)` : null,
      },
    },
    { status: 200 },
  );
}
