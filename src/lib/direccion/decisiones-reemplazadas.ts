/**
 * SOLO LO VIGENTE PIDE FIRMA (01-nov · firma de Emilio). Una decisión pendiente de un plan reemplazado o de una pieza hecha para el plan anterior ya no espera a nadie.
 * Aquí vive solo la regla y la lectura: el reloj de la oficina es quien las cierra (`oficina/cerrar-decisiones-reemplazadas`). Lo que no se pueda leer sigue a la vista del dueño.
 */
import { TIPO_PLAN } from '../oficina/tablero/plan'
import { esObjeto, texto, type Fila } from './comun'

const TIPOS_DE_PIEZA = new Set(['content_piece_review', 'concepto_review'])

export interface PlanVigente { id: string; creado_en: string; hay_anteriores: boolean }
export interface PlanDelCliente { id: unknown; client_id: unknown; status?: unknown; provenance_tag?: unknown; created_at: unknown }

/** el vigente de cada cliente: el más nuevo que no esté rechazado, marcado como reemplazado ni sea de ensayo */
export function planesVigentes(planes: PlanDelCliente[]): Map<string, PlanVigente> {
  const porCliente = new Map<string, PlanDelCliente[]>()
  for (const p of planes) {
    const c = texto(p.client_id)
    if (c) porCliente.set(c, [...(porCliente.get(c) ?? []), p])
  }
  const salida = new Map<string, PlanVigente>()
  for (const [cliente, todos] of porCliente) {
    const reales = todos.filter((p) => p.status !== 'rejected' && !(esObjeto(p.provenance_tag) && p.provenance_tag.dry_run === true))
    const validos = reales.filter((p) => !(esObjeto(p.provenance_tag) && (p.provenance_tag.vigente === false || p.provenance_tag.superseded_por)))
    const u = [...validos].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    if (u) salida.set(cliente, { id: String(u.id), creado_en: String(u.created_at), hay_anteriores: reales.length > 1 })
  }
  return salida
}

const planDeLaFila = (f: Fila): string | null => texto(f.output_id) ?? (esObjeto(f.payload) ? texto(f.payload.plan_id) : null)

/** por qué esta decisión ya no espera a nadie; null = sigue viva */
export function motivoDeReemplazo(f: Fila, vigentes: Map<string, PlanVigente>): string | null {
  const tipo = String(f.type ?? '')
  const cliente = texto(f.client_id)
  const vigente = cliente ? vigentes.get(cliente) : undefined
  if (!vigente) return null
  if (tipo === 'plan_con_pendientes') {
    const plan = planDeLaFila(f)
    return plan && plan !== vigente.id ? 'ese plan ya fue reemplazado por una versión más nueva' : null
  }
  if (TIPOS_DE_PIEZA.has(tipo) && vigente.hay_anteriores && String(f.created_at) < vigente.creado_en) return 'se hizo para el plan anterior'
  return null
}

interface Lectura { data: unknown; error: { message: string } | null }
interface Consulta extends PromiseLike<Lectura> { eq(c: string, v: unknown): Consulta; in(c: string, v: unknown[]): Consulta; limit(n: number): Consulta }
interface Db { from(t: string): { select(c: string): Consulta } }

/** los vigentes de estos clientes, o null si no se pudo leer (entonces nadie cierra ni esconde nada) */
export async function leerPlanesVigentes(db: unknown, clientes: string[]): Promise<Map<string, PlanVigente> | null> {
  if (!clientes.length) return new Map()
  const r = await (db as Db).from('client_historical_outputs').select('id, client_id, status, provenance_tag, created_at').eq('output_type', TIPO_PLAN).in('client_id', clientes).limit(1000)
  if (r.error) return null
  return planesVigentes((r.data as PlanDelCliente[] | null) ?? [])
}
