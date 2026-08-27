/**
 * CANARIO · invocaciones sin identificador de corrida · instrumento (1) ·
 * firmado por el Arquitecto 2026-08-27 09:14:29 UTC.
 *
 * QUÉ ES · un contador. Cuenta las filas de `agent_invocations` que tienen
 * `workflow_execution_id` en NULO.
 *
 * POR QUÉ SIRVE SIN DISEÑO NUEVO · la línea base está medida y es exacta:
 * **0 nulos en 96 de 96 filas de toda la historia** (CC#1 · 2026-08-27) ⇒
 * **cualquier valor mayor que cero es señal, no ruido.** No hay umbral que
 * calibrar ni ventana que discutir.
 *
 * 🔴 LO QUE NO HACE, dicho para que nadie le pida de más ·
 * **NO desambigua el estado D** (una corrida cuyo identificador no calza con
 * ninguna fila). El Arquitecto lo explicó y conviene no re-descubrirlo:
 *
 *   > "El freno LEE el registro ANTES de escribir en él. Para la invocación #1
 *    la fila todavía no existe, por definición. El cero legítimo y el cero roto
 *    son idénticos vistos desde ahí. No es un bug: es la consecuencia de medir
 *    antes de anotar."
 *
 * Este canario **hace visible la corrupción en el momento en que aparece** —
 * que es otra cosa, y es la que se puede tener hoy. **No toca la vara.**
 *
 * §148 honesto · si la cuenta NO se puede hacer, devuelve `nulos: null` y
 * `medido: false`. **NUNCA devuelve 0 por no haber podido contar** — es
 * exactamente el defecto que este canario existe para delatar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CanarioResult {
  /** Filas con el identificador en NULO · `null` si no se pudo contar. */
  readonly nulos: number | null
  /** ¿la cuenta se pudo hacer? · `false` ⇒ `nulos` no significa nada. */
  readonly medido: boolean
  /** ¿hay que avisar? · sólo si se midió Y el valor superó la línea base (0). */
  readonly alerta: boolean
  /** Texto para el canal · vacío cuando no hay nada que decir. */
  readonly detalle: string
}

/** La línea base medida · 0 nulos en 96 de 96 filas (2026-08-27). */
export const CANARIO_LINEA_BASE = 0

export async function contarInvocacionesSinIdentificador(
  supabase: SupabaseClient,
): Promise<CanarioResult> {
  try {
    const { count, error } = await supabase
      .from('agent_invocations')
      .select('id', { count: 'exact', head: true })
      .is('workflow_execution_id', null)

    if (error || typeof count !== 'number') {
      return {
        nulos: null,
        medido: false,
        alerta: false,
        detalle:
          'No se pudo contar las invocaciones sin identificador de corrida · el canario NO ' +
          'reporta 0 por no haber podido mirar (ver §148). Sin cuenta no hay señal, ni buena ni mala.',
      }
    }

    if (count > CANARIO_LINEA_BASE) {
      return {
        nulos: count,
        medido: true,
        alerta: true,
        detalle:
          `🔴 ${count} invocación(es) registradas SIN identificador de corrida. La línea base ` +
          `medida es ${CANARIO_LINEA_BASE} en toda la historia, así que esto NO es ruido: hay un ` +
          'llamador cuyo identificador no está llegando a la fila. Para esas corridas la vara ' +
          'por corrida suma $0 y NO va a disparar.',
      }
    }

    return { nulos: count, medido: true, alerta: false, detalle: '' }
  } catch {
    return {
      nulos: null,
      medido: false,
      alerta: false,
      detalle:
        'Excepción contando invocaciones sin identificador de corrida · el canario NO reporta 0.',
    }
  }
}
