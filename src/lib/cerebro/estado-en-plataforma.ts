/**
 * EL ESTADO EN LA PLATAFORMA MANDA (05-nov) · US$ 0, sin modelo, para cualquier cliente y cualquier salida (plan, parte, pieza, manual).
 * Antes de dar algo como «vigente» o «aprobado», el cerebro mira lo que dice la plataforma:
 *  · la fila (`status`, y en su etiqueta `vigente` · `superseded_por` · la nota de rechazo);
 *  · la cola de revisión (`hitl_queue`): la última decisión del dueño y si la revisión venció;
 *  · la aprobación del plan (`plan_aprobaciones`).
 * Lo rechazado, reemplazado o vencido sigue en el historial, pero nunca es lo vigente. «Aprobado» solo con una aprobación real.
 */
type Fila = Record<string, unknown>

export type EstadoEnPlataforma = 'aprobado' | 'abierto' | 'rechazado' | 'reemplazado' | 'vencido'
export type DecisionDeLaCola = 'aprobada' | 'rechazada' | 'cambio_pedido'

export interface EstadoDeLaSalida {
  estado: EstadoEnPlataforma
  /** rechazada, reemplazada o vencida: no puede ser la vigente */
  cerrada: boolean
  /** por qué está cerrada, en palabras (null si no lo está) */
  motivo: string | null
  /** el rechazo anotado en la propia fila, si lo hay */
  rechazo: { por: string | null; en: string | null; nota: string | null } | null
}
export interface SenalesDeLaSalida {
  /** la última decisión real del dueño en la cola */
  decision?: DecisionDeLaCola | null
  decision_en?: string | null
  /** cuándo venció su revisión más reciente, si venció */
  vencida_en?: string | null
  /** el estado de su aprobación más reciente */
  aprobacion?: string | null
}

const objeto = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const conNota = (base: string, nota: string | null): string => (nota ? `${base}: ${nota}` : base)

/** el rechazo y el reemplazo tal como los deja la plataforma en la etiqueta de una fila (sirve también para un manual, que no tiene `status`) */
function rechazoEnLaEtiqueta(pt: Fila): EstadoDeLaSalida['rechazo'] {
  const por = texto(pt.rechazado_por), en = texto(pt.rechazado_en), nota = texto(pt.nota_de_rechazo)
  return por || en || nota ? { por, en, nota } : null
}
const reemplazadaEnLaEtiqueta = (pt: Fila): boolean => pt.vigente === false || !!texto(pt.superseded_por)

export function estadoDeLaSalida(f: { status?: unknown; provenance_tag?: unknown }, s: SenalesDeLaSalida = {}): EstadoDeLaSalida {
  const pt = objeto(f.provenance_tag)
  const rechazo = rechazoEnLaEtiqueta(pt)
  const cerrar = (estado: EstadoEnPlataforma, motivo: string): EstadoDeLaSalida => ({ estado, cerrada: true, motivo, rechazo })
  const aprobadaPorEstado = f.status === 'approved' || f.status === 'published'
  if (f.status === 'rejected') return cerrar('rechazado', conNota('rechazado en la plataforma', rechazo?.nota ?? null))
  if (reemplazadaEnLaEtiqueta(pt) || s.aprobacion === 'reemplazado') return cerrar('reemplazado', 'reemplazado por una versión más nueva')
  const vencioDespues = !!s.vencida_en && (!s.decision_en || s.vencida_en > s.decision_en)
  if (s.decision === 'rechazada' && !vencioDespues) return cerrar('rechazado', 'rechazado por el dueño en la revisión')
  if (vencioDespues && !aprobadaPorEstado) return cerrar('vencido', 'su revisión venció sin aprobación')
  if (s.aprobacion === 'cambios_pedidos') return { estado: 'abierto', cerrada: false, motivo: null, rechazo }
  const aprobada = s.decision ? s.decision === 'aprobada' : s.aprobacion === 'aprobado' || aprobadaPorEstado
  return { estado: aprobada ? 'aprobado' : 'abierto', cerrada: false, motivo: null, rechazo }
}

/** un manual no tiene `status`: su cierre solo puede venir de la etiqueta */
export function manualCerrado(f: { provenance_tag?: unknown }): boolean {
  const pt = objeto(f.provenance_tag)
  return !!rechazoEnLaEtiqueta(pt) || reemplazadaEnLaEtiqueta(pt)
}

const DECISION: Record<string, DecisionDeLaCola> = { approved: 'aprobada', rejected: 'rechazada', edited: 'cambio_pedido' }
const fechaDe = (f: Fila): string => {
  const t = Date.parse(String(f.resolved_at ?? f.created_at ?? ''))
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}
/** de la cola: cuándo venció la revisión más reciente de cada salida */
export function vencimientosDeLaCola(cola: Fila[]): Map<string, string> {
  const salida = new Map<string, string>()
  for (const f of cola) {
    const id = f.output_id === null || f.output_id === undefined ? '' : String(f.output_id)
    if (!id || objeto(f.decision).vencida !== true) continue
    const fecha = fechaDe(f)
    if (fecha >= (salida.get(id) ?? '')) salida.set(id, fecha)
  }
  return salida
}
/** de las aprobaciones de plan: el estado de la más reciente de cada plan */
export function aprobacionesPorPlan(filas: Fila[]): Map<string, string> {
  const orden = [...filas].sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0) || (String(a.creado_en ?? '') < String(b.creado_en ?? '') ? -1 : 1))
  const salida = new Map<string, string>()
  for (const f of orden) if (f.plan_id && typeof f.estado === 'string') salida.set(String(f.plan_id), f.estado)
  return salida
}
/** de la cola: la última decisión real del dueño sobre cada salida (lo vencido no es una decisión) */
export function decisionesDeLaCola(cola: Fila[]): Map<string, { decision: DecisionDeLaCola; en: string }> {
  const salida = new Map<string, { decision: DecisionDeLaCola; en: string }>()
  for (const f of cola) {
    const id = f.output_id === null || f.output_id === undefined ? '' : String(f.output_id)
    const decision = DECISION[String(f.status)]
    if (!id || !decision || objeto(f.decision).vencida === true) continue
    const en = fechaDe(f)
    if (en >= (salida.get(id)?.en ?? '')) salida.set(id, { decision, en })
  }
  return salida
}
