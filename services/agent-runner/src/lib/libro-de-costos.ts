/**
 * EL LIBRO DE COSTOS · lo puro (relevo 41). Tres correcciones sobre cómo el corredor anota cuánto costó una corrida:
 *  1. Opus 4.6 (y la tarifa de familia «opus») = US$ 5 / 25 por millón, lectura de caché 0,50 — fuente: platform.claude.com/docs/en/about-claude/pricing, tabla «Model pricing», leída el 2026-10-10.
 *     El libro lo estimaba a 15 / 75 (3 veces de más).
 *  2. Las BÚSQUEDAS WEB del agente se cobran aparte: US$ 10 por 1.000 búsquedas (misma página, «Web search tool») = US$ 0,01 cada una, además de los tokens. El SDK las informa en
 *     `usage.server_tool_use.web_search_requests`. Una búsqueda con error no se cobra (la cuenta es la que informa la API).
 *  3. Una llamada CORTADA por el tope puede llegar sin `usage` y quedar en US$ 0 aunque costó (hallazgo del #454). Cuando el libro diría 0 y hubo corte, se anota el costo que el SDK
 *     informó (`total_cost_usd`) y, si tampoco lo informó, el TOPE como cota pesimista, declarado (`cost_basis`). Nunca baja un costo que sí se calculó.
 * Sin red, sin base: números y reglas.
 */

/** US$ por búsqueda web (10 / 1.000) */
export const PRECIO_BUSQUEDA_WEB_USD = 0.01

export const costoDeBusquedasWeb = (n: number | null | undefined): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n * PRECIO_BUSQUEDA_WEB_USD : 0)

export type BaseDeCosto = 'tokens' | 'total_del_sdk' | 'tope_como_cota'

export interface CostoEfectivo { costo: number; base: BaseDeCosto; /** true = es una COTA PESIMISTA (el gasto real pudo ser menor), no una medición */ cota: boolean }

/**
 * `calculado` = tokens × tarifa (+ búsquedas web) · `sdkTotal` = `total_cost_usd` del mensaje `result` si llegó · `corte` = la corrida terminó por el tope · `tope` = el tope pedido (US$).
 * Reglas: un costo calculado mayor que 0 manda (el SDK puede usar una tarifa vieja); si el libro diría 0: primero lo que informó el SDK; si hubo corte y no hay nada, el tope.
 */
export function costoEfectivoDeCorrida(a: { calculado: number; sdkTotal?: number | null; corte: boolean; tope?: number | null }): CostoEfectivo {
  if (a.calculado > 0) return { costo: a.calculado, base: 'tokens', cota: false }
  if (typeof a.sdkTotal === 'number' && Number.isFinite(a.sdkTotal) && a.sdkTotal > 0) return { costo: a.sdkTotal, base: 'total_del_sdk', cota: false }
  if (a.corte && typeof a.tope === 'number' && Number.isFinite(a.tope) && a.tope > 0) return { costo: a.tope, base: 'tope_como_cota', cota: true }
  return { costo: 0, base: 'tokens', cota: false }
}
