/**
 * Que el ATASCO de la agenda SE OIGA.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────────
 * El 03-sep el sistema decía «fase de agenda completada» 9 segundos después de que
 * Cal.com rechazara la reserva. Ese arreglo (el aviso lee el resultado) cambia la
 * afirmación falsa por la verdadera: la fase queda *en curso*. Pero una fase en
 * curso que nadie mira es **un atasco silencioso** — cambiar una mentira callada
 * por un atasco callado no sirve de nada.
 *
 * Por eso, cuando la reserva NO se logra ni con el rescate del próximo hueco, suena
 * la campana. Es el mismo criterio que la campana del cerebro (§148 · «un freno que
 * se rinde en silencio no es un freno, es un adorno»).
 *
 * ── DÓNDE SE OYE ──────────────────────────────────────────────────────────
 * Slack `#equipo`, vía `SLACK_WEBHOOK_URL_EQUIPO` — la única campana REALMENTE
 * conectada en este proyecto (medido el 02-sep: Sentry recibe ~nada, `error_events`
 * está muerta desde el 22-may, y ningún proceso del motor tiene flujo de errores).
 *
 * ── REGLAS ────────────────────────────────────────────────────────────────
 * · NUNCA lanza · un aviso que rompe lo que vigila es peor que el silencio.
 * · NUNCA bloquea la respuesta al que llamó.
 * · Sin webhook configurado ⇒ queda en consola y se declara `sin_campana`.
 */

/** Por qué no hay reunión · cada motivo dice qué mirar. */
export type MotivoAtascoAgenda =
  /** Cal.com rechazó el horario Y el próximo hueco tampoco se pudo reservar */
  | 'sin_hueco'
  /** Cal.com rechazó por algo que no es el horario (credencial · destino · tope) */
  | 'rechazo_no_de_horario'
  /** no se pudo ni llegar a Cal.com (red · DNS · tiempo agotado) */
  | 'proveedor_inalcanzable'

export interface AvisoAgenda {
  readonly motivo: MotivoAtascoAgenda
  readonly client_id: string | null
  readonly contact_email: string
  /** El horario que se pidió (ISO). */
  readonly requested_start: string
  /** Código HTTP de Cal.com · 0 cuando la llamada ni salió. */
  readonly upstream_status: number
  /** Etiqueta del proveedor · p.ej. `ConflictException`. */
  readonly upstream_code?: string | null
  /** La frase del proveedor · recortada al enviar. */
  readonly upstream_message?: string | null
  /** true cuando se llegó a intentar el próximo hueco libre. */
  readonly se_busco_hueco: boolean
  /** Inyectable para prueba. */
  readonly fetchImpl?: typeof fetch
  /** Inyectable para prueba. */
  readonly webhookUrl?: string
}

export interface ResultadoAvisoAgenda {
  readonly avisado: boolean
  readonly razon?: 'sin_campana' | 'envio_fallo' | 'excepcion'
}

const ETIQUETA: Record<MotivoAtascoAgenda, string> = {
  sin_hueco: 'el horario pedido no se podía reservar y el próximo hueco tampoco',
  rechazo_no_de_horario: 'Cal.com rechazó por algo que no es el horario',
  proveedor_inalcanzable: 'no se pudo llegar a Cal.com',
}

/** El mensaje, separado del envío para poder probarlo sin red. */
export function construirMensajeAgenda(a: AvisoAgenda): { text: string } {
  const cli = a.client_id ? String(a.client_id).slice(0, 8) : '(sin cliente atado)'
  const lineas = [
    `:calendar: *La reunión de arranque NO quedó agendada* — ${ETIQUETA[a.motivo]}`,
    `• cliente \`${cli}\` · invitado \`${String(a.contact_email).slice(0, 80)}\``,
    `• horario pedido \`${String(a.requested_start).slice(0, 25)}\``,
    `• respuesta \`${a.upstream_status}\`${a.upstream_code ? ` · \`${String(a.upstream_code).slice(0, 60)}\`` : ''}`,
    a.upstream_message ? `• ${String(a.upstream_message).slice(0, 300)}` : null,
    a.se_busco_hueco
      ? '• se buscó el próximo hueco libre y tampoco se pudo reservar'
      : '• NO se buscó otro hueco · el rechazo no era de horario',
    '• la fase de agenda queda *en curso*, no completada · el alta no avanza sola',
  ].filter(Boolean)
  return { text: lineas.join('\n') }
}

/**
 * Toca la campana. Best-effort · NUNCA lanza · NUNCA bloquea a quien la llama.
 */
export async function avisarAtascoDeAgenda(a: AvisoAgenda): Promise<ResultadoAvisoAgenda> {
  const mensaje = construirMensajeAgenda(a)
  // Siempre queda en consola, haya campana o no.
  // eslint-disable-next-line no-console
  console.error('[agenda-atascada] ' + mensaje.text.replace(/\n/g, ' · '))

  const url = a.webhookUrl ?? process.env.SLACK_WEBHOOK_URL_EQUIPO
  if (!url) return { avisado: false, razon: 'sin_campana' }

  const doFetch = a.fetchImpl ?? fetch
  try {
    const r = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensaje),
    })
    if (!r.ok) return { avisado: false, razon: 'envio_fallo' }
    return { avisado: true }
  } catch {
    return { avisado: false, razon: 'excepcion' }
  }
}
