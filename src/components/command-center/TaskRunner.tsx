'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * TaskRunner — JARVIS Command Center entry point for Capa 5.
 *
 * Async flow:
 *   1. POST /api/agents/pipeline       → returns { pipeline_id }
 *   2. Poll /api/agents/pipeline/status/{id} every 3s
 *   3. When status is `completed` or `error`, render result and stop
 *
 * Bypasses the Cloudflare 100s hard limit on n8n Cloud webhooks: no single
 * HTTP request is open more than ~1s.
 */

type PipelineStatus = 'pending' | 'running' | 'completed' | 'error'

type StatusResponse = {
  id: string
  task: string
  status: PipelineStatus
  result: unknown
  error: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_DURATION_MS = 10 * 60 * 1000 // 10 minutes safety cap

const EXAMPLE_TASKS = [
  'Genera 3 variantes de ad copy para extintores industriales en Guayaquil',
  'Diseña un funnel de captación para señalización industrial en Quito',
  'Propón un plan de contenido semanal para LinkedIn sobre seguridad ocupacional',
]

function extractMarkdown(result: unknown): string {
  if (result == null) return '_(respuesta vacía)_'
  if (typeof result === 'string') return result

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>
    const candidates = [
      obj.consolidated_output,
      obj.output,
      obj.markdown,
      obj.result,
      obj.response,
      (obj.result as any)?.consolidated_output,
      (obj.result as any)?.output,
      obj.raw,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) return c
    }
    return '```json\n' + JSON.stringify(result, null, 2) + '\n```'
  }

  return String(result)
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${s}s`
}

export function TaskRunner() {
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ duration_ms: number | null } | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    timerRef.current = null
    pollRef.current = null
  }

  useEffect(() => cleanup, [])

  function startTimer() {
    setElapsed(0)
    startedAtRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current)
    }, 250)
  }

  async function pollStatus(pipelineId: string) {
    try {
      const res = await fetch(`/api/agents/pipeline/status/${pipelineId}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Status ${res.status}`)
      }
      const data = (await res.json()) as StatusResponse

      if (data.status === 'completed') {
        cleanup()
        setMarkdown(extractMarkdown(data.result))
        setMeta({ duration_ms: data.duration_ms ?? Date.now() - startedAtRef.current })
        setLoading(false)
        return
      }

      if (data.status === 'error') {
        cleanup()
        setError(data.error || 'El pipeline reportó un error sin detalle.')
        setLoading(false)
        return
      }

      // Still pending/running — safety cap on total wait time
      if (Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) {
        cleanup()
        setError(
          'Timeout: el pipeline tardó más de 10 minutos. Revisa la ejecución en n8n.'
        )
        setLoading(false)
      }
    } catch (err) {
      cleanup()
      const msg = err instanceof Error ? err.message : 'Error de polling'
      setError(`No se pudo consultar el estado: ${msg}`)
      setLoading(false)
    }
  }

  async function runTask(e?: React.FormEvent) {
    e?.preventDefault()
    if (!task.trim() || loading) return

    cleanup()
    setLoading(true)
    setError(null)
    setMarkdown(null)
    setMeta(null)
    startTimer()

    try {
      const res = await fetch('/api/agents/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim() }),
      })

      const data = await res.json()

      if (!res.ok || !data?.pipeline_id) {
        cleanup()
        setError(data?.error || `Error al disparar el pipeline (HTTP ${res.status})`)
        setLoading(false)
        return
      }

      const pipelineId: string = data.pipeline_id

      // Start polling
      // First poll happens after the interval; do an immediate one too.
      pollStatus(pipelineId)
      pollRef.current = setInterval(() => pollStatus(pipelineId), POLL_INTERVAL_MS)
    } catch (err) {
      cleanup()
      const msg = err instanceof Error ? err.message : 'Error de red'
      setError(`No se pudo contactar al backend: ${msg}`)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Task input */}
      <form
        onSubmit={runTask}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <label
          htmlFor="task"
          className="block text-sm font-semibold text-gray-700"
        >
          Tarea para la agencia
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Describe qué necesitas. RUFLO clasifica → Jefe de Marketing delega →
          los empleados ejecutan → se devuelve el resultado consolidado.
        </p>

        <textarea
          id="task"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={loading}
          rows={4}
          maxLength={2000}
          placeholder="Ej: Genera 3 variantes de ad copy para extintores industriales en Guayaquil"
          className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-zero-risk-highlight focus:outline-none focus:ring-2 focus:ring-zero-risk-highlight/20 disabled:bg-gray-50 disabled:text-gray-500"
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">{task.length} / 2000</span>
          <button
            type="submit"
            disabled={loading || !task.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-zero-risk-highlight px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zero-risk-highlight/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                Ejecutando… {formatDuration(elapsed)}
              </>
            ) : (
              <>Ejecutar</>
            )}
          </button>
        </div>

        {!loading && !markdown && !error && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Ejemplos
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLE_TASKS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setTask(ex)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition hover:border-zero-risk-highlight hover:bg-zero-risk-highlight/5 hover:text-zero-risk-highlight"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Loading state */}
      {loading && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Pipeline en ejecución
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Cadena activa: RUFLO → Jefe de Marketing → Empleados →
                Consolidación. La cadena tarda entre 1 y 3 minutos. JARVIS
                consulta el estado cada 3 segundos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-900">Error</p>
          <p className="mt-1 text-xs text-red-700 whitespace-pre-wrap">
            {error}
          </p>
        </div>
      )}

      {/* Result */}
      {markdown && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Resultado consolidado
              </h3>
              <p className="text-xs text-gray-500">
                Generado por el Jefe de Marketing
              </p>
            </div>
            {meta?.duration_ms != null && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                ✓ {formatDuration(meta.duration_ms)}
              </span>
            )}
          </div>

          <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-zero-risk-highlight prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  )
}
