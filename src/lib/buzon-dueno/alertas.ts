/**
 * AVISO A #alertas (31-oct): el buzón del dueño avisa cuando una pregunta NO pudo salir (antes se callaba: el filtro de lenguaje rechazaba en silencio y nadie se enteraba).
 * UNA línea por incidente. NUNCA lanza (un fallo de Slack no frena la conversación). La llave y el `fetch` entran por parámetro y la llave nunca se escribe.
 */
type Fetch = typeof fetch
export const CANAL_DE_ALERTAS_POR_OMISION = 'C0B7XUUEBHA'

export function avisarAAlertas(p: { token: string; canal?: string; fetch?: Fetch }): (texto: string) => Promise<void> {
  const f = p.fetch ?? fetch
  return async (texto) => {
    if (!p.token) return
    try {
      await f('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${p.token}` },
        body: JSON.stringify({ channel: p.canal || CANAL_DE_ALERTAS_POR_OMISION, text: texto }),
      })
    } catch { /* un fallo de Slack nunca frena nada */ }
  }
}
