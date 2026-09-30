/**
 * Que un SOBRE PERDIDO SE OIGA · CC#1 · 2026-09-30 · paquete del repartidor · pieza ⑤ (el vigilante).
 *
 * Con «marcar ANTES de disparar» (pieza ③) el modo de fallar cambia: si el disparo no vuelve, el sobre queda RECLAMADO y no se re-dispara (se pierde en vez de duplicarse).
 * Perder es aceptable sólo si se VE: este aviso toca la campana de `#equipo` por cada sobre reclamado que no llegó a un desenlace. Best-effort · NUNCA lanza.
 */
import type { LostClaim } from './types'

export type AlertaDeSobrePerdido = (perdido: LostClaim) => Promise<{ avisado: boolean }>

export function construirMensajeDeSobrePerdido(p: LostClaim): { text: string } {
  const minutos = Math.round(p.age_ms / 60000)
  return {
    text: [
      ':warning: *Sobre perdido en el repartidor* · reclamado y sin desenlace',
      `El sobre del recorrido \`${p.journey_type}\` (cliente \`${p.client_id.slice(0, 8)}\`) se reclamó hace ~${minutos} min y NO consta que se despachara ni que fallara con motivo.`,
      'No se re-dispara solo (preferimos perder a duplicar): un humano decide si se vuelve a enviar.',
      `hilo \`${p.stream_id}\` · asiento de reclamo \`${p.claim_event_id}\``,
    ].join('\n'),
  }
}

export const avisarSobrePerdido: AlertaDeSobrePerdido = async (perdido) => {
  const mensaje = construirMensajeDeSobrePerdido(perdido)
  // eslint-disable-next-line no-console
  console.error('[sobre-perdido] ' + mensaje.text.replace(/\n/g, ' · '))
  const url = process.env.SLACK_WEBHOOK_URL_EQUIPO
  if (!url) return { avisado: false }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mensaje) })
    return { avisado: r.ok }
  } catch {
    return { avisado: false }
  }
}
