"use client";
/**
 * Sprint 8D Brain RAG Gap 5 · Mission Control observability panel.
 *
 * Recent agent invocations table · per-row drill-down shows brain metadata +
 * live replay of top 5 chunks que retornaría el brain ahora para el mismo task.
 */
import { useEffect, useState, useCallback } from "react";

interface InvocationRow {
  id: string;
  agent: string;
  client_id: string | null;
  model: string;
  cost_usd: number;
  duration_ms: number;
  started_at: string;
  status: string;
  brain_hit: boolean | null;
  brain_chunks_count: number | null;
  brain_query_ms: number | null;
  task_text_preview: string;
}

interface BrainChunk {
  chunk_id: string;
  source_table: string;
  source_id: string;
  section_label: string;
  chunk_text: string;
  similarity: number;
}

interface DetailResponse {
  invocation: {
    id: string;
    agent: string;
    client_id: string | null;
    model: string;
    cost_usd: number;
    duration_ms: number;
    tokens_input: number;
    tokens_output: number;
    started_at: string;
    task_text_preview: string;
  };
  brain_metadata: {
    brain_hit: boolean | null;
    brain_chunks_count: number | null;
    brain_query_ms: number | null;
    brain_cost_usd: number | null;
  };
  live_replay: {
    chunks: BrainChunk[] | null;
    error: string | null;
    note: string | null;
  };
}

export default function BrainObservabilityPage() {
  const [invocations, setInvocations] = useState<InvocationRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const r = await fetch("/api/agent-invocations/recent?limit=30");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "list_failed");
      setInvocations(j.invocations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const r = await fetch(`/api/agent-invocations/${id}/brain-chunks`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "detail_failed");
      setDetail(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Brain RAG observability</h1>
        <p className="text-sm text-gray-600 mt-1">
          Sprint 8D Gap 5 · últimas 30 invocaciones de empleados · click para ver metadata + live replay del cerebro
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4">
          Error · {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List · 1 col on mobile · 1/3 on lg */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Invocaciones recientes</h2>
            <button
              onClick={() => void loadList()}
              className="text-xs text-blue-600 hover:underline"
              disabled={loadingList}
            >
              {loadingList ? "..." : "↻ refresh"}
            </button>
          </div>
          <div className="border rounded divide-y max-h-[70vh] overflow-y-auto">
            {invocations.length === 0 && !loadingList && (
              <div className="p-4 text-sm text-gray-500">No invocations recent.</div>
            )}
            {invocations.map((inv) => (
              <button
                key={inv.id}
                onClick={() => void loadDetail(inv.id)}
                className={`w-full text-left p-3 hover:bg-gray-50 ${selectedId === inv.id ? "bg-blue-50" : ""}`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-gray-700">{inv.agent}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    inv.brain_hit === true ? "bg-green-100 text-green-700" :
                    inv.brain_hit === false ? "bg-gray-100 text-gray-600" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {inv.brain_hit === true ? `Brain ${inv.brain_chunks_count}` : inv.brain_hit === false ? "no brain" : "n/a"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">{inv.task_text_preview || "(no task text)"}</div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                  <span>${(inv.cost_usd || 0).toFixed(4)}</span>
                  <span>{new Date(inv.started_at).toLocaleTimeString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail · 2/3 col */}
        <div className="lg:col-span-2">
          {!selectedId && (
            <div className="border rounded p-8 text-center text-gray-500">
              Click una invocación para ver detalle + chunks del cerebro
            </div>
          )}
          {selectedId && loadingDetail && (
            <div className="border rounded p-8 text-center text-gray-500">Cargando...</div>
          )}
          {selectedId && !loadingDetail && detail && (
            <div className="border rounded p-4 space-y-4">
              <section>
                <h3 className="font-medium mb-2">Invocation metadata</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">agent</dt><dd className="font-mono">{detail.invocation.agent}</dd>
                  <dt className="text-gray-500">client_id</dt><dd className="font-mono text-xs">{detail.invocation.client_id || "(null)"}</dd>
                  <dt className="text-gray-500">model</dt><dd>{detail.invocation.model}</dd>
                  <dt className="text-gray-500">cost_usd</dt><dd>${detail.invocation.cost_usd?.toFixed(6)}</dd>
                  <dt className="text-gray-500">duration_ms</dt><dd>{detail.invocation.duration_ms}</dd>
                  <dt className="text-gray-500">tokens_input/output</dt><dd>{detail.invocation.tokens_input}/{detail.invocation.tokens_output}</dd>
                  <dt className="text-gray-500">started_at</dt><dd>{detail.invocation.started_at}</dd>
                </dl>
                {detail.invocation.task_text_preview && (
                  <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                    <strong>task preview ·</strong> {detail.invocation.task_text_preview}
                  </div>
                )}
              </section>

              <section>
                <h3 className="font-medium mb-2">Brain metadata (historical)</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">brain_hit</dt>
                  <dd>{detail.brain_metadata.brain_hit === true ? "✅ true" : detail.brain_metadata.brain_hit === false ? "❌ false" : "(null)"}</dd>
                  <dt className="text-gray-500">chunks injected</dt>
                  <dd>{detail.brain_metadata.brain_chunks_count ?? "(null)"}</dd>
                  <dt className="text-gray-500">query latency</dt>
                  <dd>{detail.brain_metadata.brain_query_ms ?? "(null)"}ms</dd>
                  <dt className="text-gray-500">brain cost</dt>
                  <dd>${(detail.brain_metadata.brain_cost_usd ?? 0).toFixed(8)}</dd>
                </dl>
              </section>

              <section>
                <h3 className="font-medium mb-2">Live replay · top 5 chunks (current)</h3>
                {detail.live_replay.note && (
                  <p className="text-xs text-gray-500 mb-2 italic">{detail.live_replay.note}</p>
                )}
                {detail.live_replay.error && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">Error · {detail.live_replay.error}</div>
                )}
                {detail.live_replay.chunks && detail.live_replay.chunks.length === 0 && (
                  <div className="text-sm text-gray-500">0 chunks · client tiene 0 chunks en cerebro</div>
                )}
                {detail.live_replay.chunks && detail.live_replay.chunks.length > 0 && (
                  <div className="space-y-2">
                    {detail.live_replay.chunks.map((c, i) => (
                      <div key={c.chunk_id} className="border rounded p-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-gray-600">
                            {i + 1}. {c.source_table} · {c.section_label}
                          </span>
                          <span className="text-green-700 font-medium">
                            sim {(c.similarity * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-gray-700 whitespace-pre-wrap">{c.chunk_text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
