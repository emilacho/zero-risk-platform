/**
 * LA BANDEJA ÚNICA (CC#3 · 19-oct · arreglo 3 de «arreglos de la cadena 1-5»).
 *
 * Había TRES bandejas: `hitl_queue` (la oficina, la planeación, el borrador del manual), `hitl_pending_approvals` (las compuertas de n8n y la escalada del editor) y `hitl_approvals`
 * (lo que lee el tablero de Emilio y el resumen del pipeline). Lo que la oficina dejaba para aprobar no aparecía en el tablero. La elegida es **`hitl_queue`**: es la más completa
 * (pieza ligada por `output_id`, continuación, tipo, título, prioridad, carga, metadatos, decisión), la única con filas reales y la que ya escriben la oficina, la planeación y `/api/hitl/queue`.
 * Las otras dos quedan SOLO LECTURA (migración `202610191900_bandeja_unica_viejas_solo_lectura.sql`).
 *
 * Este módulo es el único sitio que sabe traducir entre la forma de una aprobación de las rutas viejas (`item_id`, `approval_type`, `required_approver`, `agent_slug`, `editor_verdict`…) y
 * una fila de `hitl_queue`, para que las rutas conserven EXACTAMENTE su forma de respuesta y ningún flujo de n8n se entere del cambio.
 * Reglas del catálogo (comprobadas el 09-oct): `hitl_queue.status` solo admite pending · approved · rejected · edited. Lo que antes era «expired» se guarda como `rejected` con
 * `decision.vencida = true`; «notified» como `pending` con `metadata.notificado_en`.
 * Puro salvo las funciones que reciben `db` (un cliente de Supabase).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const TABLA_BANDEJA = 'hitl_queue'
export type EstadoDeCola = 'pending' | 'approved' | 'rejected' | 'edited'
export type EstadoLegado = 'pending' | 'notified' | 'approved' | 'rejected' | 'expired'
export type Fila = Record<string, unknown>
type Db = Pick<SupabaseClient, 'from'>

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (x: unknown): x is string => typeof x === 'string' && RE_UUID.test(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null)
const objeto = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const PRIORIDADES = new Set(['low', 'medium', 'high', 'critical'])
export const HORAS_POR_OMISION = 72

/** lo que las rutas viejas aceptaban para crear una aprobación */
export interface EntradaDeAprobacion {
  approval_type?: string | null
  required_approver?: string | null
  escalation_path?: string | null
  request_id?: string | null
  client_id?: string | null
  phase?: string | null
  priority?: string | null
  payload?: unknown
  agent_slug?: string | null
  preview?: string | null
  full_content?: string | null
  editor_verdict?: unknown
  revisions_attempted?: number | null
  original_task?: string | null
  /** ISO; sin él, ahora + 72 h */
  expires_at?: string | null
  /** quién la dejó: `workflow` (compuerta de n8n), `editor` (escalada del editor), `escalada`… para que el vigía de la oficina no toque lo ajeno */
  origen?: string
}

/** una aprobación en la forma que devolvían las rutas viejas (`hitl_pending_approvals`) */
export interface AprobacionLegada {
  item_id: string
  approval_type: string
  required_approver: string
  escalation_path: string | null
  request_id: string | null
  client_id: string | null
  phase: string | null
  priority: string
  payload: unknown
  status: EstadoLegado
  approved_by: string | null
  approved_at: string | null
  last_notified_at: string | null
  created_at: string
  expires_at: string | null
  agent_slug: string | null
  editor_verdict: unknown
  revisions_attempted: number
  original_task: string | null
  preview: string | null
  full_content: string | null
  resolved_at: string | null
  resolver: string | null
}

/** la fila de `hitl_queue` que corresponde a una aprobación (la columna `client_id` es uuid: lo que no lo sea se guarda en `metadata.client_ref`, nunca se pierde) */
export function filaDeCola(e: EntradaDeAprobacion, ahora: Date = new Date()): Fila {
  const tipo = texto(e.approval_type) ?? 'generic_approval'
  const cliente = texto(e.client_id)
  const payload = e.payload && typeof e.payload === 'object' ? e.payload : {}
  const editor: Record<string, unknown> = {}
  if (texto(e.full_content)) editor.full_content = e.full_content
  if (e.editor_verdict !== undefined && e.editor_verdict !== null) editor.editor_verdict = e.editor_verdict
  if (typeof e.revisions_attempted === 'number') editor.revisions_attempted = e.revisions_attempted
  if (texto(e.original_task)) editor.original_task = e.original_task
  const vista = texto(e.preview) ?? (Object.keys(objeto(payload)).length ? JSON.stringify(payload).slice(0, 500) : tipo)
  return {
    client_id: esUuid(cliente) ? cliente : null,
    agent_name: texto(e.agent_slug) ?? 'workflow',
    risk_type: tipo,
    type: tipo,
    title: texto(e.agent_slug) ? `${tipo} · ${e.agent_slug}` : tipo,
    output_preview: vista,
    review_context: texto(e.original_task),
    priority: PRIORIDADES.has(String(e.priority)) ? String(e.priority) : 'medium',
    payload,
    metadata: {
      origen: e.origen ?? 'workflow',
      required_approver: texto(e.required_approver) ?? 'emilio',
      ...(texto(e.escalation_path) ? { escalation_path: e.escalation_path } : {}),
      ...(texto(e.request_id) ? { request_id: e.request_id } : {}),
      ...(texto(e.phase) ? { phase: e.phase } : {}),
      ...(cliente && !esUuid(cliente) ? { client_ref: cliente } : {}),
      ...(Object.keys(editor).length ? { editor } : {}),
    },
    status: 'pending',
    expires_at: texto(e.expires_at) ?? new Date(ahora.getTime() + HORAS_POR_OMISION * 3600e3).toISOString(),
  }
}

/** el estado que las rutas viejas hablaban, a partir de la fila de la cola */
export function estadoLegado(f: Fila): EstadoLegado {
  const s = String(f.status ?? 'pending')
  if (s === 'approved' || s === 'edited') return 'approved'
  if (s === 'rejected') return objeto(f.decision).vencida === true ? 'expired' : 'rejected'
  return objeto(f.metadata).notificado_en ? 'notified' : 'pending'
}

/** una fila de `hitl_queue` con la forma de la aprobación vieja (lo que devolvían `/pending`, `/mc/pending` y `/hitl/pending`) */
export function aprobacionLegada(f: Fila): AprobacionLegada {
  const m = objeto(f.metadata)
  const editor = objeto(m.editor)
  return {
    item_id: String(f.id),
    approval_type: texto(f.type) ?? texto(f.risk_type) ?? 'generic_approval',
    required_approver: texto(m.required_approver) ?? 'emilio',
    escalation_path: texto(m.escalation_path),
    request_id: texto(m.request_id),
    client_id: texto(f.client_id) ?? texto(m.client_ref),
    phase: texto(m.phase),
    priority: texto(f.priority) ?? 'medium',
    payload: f.payload ?? {},
    status: estadoLegado(f),
    approved_by: texto(f.resolved_by),
    approved_at: texto(f.resolved_at),
    last_notified_at: texto(m.notificado_en),
    created_at: String(f.created_at ?? ''),
    expires_at: texto(f.expires_at),
    agent_slug: texto(f.agent_name) === 'workflow' ? null : texto(f.agent_name),
    editor_verdict: editor.editor_verdict ?? null,
    revisions_attempted: typeof editor.revisions_attempted === 'number' ? editor.revisions_attempted : 0,
    original_task: texto(editor.original_task) ?? texto(f.review_context),
    preview: texto(f.output_preview),
    full_content: texto(editor.full_content),
    resolved_at: texto(f.resolved_at),
    resolver: texto(f.resolved_by),
  }
}

// ───────────────────────────────────────────────────────── con la base
export async function crearAprobacion(db: Db, e: EntradaDeAprobacion, ahora: Date = new Date()): Promise<{ id: string | null; expires_at: string; error: string | null }> {
  const fila = filaDeCola(e, ahora)
  const r = (await db.from(TABLA_BANDEJA).insert(fila).select('id,expires_at').single()) as { data: Fila | null; error: { message: string } | null }
  return { id: r.data ? String(r.data.id) : null, expires_at: String(r.data?.expires_at ?? fila.expires_at), error: r.error?.message ?? null }
}

export interface FiltroDePendientes {
  estado?: string; limite?: number; clienteId?: string | null; soloOrigen?: string | null
  /** 31-oct (T3): las tarjetas «Gran idea» de la cadena (`metadata.tipo = 'concepto'`) NO salen en la bandeja de piezas (se deciden por `/api/cadena/concepto`); solo con `true` se incluyen */
  incluirConceptos?: boolean
}
/** 31-oct (T3): la tarjeta de la gran idea de la cadena (no es una pieza: ni se aprueba por PATCH ni vence) */
export const esTarjetaDeConcepto = (x: { metadata?: unknown }): boolean => { const m = x.metadata; return !!m && typeof m === 'object' && !Array.isArray(m) && (m as { tipo?: unknown }).tipo === 'concepto' && (m as { origen?: unknown }).origen === 'cadena' }
/** la lista de la bandeja con el vocabulario viejo de estados: `pending`, `approved`, `rejected`, `expired` (rechazada por vencimiento), `notified` y `all` */
export async function listarAprobaciones(db: Db, f: FiltroDePendientes = {}): Promise<{ filas: Fila[]; error: string | null }> {
  const estado = f.estado ?? 'pending'
  const limite = Math.max(1, Math.min(f.limite ?? 100, 500))
  let q = db.from(TABLA_BANDEJA).select('*').order('created_at', { ascending: true }).limit(limite)
  if (estado === 'pending' || estado === 'notified') q = q.eq('status', 'pending')
  else if (estado === 'approved') q = q.in('status', ['approved', 'edited'])
  else if (estado === 'rejected' || estado === 'expired') q = q.eq('status', 'rejected')
  else if (estado !== 'all') q = q.eq('status', estado)
  const cliente = texto(f.clienteId)
  if (cliente) q = esUuid(cliente) ? q.eq('client_id', cliente) : q.eq('metadata->>client_ref', cliente)
  if (f.soloOrigen) q = q.eq('metadata->>origen', f.soloOrigen)
  const r = (await q) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) return { filas: [], error: r.error.message }
  // «expired» y «notified» no existen en la tabla: se separan aquí. «pending» incluye a las ya avisadas (siguen esperando); «rejected» no incluye a las vencidas.
  const filas = (r.data ?? []).filter((x) => {
    if (!f.incluirConceptos && esTarjetaDeConcepto(x as { metadata?: unknown })) return false
    const e = estadoLegado(x)
    if (estado === 'all') return true
    if (estado === 'pending') return e === 'pending' || e === 'notified'
    return e === estado || !['approved', 'rejected', 'expired', 'notified'].includes(estado)
  })
  return { filas, error: null }
}

export interface ResolverEntrada { decision: 'approved' | 'rejected'; quien?: string | null; ahora?: Date; vencida?: boolean; nota?: string | null }
/** marca una aprobación como resuelta (la forma de `/submit-approval`: sin condición, igual que la ruta vieja) */
export async function resolverAprobacion(db: Db, id: string, r: ResolverEntrada): Promise<{ error: string | null }> {
  const ahora = (r.ahora ?? new Date()).toISOString()
  const quien = texto(r.quien) ?? 'emilio'
  const cambios: Fila = {
    status: r.decision, resolved_by: quien, reviewer: quien, resolved_at: ahora, decided_at: ahora,
    decision: { decision: r.decision, por: quien, cuando: ahora, ...(r.vencida ? { vencida: true } : {}) },
    ...(texto(r.nota) ? { resolution_notes: r.nota } : {}),
  }
  const u = (await db.from(TABLA_BANDEJA).update(cambios).eq('id', id)) as { error: { message: string } | null }
  return { error: u.error?.message ?? null }
}

/** cuántas hay pendientes (para el resumen del pipeline), con el cliente opcional */
export async function contarPendientes(db: Db, clienteId?: string | null): Promise<{ n: number; error: string | null }> {
  let q = db.from(TABLA_BANDEJA).select('id', { count: 'exact', head: true }).eq('status', 'pending')
  const c = texto(clienteId)
  if (c) q = esUuid(c) ? q.eq('client_id', c) : q.eq('metadata->>client_ref', c)
  const r = (await q) as { count: number | null; error: { message: string } | null }
  return { n: r.count ?? 0, error: r.error?.message ?? null }
}
