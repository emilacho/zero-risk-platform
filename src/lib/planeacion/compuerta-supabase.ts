/**
 * Lectura de la compuerta del plan sobre `dueno_preguntas` (la lista de la PLATAFORMA · 06-nov: las preguntas salieron del cerebro) · solo lectura.
 * 06-nov · 🔴 de CC7 en #939: la puerta del dueño NO crea fila cuando la pregunta ya está pendiente (la misma oficina: «repetida»; otra oficina: «ya preguntada»),
 * y otros llamadores (buzón diario, conversa, tablero) guardan otro flujo. En un relanzamiento, la pregunta pendiente queda con la ejecución VIEJA y una lectura
 * solo por esta ejecución diría «sigue» con el dueño sin contestar. Por eso se leen DOS cosas y se unen:
 *  1. lo que hicieron las ejecuciones de esta corrida (cualquier estado: así se ve lo cerrado y lo asumido);
 *  2. TODA pregunta PENDIENTE del cliente creada en la misma ventana en que la puerta la da por viva (72 h), venga del flujo que venga.
 * Es más estricto, nunca más laxo: una pendiente ajena al plan también lo hace esperar, y el dueño la suelta con contestar, asumir o descartar.
 * Una lectura que se recortaría LANZA (falla cerrada): recortar en silencio es justo lo que haría seguir al redactor.
 */
import type { EntradaDeLaCompuerta, PreguntaDelPlan, PuertoDeLaCompuerta } from './compuerta'
import { HORAS_DE_UNA_PREGUNTA_PENDIENTE, TABLA } from '../dueno-preguntas/preguntas'

type Db = { from(tabla: string): any }
const t = (v: unknown) => (typeof v === 'string' ? v : null)
export const MAX_FILAS_DE_LA_COMPUERTA = 500

function aPregunta(f: Record<string, unknown>): PreguntaDelPlan {
  return {
    id: String(f.id), tema: String(f.tema ?? ''), pregunta: String(f.pregunta ?? ''), estado: String(f.estado ?? ''),
    oficina: t(f.oficina), motivo_descarte: t(f.motivo),
    supuesto: t(f.supuesto), asumida_en: f.estado === 'asumida' ? t(f.decidido_en) : null,
  }
}

function filas(r: { data: unknown; error: { message: string } | null }, que: string): Array<Record<string, unknown>> {
  if (r.error) throw new Error(`no pude leer ${que}: ${r.error.message}`)
  const d = (r.data as Array<Record<string, unknown>> | null) ?? []
  if (d.length > MAX_FILAS_DE_LA_COMPUERTA) throw new Error(`${que}: más de ${MAX_FILAS_DE_LA_COMPUERTA} filas; no se recorta en silencio`)
  return d
}

export function compuertaDeSupabase(db: Db, ahora: () => Date = () => new Date()): PuertoDeLaCompuerta {
  return {
    async preguntasDeLaCorrida(e: EntradaDeLaCompuerta): Promise<PreguntaDelPlan[]> {
      const deLaCorrida = filas(await db.from(TABLA).select('*').eq('client_id', e.client_id).eq('workflow_id', e.workflow_id).in('workflow_execution_id', e.workflow_execution_ids).limit(MAX_FILAS_DE_LA_COMPUERTA + 1), 'las preguntas de la corrida')
      const hace = new Date(ahora().getTime() - HORAS_DE_UNA_PREGUNTA_PENDIENTE * 3_600_000).toISOString()
      const pendientes = filas(await db.from(TABLA).select('*').eq('client_id', e.client_id).eq('estado', 'pendiente').gte('creado_en', hace).limit(MAX_FILAS_DE_LA_COMPUERTA + 1), 'las preguntas pendientes del cliente')
      const vistas = new Set<string>()
      return [...deLaCorrida, ...pendientes].filter((f) => !vistas.has(String(f.id)) && (vistas.add(String(f.id)), true)).map(aPregunta)
    },
  }
}
