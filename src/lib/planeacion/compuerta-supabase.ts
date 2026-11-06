/** lectura de la compuerta del plan sobre `cerebro_dueno_preguntas` · solo lectura */
import type { EntradaDeLaCompuerta, PreguntaDelPlan, PuertoDeLaCompuerta } from './compuerta'

type Db = { from(tabla: string): any }
const t = (v: unknown) => (typeof v === 'string' ? v : null)

export function compuertaDeSupabase(db: Db): PuertoDeLaCompuerta {
  return {
    async preguntasDeLaCorrida(e: EntradaDeLaCompuerta): Promise<PreguntaDelPlan[]> {
      // `*`: el supuesto lo agrega Cerebro con «asumida»; pedir una columna que aún no existe rompería la lectura
      const r = await db.from('cerebro_dueno_preguntas').select('*').eq('client_id', e.client_id).eq('workflow_id', e.workflow_id).in('workflow_execution_id', e.workflow_execution_ids).limit(500)
      if (r.error) throw new Error(`no pude leer las preguntas de la corrida: ${r.error.message}`)
      return ((r.data as Array<Record<string, unknown>> | null) ?? []).map((f) => ({
        id: String(f.id), tema: String(f.tema ?? ''), pregunta: String(f.pregunta ?? ''), estado: String(f.estado ?? ''),
        oficina: t(f.preguntado_por_oficina), motivo_descarte: t(f.motivo_descarte),
        supuesto: t(f.supuesto_asumido) ?? t(f.supuesto), asumida_en: t(f.asumida_en),
      }))
    },
  }
}
