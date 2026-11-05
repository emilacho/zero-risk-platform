/**
 * EL ESTADO EN LA PLATAFORMA MANDA (05-nov) · US$ 0, sin modelo, para cualquier cliente y cualquier salida (plan, parte, pieza, manual).
 * Antes de dar algo como «vigente» o «aprobado», el cerebro mira lo que dice la plataforma:
 *  · la fila (`status`, y en su etiqueta `vigente` · `superseded_por` · la nota de rechazo);
 *  · la cola de revisión (`hitl_queue`): la última decisión del dueño y si la revisión venció;
 *  · la aprobación del plan (`plan_aprobaciones`).
 * Lo rechazado, reemplazado o vencido sigue en el historial, pero nunca es lo vigente. «Aprobado» solo con una aprobación real.
 * Solo una decisión real saca algo de vigente, y el motivo dice quién decidió: una limpieza o una fila superada no es una decisión, y la decisión sobre una sola parte no decide la salida entera.
 */
import type { Ficha } from './tipos'

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
  /** quién tomó esa decisión, tal como quedó registrado */
  decision_por?: string | null
  /** cuándo venció su revisión más reciente, si venció */
  vencida_en?: string | null
  /** quién cerró esa revisión vencida */
  vencida_por?: string | null
  /** el estado de su aprobación más reciente */
  aprobacion?: string | null
}

const objeto = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const conNota = (base: string, nota: string | null): string => (nota ? `${base}: ${nota}` : base)
const conAutor = (base: string, por: string | null | undefined): string => (por ? `${base} por ${por}` : base)

/** el rechazo y el reemplazo tal como los deja la plataforma en la etiqueta de una fila (sirve también para un manual, que no tiene `status`) */
function rechazoEnLaEtiqueta(pt: Fila): EstadoDeLaSalida['rechazo'] {
  const por = texto(pt.rechazado_por), en = texto(pt.rechazado_en), nota = texto(pt.nota_de_rechazo)
  return por || en || nota ? { por, en, nota } : null
}
const reemplazadaEnLaEtiqueta = (pt: Fila): boolean => pt.vigente === false || !!texto(pt.superseded_por)

/** una fila marcada así no recoge una decisión de nadie: limpieza, archivo o una versión superada */
function marcadaSinDecision(marcas: Fila): boolean {
  return marcas.superada === true || marcas.archivada === true || Object.keys(marcas).some((k) => k.startsWith('no_es_decision') && marcas[k] === true)
}
/** tipos de revisión que deciden sobre UNA parte de la salida, no sobre la salida entera */
const TIPOS_DE_UNA_PARTE = new Set(['palabra_del_dueno'])
export const esDeUnaParte = (f: Fila): boolean => TIPOS_DE_UNA_PARTE.has(String(f.type))

/** quién resolvió una fila de la cola, tal como quedó registrado */
export function quienResolvio(f: Fila): string | null {
  return texto(objeto(f.decision).por) ?? texto(f.resolved_by) ?? texto(f.reviewer)
}
/** ¿la fila recoge una decisión o un vencimiento reales? Una limpieza no es ninguna de las dos */
export function filaConDecisionReal(f: Fila): boolean {
  if (marcadaSinDecision(objeto(f.decision))) return false
  return ![objeto(f.decision).por, f.resolved_by, f.reviewer].some((q) => /limpieza/i.test(texto(q) ?? ''))
}

export function estadoDeLaSalida(f: { status?: unknown; provenance_tag?: unknown }, s: SenalesDeLaSalida = {}): EstadoDeLaSalida {
  const pt = objeto(f.provenance_tag)
  const rechazo = rechazoEnLaEtiqueta(pt)
  const cerrar = (estado: EstadoEnPlataforma, motivo: string): EstadoDeLaSalida => ({ estado, cerrada: true, motivo, rechazo })
  const aprobadaPorEstado = f.status === 'approved' || f.status === 'published'
  if (f.status === 'rejected' && !marcadaSinDecision(pt)) return cerrar('rechazado', conNota(conAutor('rechazado en la plataforma', rechazo?.por ?? null), rechazo?.nota ?? null))
  if (reemplazadaEnLaEtiqueta(pt) || s.aprobacion === 'reemplazado') return cerrar('reemplazado', 'reemplazado por una versión más nueva')
  const vencioDespues = !!s.vencida_en && (!s.decision_en || s.vencida_en > s.decision_en)
  if (s.decision === 'rechazada' && !vencioDespues) return cerrar('rechazado', conAutor('rechazado en la revisión', s.decision_por))
  if (vencioDespues && !aprobadaPorEstado) return cerrar('vencido', s.vencida_por ? `su revisión venció sin aprobación; la cerró ${s.vencida_por}` : 'su revisión venció sin aprobación')
  if (s.aprobacion === 'cambios_pedidos') return { estado: 'abierto', cerrada: false, motivo: null, rechazo }
  const aprobada = s.decision ? s.decision === 'aprobada' : s.aprobacion === 'aprobado' || aprobadaPorEstado
  return { estado: aprobada ? 'aprobado' : 'abierto', cerrada: false, motivo: null, rechazo }
}

/** un manual no tiene `status`: su cierre solo puede venir de la etiqueta */
export function manualCerrado(f: { provenance_tag?: unknown }): boolean {
  const pt = objeto(f.provenance_tag)
  return manualRechazado(f) || reemplazadaEnLaEtiqueta(pt)
}
/** por qué un manual rechazado no es vigente, en palabras */
export function motivoDelManualRechazado(f: { provenance_tag?: unknown }): string {
  const r = rechazoEnLaEtiqueta(objeto(f.provenance_tag))
  return conNota(conAutor('rechazado', r?.por), r?.nota ?? null)
}
/** el manual lo rechazó alguien de verdad (reemplazado no es rechazado) */
export function manualRechazado(f: { provenance_tag?: unknown }): boolean {
  const pt = objeto(f.provenance_tag)
  return !!rechazoEnLaEtiqueta(pt) && !marcadaSinDecision(pt)
}

const DECISION: Record<string, DecisionDeLaCola> = { approved: 'aprobada', rejected: 'rechazada', edited: 'cambio_pedido' }
const fechaDe = (f: Fila): string => {
  const t = Date.parse(String(f.resolved_at ?? f.created_at ?? ''))
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}
/** de la cola: cuándo venció la revisión más reciente de cada salida */
export function vencimientosDeLaCola(cola: Fila[]): Map<string, { en: string; por: string | null }> {
  const salida = new Map<string, { en: string; por: string | null }>()
  for (const f of cola) {
    const id = f.output_id === null || f.output_id === undefined ? '' : String(f.output_id)
    if (!id || objeto(f.decision).vencida !== true || !filaConDecisionReal(f) || esDeUnaParte(f)) continue
    const fecha = fechaDe(f)
    if (fecha >= (salida.get(id)?.en ?? '')) salida.set(id, { en: fecha, por: quienResolvio(f) })
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
export function decisionesDeLaCola(cola: Fila[]): Map<string, { decision: DecisionDeLaCola; en: string; por: string | null }> {
  const salida = new Map<string, { decision: DecisionDeLaCola; en: string; por: string | null }>()
  for (const f of cola) {
    const id = f.output_id === null || f.output_id === undefined ? '' : String(f.output_id)
    const decision = DECISION[String(f.status)]
    if (!id || !decision || objeto(f.decision).vencida === true || !filaConDecisionReal(f) || esDeUnaParte(f)) continue
    const en = fechaDe(f)
    if (en >= (salida.get(id)?.en ?? '')) salida.set(id, { decision, en, por: quienResolvio(f) })
  }
  return salida
}

const MARCA_NO_VIGENTE = 'NO VIGENTE'
/** el aviso de frescura de la fuente: en lo que ya no está vigente solo confunde */
const AVISO_DE_FRESCURA = /VENCIDO desde .*?verifícalo antes de afirmarlo( · )?/
/** lo que una línea dice de su no vigencia, desde la marca; null si la línea no la lleva */
export function avisoNoVigente(f: Pick<Ficha, 'aviso'>): string | null {
  const i = f.aviso ? f.aviso.indexOf(MARCA_NO_VIGENTE) : -1
  return i >= 0 ? (f.aviso as string).slice(i) : null
}
/**
 * Regla general para toda línea, de cualquier fuente: lo que no está vigente no muestra plazo de frescura («vigente hasta» o «VENCIDO desde» hablan de la fuente, no de esto)
 * y lleva «NO VIGENTE» con su motivo. Las líneas sin versión no se tocan: su vigencia es solo la de su plazo.
 */
export function sinPlazoLoNoVigente(f: Ficha): Ficha {
  if (f.vigente !== false && f.reemplazada !== true) return f
  const motivo = f.reemplazada === true ? 'reemplazado por una versión más nueva' : f.valida === false ? 'marcado como no válido' : 'no es la versión vigente'
  const resto = (f.aviso ?? '').replace(AVISO_DE_FRESCURA, '').replace(/( · )$/, '')
  const aviso = resto.includes(MARCA_NO_VIGENTE) ? resto : [`${MARCA_NO_VIGENTE} · ${motivo}`, resto].filter(Boolean).join(' · ')
  return { ...f, vigente_hasta: null, vencido: false, aviso }
}
