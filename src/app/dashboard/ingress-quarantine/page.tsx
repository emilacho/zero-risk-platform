/**
 * Mission Control · HITL panel inerte · ADR-012 §5.3 + R7 polish
 *
 * Spec · ADR-012 §5.3 cuarentena workflow + R7 dashboard security
 *
 * Canon canonical R7 enforcement ·
 *   - Render payload_decrypted en <pre><code> con escape completo
 *   - NO dangerouslySetInnerHTML · NO markdown render activo
 *   - Links en payload renderizados text-only · NUNCA <a> activos
 *   - Imágenes en payload renderizadas como [image: ...] placeholder · NUNCA <img>
 *   - JS/HTML/SVG inline stripped o renderizado como text escapado
 *   - Audit canon canonical · cada action loguea ingress.quarantine.reviewed event
 *
 * Status canon canonical · build phase Sprint 12 · NO consumer real activo
 * hasta APIs/migration apply + canon-canonical-flip §144-per-flip.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// Types · canon canonical mirror ADR-012 §6.2 ingress_quarantine
// ============================================================

interface QuarantineRow {
  id: string
  source: string
  ingress_route: string
  payload_size_bytes: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
  status: 'pending' | 'approved' | 'rejected' | 'expired_unreviewed' | 'escalated'
  client_id: string | null
  workflow_id: string | null
  created_at: string
  expires_at: string
  gate_decisions: Array<{
    capa?: string
    gate?: string
    verdict?: string
    severity?: string
    latency_ms?: number
    reason?: string
  }>
  payload_decrypted?: string
}

interface DecisionInput {
  decision: 'approve' | 'reject' | 'add_deny_pattern'
  reason?: string
  add_pattern?: string
}

// ============================================================
// Inert renderer · canon canonical R7
// ============================================================

/**
 * Canon canonical · render payload as INERT pre/code. NEVER use
 * dangerouslySetInnerHTML. React auto-escapes by default · this canon
 * canonical wraps further in <pre><code> for visual + semantic isolation.
 */
function InertPayloadRender({ payload }: { payload: string }) {
  // Canon canonical · replace common HTML patterns with safe placeholders
  // BEFORE React even sees them · canonical-defense-in-depth.
  const safeText = sanitizeForDisplay(payload)
  return (
    <pre className="whitespace-pre-wrap break-words bg-zinc-900 text-zinc-100 p-4 rounded border border-zinc-700 max-h-96 overflow-auto text-sm">
      <code>{safeText}</code>
    </pre>
  )
}

/**
 * Canon canonical sanitizer · INERT output canonical only.
 *
 * - Replace `<img ...>` con `[image: <attrs>]`
 * - Replace `<script ...>...</script>` con `[script removed]`
 * - Replace `<a href="...">text</a>` con `text [link to: ...]`
 * - Leave other markup canonical canon as escaped text (React escapes
 *   by default when interpolated via {})
 */
function sanitizeForDisplay(raw: string): string {
  let out = raw
  // Canon canonical · images placeholder
  out = out.replace(/<img\b[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/gi, '[image: $1]')
  out = out.replace(/<img\b[^>]*>/gi, '[image: <unspecified>]')
  // Canon canonical · scripts removed visible
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '[script removed]')
  // Canon canonical · style tags removed visible
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, '[style removed]')
  // Canon canonical · iframes removed
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '[iframe removed]')
  // Canon canonical · anchor → text + URL placeholder
  out = out.replace(
    /<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
    '$2 [link to: $1]',
  )
  return out
}

// ============================================================
// Severity badge canon canonical
// ============================================================

function SeverityBadge({ severity }: { severity: QuarantineRow['severity'] }) {
  const colors: Record<QuarantineRow['severity'], string> = {
    LOW: 'bg-zinc-700 text-zinc-200',
    MEDIUM: 'bg-amber-700 text-amber-100',
    HIGH: 'bg-red-700 text-red-100',
    CRITICAL: 'bg-red-900 text-red-100 font-bold',
    UNKNOWN: 'bg-purple-700 text-purple-100',
  }
  return (
    <span className={`px-2 py-1 rounded text-xs font-mono ${colors[severity]}`}>{severity}</span>
  )
}

// ============================================================
// Main page canon canonical
// ============================================================

export default function IngressQuarantinePage() {
  const [rows, setRows] = useState<QuarantineRow[]>([])
  const [selected, setSelected] = useState<QuarantineRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decisionPending, setDecisionPending] = useState(false)
  const [reasonInput, setReasonInput] = useState('')

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ingress-quarantine/list?status=pending&limit=50', {
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`load failed · HTTP ${res.status}`)
      }
      const data = (await res.json()) as { rows: QuarantineRow[] }
      setRows(data.rows ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const submitDecision = useCallback(
    async (input: DecisionInput) => {
      if (!selected) return
      setDecisionPending(true)
      try {
        const res = await fetch(`/api/ingress-quarantine/${selected.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`decide failed · HTTP ${res.status} · ${body}`)
        }
        setSelected(null)
        setReasonInput('')
        await loadRows()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'decision failed')
      } finally {
        setDecisionPending(false)
      }
    },
    [selected, loadRows],
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Ingress Quarantine · HITL Review</h1>
        <p className="text-sm text-zinc-400 mt-1">
          ADR-012 · payloads pending HITL review · canonical R7 inert render · canon canonical NUNCA evaluado.
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm font-mono">
          ⚠ {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List column · canon canonical */}
        <section className="lg:col-span-1 space-y-2">
          <h2 className="text-sm uppercase tracking-wide text-zinc-400">
            Pending · {rows.length}
          </h2>
          {loading && <p className="text-zinc-500 text-sm">Loading...</p>}
          {!loading && rows.length === 0 && (
            <p className="text-zinc-500 text-sm">canon canonical · 0 pending review</p>
          )}
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className={`w-full text-left p-3 rounded border transition ${
                    selected?.id === row.id
                      ? 'bg-zinc-800 border-zinc-500'
                      : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-zinc-400">
                      {row.source}
                    </span>
                    <SeverityBadge severity={row.severity} />
                  </div>
                  <p className="text-xs text-zinc-500 font-mono truncate">{row.id}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {row.payload_size_bytes} bytes ·{' '}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Detail column · canon canonical INERT */}
        <section className="lg:col-span-2">
          {!selected && (
            <p className="text-zinc-500 text-sm">Select a row to review canon canonical.</p>
          )}
          {selected && (
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
                <h3 className="text-sm uppercase tracking-wide text-zinc-400 mb-2">
                  Metadata
                </h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-zinc-500">ID</dt>
                  <dd className="font-mono text-zinc-300 text-xs">{selected.id}</dd>
                  <dt className="text-zinc-500">Source</dt>
                  <dd>{selected.source}</dd>
                  <dt className="text-zinc-500">Route</dt>
                  <dd className="font-mono text-xs">{selected.ingress_route}</dd>
                  <dt className="text-zinc-500">Severity</dt>
                  <dd>
                    <SeverityBadge severity={selected.severity} />
                  </dd>
                  <dt className="text-zinc-500">Client</dt>
                  <dd className="font-mono text-xs">{selected.client_id ?? 'NULL'}</dd>
                  <dt className="text-zinc-500">Workflow</dt>
                  <dd className="font-mono text-xs">{selected.workflow_id ?? 'NULL'}</dd>
                  <dt className="text-zinc-500">Created</dt>
                  <dd className="text-xs">
                    {new Date(selected.created_at).toLocaleString()}
                  </dd>
                  <dt className="text-zinc-500">Expires</dt>
                  <dd className="text-xs">
                    {new Date(selected.expires_at).toLocaleString()}
                  </dd>
                </dl>
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
                <h3 className="text-sm uppercase tracking-wide text-zinc-400 mb-2">
                  Gate decisions
                </h3>
                <ul className="space-y-1 text-xs font-mono">
                  {selected.gate_decisions?.map((g, i) => (
                    <li key={i} className="text-zinc-300">
                      [{g.gate ?? g.capa}] {g.verdict} · {g.severity}{' '}
                      {g.reason && `· ${g.reason}`} · {g.latency_ms}ms
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
                <h3 className="text-sm uppercase tracking-wide text-zinc-400 mb-2">
                  Payload · canon canonical INERT render (R7)
                </h3>
                <p className="text-xs text-zinc-500 mb-2">
                  No HTML/JS/SVG evaluado · enlaces text-only · imágenes placeholder. NUNCA pegar
                  el payload a otros sistemas sin sanitizer.
                </p>
                <InertPayloadRender payload={selected.payload_decrypted ?? '<not decrypted>'} />
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
                <h3 className="text-sm uppercase tracking-wide text-zinc-400 mb-2">
                  Decision · canon canonical §150 G4 audited
                </h3>
                <textarea
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-100 mb-3"
                  rows={2}
                  placeholder="Reason (optional) · short token preferred"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  disabled={decisionPending}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={decisionPending}
                    onClick={() =>
                      void submitDecision({ decision: 'approve', reason: reasonInput })
                    }
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50 text-sm font-mono"
                  >
                    Approve canon
                  </button>
                  <button
                    type="button"
                    disabled={decisionPending}
                    onClick={() =>
                      void submitDecision({ decision: 'reject', reason: reasonInput })
                    }
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50 text-sm font-mono"
                  >
                    Reject canon
                  </button>
                </div>
                {decisionPending && (
                  <p className="text-zinc-400 text-xs mt-2">Submitting decision...</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ============================================================
// Canon canonical · exports for unit tests
// ============================================================

export { sanitizeForDisplay }
