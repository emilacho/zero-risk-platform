/**
 * `una_sola_vez` · opción del LLAMADOR de `/api/agents/run-sdk` (11-nov · colaterales 2d · línea 4 de CC7).
 * Con la opción, un segundo pedido con la MISMA llave de despacho no vuelve a correr al agente: un reintento por un corte de red
 * después de que el agente ya corrió no paga dos veces. Sin la opción, todo sigue como hoy (el rescate reusa la llave A PROPÓSITO).
 * Reglas: debe ser booleano; si es true exige el camino con vuelta (el único que registra la llave ANTES de correr) y una llave explícita.
 */
export function leerUnaSolaVez(body: Record<string, unknown>, conVuelta: boolean): { activa: boolean; error?: string } {
  if (!Object.prototype.hasOwnProperty.call(body, 'una_sola_vez')) return { activa: false }
  const v = body.una_sola_vez
  if (typeof v !== 'boolean') return { activa: false, error: 'una_sola_vez debe ser true o false' }
  if (!v) return { activa: false }
  if (!conVuelta) return { activa: false, error: 'una_sola_vez solo vale con callback_url (el camino sin vuelta no registra la llave antes de correr)' }
  const llave = typeof body.dispatch_key === 'string' ? body.dispatch_key.trim() : ''
  if (!llave) return { activa: false, error: 'una_sola_vez exige dispatch_key explícita' }
  return { activa: true }
}
