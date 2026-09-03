/**
 * Registro de INTENTOS de reserva · una fila por llamada a Cal.com.
 *
 * POR QUÉ EXISTE · el 03-sep no se pudo contestar «¿desde cuándo Cal.com devuelve
 * 409?» porque un rechazo no dejaba rastro en ninguna parte: `calendar_bookings`
 * guarda sólo los éxitos, las corridas del motor duran 7 días, y el motivo se
 * devolvía al que llamó y se descartaba. Con esta tabla, la próxima vez la pregunta
 * tiene respuesta en una consulta.
 *
 * Mismo patrón que `agent_callback_attempts` (Track P) · fila por intento, escritura
 * de mejor esfuerzo, **NUNCA rompe la reserva**: si la tabla no existe todavía
 * (migración sin aplicar) el insert falla, se registra en consola y la reserva sigue.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Canon · nombre de la tabla · coincide con la migración. */
export const CALENDAR_ATTEMPTS_TABLE = 'calendar_booking_attempts'

/** Resultado del intento · en el idioma del negocio, no en el del proveedor. */
export type ResultadoIntento = 'reservado' | 'rechazado' | 'error_de_red'

export interface IntentoDeReserva {
  client_id: string | null
  contact_email: string
  /** El horario que se PIDIÓ en este intento (no el que quedó). */
  requested_start: string
  /** 1 = el pedido original · 2 = el intento tras buscar el próximo hueco. */
  attempt_number: number
  outcome: ResultadoIntento
  /** Código HTTP que devolvió Cal.com · 0 cuando la llamada ni salió. */
  upstream_status: number
  /** Etiqueta del proveedor · p.ej. `ConflictException`. */
  upstream_code: string | null
  /** La frase del proveedor · es la que probó que 400 y 409 son lo mismo. */
  upstream_message: string | null
  /** true cuando este intento existe porque el anterior fue rechazado. */
  rescatado: boolean
  /** Identificador de la reserva cuando salió bien. */
  provider_booking_id: string | null
}

/** Extrae código y mensaje del cuerpo de error de Cal.com · tolerante a su forma. */
export function leerDetalleCalcom(detail: unknown): { code: string | null; message: string | null } {
  if (!detail || typeof detail !== 'object') {
    return { code: null, message: typeof detail === 'string' ? detail.slice(0, 500) : null }
  }
  const d = detail as Record<string, unknown>
  const anidado = (d.details && typeof d.details === 'object' ? (d.details as Record<string, unknown>) : {})
  const code = d.code ?? d.error ?? anidado.error ?? null
  const message = d.message ?? anidado.message ?? null
  return {
    code: typeof code === 'string' ? code.slice(0, 120) : null,
    message: typeof message === 'string' ? message.slice(0, 500) : null,
  }
}

/**
 * Escribe la fila del intento. Resuelve siempre · nunca lanza · nunca bloquea la
 * reserva. Se AWAITEA a propósito (no fire-and-forget): en una función sin servidor
 * la promesa suelta puede morir con la respuesta, y entonces el registro que se
 * agregó justo para no perder rastros se perdería a veces.
 */
export async function registrarIntentoDeReserva(
  supabase: Pick<SupabaseClient, 'from'>,
  intento: IntentoDeReserva,
): Promise<void> {
  try {
    const { error } = await supabase.from(CALENDAR_ATTEMPTS_TABLE).insert({
      client_id: intento.client_id,
      contact_email: intento.contact_email,
      requested_start: intento.requested_start,
      attempt_number: intento.attempt_number,
      outcome: intento.outcome,
      upstream_status: intento.upstream_status,
      upstream_code: intento.upstream_code,
      upstream_message: intento.upstream_message,
      rescatado: intento.rescatado,
      provider_booking_id: intento.provider_booking_id,
      attempted_at: new Date().toISOString(),
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[calendar-intento] no se pudo registrar (¿falta la migración?) · ${error.message} · ` +
          `intento=${intento.attempt_number} status=${intento.upstream_status} outcome=${intento.outcome}`,
      )
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[calendar-intento] el registro lanzó · ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}
