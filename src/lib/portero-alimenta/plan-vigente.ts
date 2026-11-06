import { aprobacionesPorPlan, decisionesDeLaCola, estadoDeLaSalida, vencimientosDeLaCola } from '../cerebro/estado-en-plataforma'

/**
 * ¿Este cliente tiene un plan de 90 días REAL? (05-nov · encargo de Lenovo, para cualquier cliente)
 * Real = no es de prueba Y la plataforma no lo cerró: un plan rechazado, reemplazado o vencido sigue en el historial, pero no cuenta para el alta.
 * La vigencia NO se inventa aquí: es la misma lectura que usa el cerebro (#930/#931) y el retiro de fichas de lo cerrado:
 * la fila (`status` y su etiqueta), la última decisión real en `hitl_queue` y la aprobación más reciente en `plan_aprobaciones`.
 * Solo LEE. Si algo no se puede leer, lo dice (no adivina que hay plan ni que no lo hay).
 */
type Fila = Record<string, unknown>
interface Db { from: (t: string) => any }

const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const esDePrueba = (p: Fila): boolean => esObjeto(p.provenance_tag) && Object.keys(p.provenance_tag).some((k) => k.startsWith('prueba'))

export type PlanesDelCliente =
  | { ok: true; vigentes: string[]; cerrados: Array<{ id: string; motivo: string }> }
  | { ok: false; detalle: string }

export async function planesDeNoventaDias(db: Db, clientId: string): Promise<PlanesDelCliente> {
  const pl = await db.from('client_historical_outputs').select('id, status, provenance_tag').eq('client_id', clientId).eq('output_type', 'campaign_plan_90d').limit(200)
  if (pl.error) return { ok: false, detalle: `client_historical_outputs: ${pl.error.message}` }
  const planes = ((pl.data ?? []) as Fila[]).filter((p) => !esDePrueba(p))
  if (!planes.length) return { ok: true, vigentes: [], cerrados: [] }
  const [cola, aprobaciones] = await Promise.all([
    db.from('hitl_queue').select('output_id, type, status, decision, reviewer, resolved_by, resolved_at, created_at').eq('client_id', clientId),
    db.from('plan_aprobaciones').select('plan_id, estado, version, creado_en').eq('client_id', clientId),
  ])
  if (cola.error) return { ok: false, detalle: `hitl_queue: ${String(cola.error.message ?? cola.error)}` }
  if (aprobaciones.error) return { ok: false, detalle: `plan_aprobaciones: ${String(aprobaciones.error.message ?? aprobaciones.error)}` }
  const filasCola = (cola.data ?? []) as Fila[]
  const decisiones = decisionesDeLaCola(filasCola), vencimientos = vencimientosDeLaCola(filasCola), aprob = aprobacionesPorPlan((aprobaciones.data ?? []) as Fila[])
  const vigentes: string[] = [], cerrados: Array<{ id: string; motivo: string }> = []
  for (const f of planes) {
    const id = String(f.id), d = decisiones.get(id), v = vencimientos.get(id)
    const e = estadoDeLaSalida(f, { decision: d?.decision ?? null, decision_en: d?.en ?? null, decision_por: d?.por ?? null, vencida_en: v?.en ?? null, vencida_por: v?.por ?? null, aprobacion: aprob.get(id) ?? null })
    if (e.cerrada) cerrados.push({ id, motivo: e.motivo ?? e.estado })
    else vigentes.push(id)
  }
  return { ok: true, vigentes, cerrados }
}

/** el motivo de exclusión, en palabras: «sin plan» a secas si nunca hubo, y si los hubo, por qué ninguno cuenta */
export function motivoSinPlan(p: { cerrados: Array<{ motivo: string }> }): string {
  if (!p.cerrados.length) return 'sin plan de 90 días'
  const motivos = [...new Set(p.cerrados.map((c) => c.motivo))].slice(0, 3)
  return `sin plan de 90 días vigente (${p.cerrados.length === 1 ? 'el que hay está cerrado' : `los ${p.cerrados.length} que hay están cerrados`}: ${motivos.join(' · ')})`
}
