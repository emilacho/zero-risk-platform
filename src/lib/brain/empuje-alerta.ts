/**
 * Que el fallo del empuje al cerebro SE OIGA.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────────
 * El empuje del manual al cerebro se agenda y no se espera — que es lo correcto,
 * porque la fila del manual no puede quedar colgada de que el cerebro conteste.
 * Pero eso deja un agujero: **si el empuje falla, no lo mira nadie**. El estado
 * viaja en el recibo (`brain_push`), y el recibo lo consume un nodo de n8n que
 * no lo lee. El manual quedaría fuera del cerebro hasta el barrido del día
 * siguiente y **nadie se enteraría** — que es exactamente el defecto que este
 * empuje vino a arreglar, sólo que ahora en silencio.
 *
 * *«Un freno que se rinde en silencio no es un freno, es un adorno»* (§148).
 * Vale igual para un empuje.
 *
 * ── DÓNDE SE OYE ──────────────────────────────────────────────────────────
 * Slack `#equipo`, vía `SLACK_WEBHOOK_URL_EQUIPO` — la única campana que en este
 * proyecto está REALMENTE conectada (Sentry no tiene llave · Braintrust tiene el
 * proyecto vacío, 0 eventos). Verificado: la variable existe en producción.
 *
 * ── REGLAS ────────────────────────────────────────────────────────────────
 * · NUNCA lanza. Un aviso que rompe lo que venía a vigilar es peor que el
 *   silencio. Todo va en try/catch y devuelve un resultado, jamás una excepción.
 * · NUNCA bloquea. Se llama desde dentro del empuje, que ya corre agendado.
 * · Sin webhook configurado ⇒ queda en consola y se declara `sin_campana`.
 *   No se inventa un canal.
 */

/** Por qué se está avisando · cada motivo dice qué mirar. */
export type MotivoFalloEmpuje =
  /** la puerta del cerebro contestó un código de error */
  | 'puerta_no_2xx'
  /** no se pudo ni llegar a la puerta (red, DNS, timeout) */
  | 'puerta_inalcanzable'
  /** falta configuración para poder llamar · el empuje no ocurrió nunca */
  | 'sin_configurar'

export interface AvisoEmpuje {
  readonly motivo: MotivoFalloEmpuje
  readonly client_id: string
  /** `id` de la fila de `client_brand_books` que se quedó sin embeber. */
  readonly source_id: string | null
  /** Código HTTP cuando aplica. */
  readonly status?: number
  /** Texto corto de la causa · se recorta al enviar. */
  readonly detalle?: string
  /** Inyectable para prueba. */
  readonly fetchImpl?: typeof fetch
  /** Inyectable para prueba. */
  readonly webhookUrl?: string
}

export interface ResultadoAviso {
  readonly avisado: boolean
  readonly razon?: 'sin_campana' | 'envio_fallo' | 'excepcion'
}

const ETIQUETA: Record<MotivoFalloEmpuje, string> = {
  puerta_no_2xx: 'la puerta del cerebro rechazó el manual',
  puerta_inalcanzable: 'no se pudo llegar a la puerta del cerebro',
  sin_configurar: 'falta configuración · el empuje no llegó a intentarse',
}

/** El mensaje, separado del envío para poder probarlo sin red. */
export function construirMensaje(a: AvisoEmpuje): { text: string } {
  const cli = String(a.client_id || '').slice(0, 8)
  const fila = a.source_id ? String(a.source_id).slice(0, 8) : '(sin id)'
  const lineas = [
    `:brain: *El manual no entró al cerebro* — ${ETIQUETA[a.motivo]}`,
    `• cliente \`${cli}\` · fila del manual \`${fila}\``,
    a.status ? `• respuesta \`${a.status}\`` : null,
    a.detalle ? `• ${String(a.detalle).slice(0, 300)}` : null,
    `• el manual *sí* quedó guardado · lo que falta son sus fichas en el cerebro`,
    `• red de seguridad: el barrido diario lo levanta a las 07:00`,
  ].filter(Boolean)
  return { text: lineas.join('\n') }
}

/**
 * Toca la campana. Best-effort · NUNCA lanza · NUNCA bloquea a quien la llama.
 */
export async function avisarFalloDelEmpuje(a: AvisoEmpuje): Promise<ResultadoAviso> {
  const mensaje = construirMensaje(a)
  // Siempre queda en consola, haya campana o no.
  console.error('[cerebro-al-terminar] ' + mensaje.text.replace(/\n/g, ' · '))

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
