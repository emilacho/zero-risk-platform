import { aprobacionesPorPlan, decisionesDeLaCola, estadoDeLaSalida, vencimientosDeLaCola } from '../cerebro/estado-en-plataforma'

/** el cerebro solo lee; este retiro vive aquí, con quien escribe fichas */
type Fila = Record<string, unknown>
interface Db { from: (t: string) => any }

export interface RetiroDeLoCerrado { retiradas: Array<{ ficha_id: string; ref: string; motivo: string }>; errores: string[] }

/**
 * Una ficha sacada de una salida (`ref = client_historical_outputs:<id>`) no sobrevive a su salida: si la plataforma la rechazó, reemplazó o venció, la ficha se retira sola, con motivo; nada se borra.
 * Si algo no se puede leer no se retira nada: sin certeza del estado no se toca.
 */
export async function retirarFichasDeLoCerrado(db: Db, clientId: string, o: { dryRun: boolean; ahora?: Date }): Promise<RetiroDeLoCerrado> {
  const [salidas, cola, aprobaciones] = await Promise.all([
    db.from('client_historical_outputs').select('id, status, provenance_tag').eq('client_id', clientId),
    db.from('hitl_queue').select('output_id, type, status, decision, reviewer, resolved_by, resolved_at, created_at').eq('client_id', clientId),
    db.from('plan_aprobaciones').select('plan_id, estado, version, creado_en').eq('client_id', clientId),
  ])
  const fallo = salidas.error ?? cola.error ?? aprobaciones.error
  if (fallo) return { retiradas: [], errores: [`estado en la plataforma: ${String(fallo.message ?? fallo)}`] }
  const filasCola = (cola.data ?? []) as Fila[]
  const decisiones = decisionesDeLaCola(filasCola), vencimientos = vencimientosDeLaCola(filasCola), aprob = aprobacionesPorPlan((aprobaciones.data ?? []) as Fila[])
  const motivos = new Map<string, string>()
  for (const f of (salidas.data ?? []) as Fila[]) {
    const id = String(f.id), d = decisiones.get(id)
    const v = vencimientos.get(id)
    const e = estadoDeLaSalida(f, { decision: d?.decision ?? null, decision_en: d?.en ?? null, decision_por: d?.por ?? null, vencida_en: v?.en ?? null, vencida_por: v?.por ?? null, aprobacion: aprob.get(id) ?? null })
    if (e.cerrada && e.motivo) motivos.set(`client_historical_outputs:${id}`, e.motivo)
  }
  if (!motivos.size) return { retiradas: [], errores: [] }
  const fi = await db.from('cerebro_fichas').select('id, ref').eq('client_id', clientId).in('ref', [...motivos.keys()]).is('retirada_en', null)
  if (fi.error) return { retiradas: [], errores: [`cerebro_fichas: ${String(fi.error.message ?? fi.error)}`] }
  const retiradas: RetiroDeLoCerrado['retiradas'] = [], errores: string[] = []
  for (const f of (fi.data ?? []) as Fila[]) {
    const ref = String(f.ref), motivo = motivos.get(ref) as string
    if (!o.dryRun) {
      const u = await db.from('cerebro_fichas').update({ retirada_en: (o.ahora ?? new Date()).toISOString(), motivo_retirada: `la plataforma lo cerró: ${motivo}`.slice(0, 500) }).eq('id', String(f.id)).eq('client_id', clientId)
      if (u.error) { errores.push(`ficha ${String(f.id)}: ${String(u.error.message ?? u.error)}`); continue }
    }
    retiradas.push({ ficha_id: String(f.id), ref, motivo })
  }
  return { retiradas, errores }
}
