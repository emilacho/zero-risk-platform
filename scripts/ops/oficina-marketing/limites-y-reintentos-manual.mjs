/**
 * 02-nov · ADENDA «límites al máximo» + corte a los 5 min (ENCARGO Lenovo 19:27Z) · parte n8n del flujo del manual (`ssLtwYPt7zxuvnM2`).
 * US$ 0, nada aplicado. Qué hace, sobre los nodos que llaman a un empleado (`/api/agents/run-sdk`):
 *   · la espera de la llamada queda en el máximo que admite la plataforma (800 s; Vercel `maxDuration`). Los topes de GASTO no se tocan.
 *   · si la conexión se pierde (n8n lo dice como «connection closed unexpectedly»), el nodo reintenta UNA vez tras 5 s. El punto de control de la plataforma
 *     devuelve lo que el empleado ya escribió, así que el reintento tras un corte no cobra de nuevo. Con `neverError` un 5xx no lanza y no reintenta: solo reintenta la conexión perdida.
 * Los nodos de código del equipo nuevo hacen lo mismo dentro de `secciones-nuevas-y-mesa-manual.mjs` (espera 800 s y un reintento).
 */
export const ESPERA_MAXIMA_MS = 800000
export const INTENTOS = 2
export const ESPERA_ENTRE_INTENTOS_MS = 5000

export const esLlamadaAEmpleado = (n) => n.type === 'n8n-nodes-base.httpRequest' && String(n.parameters && n.parameters.url).includes('/api/agents/run-sdk')

export function construirLimitesYReintentos(f) {
  const tocados = []
  for (const n of f.nodes) {
    if (!esLlamadaAEmpleado(n)) continue
    n.parameters.options = Object.assign({}, n.parameters.options, { timeout: ESPERA_MAXIMA_MS })
    n.retryOnFail = true
    n.maxTries = INTENTOS
    n.waitBetweenTries = ESPERA_ENTRE_INTENTOS_MS
    tocados.push(n.name)
  }
  if (!tocados.length) throw new Error('no hay llamadas a empleados que ajustar')
  return tocados
}
