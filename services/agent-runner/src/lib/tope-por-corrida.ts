/**
 * TOPE DURO DE GASTO POR CORRIDA · CC#1 · 2026-09-30 · pedido de Emilio para la corrida real del brief (US$ 3,50).
 *
 * Hasta hoy un «tope» de una corrida no se podía HACER CUMPLIR: el freno §150 sólo mira al INICIO de cada pedido (una corrida larga y cara lo pasa de largo) y el runner no
 * pasaba ningún presupuesto al SDK. El SDK 0.2.138 sí lo soporta (`maxBudgetUsd` · corta y termina con `subtype: 'error_max_budget_usd'`).
 *
 * Reglas (todas de opt-in: SIN el campo en el pedido, el camino es el de siempre, byte a byte):
 *   · el pedido puede traer `max_budget_usd` (número > 0 y ≤ TOPE_MAX_USD) · cualquier otra cosa se rechaza con 400 (un tope mal escrito NO se ignora: la corrida pagaría sin tope)
 *   · el SDK recibe `maxBudgetUsd`
 *   · si el SDK cortó por presupuesto, el resultado es un FALLO DECLARADO (`success:false` + `error_max_budget_usd`), NUNCA un éxito con texto parcial · lo gastado queda registrado
 *   · el SDK revisa el presupuesto ENTRE llamadas al modelo: el corte puede pasarse por UNA llamada (por eso se pide un tope con holgura respecto de lo autorizado)
 */

/** techo absoluto de un tope pedido: un `max_budget_usd` mayor es un error de tipeo, no una autorización */
export const TOPE_MAX_USD = 50
export const SUBTIPO_CORTE_POR_PRESUPUESTO = 'error_max_budget_usd'

export type TopeResuelto = { ok: true; valor: number | null } | { ok: false; motivo: string }

/** toma el PRIMER candidato presente (camelCase / snake_case / dentro de `context`) y lo valida · ninguno presente ⇒ sin tope (`valor:null`) */
export function resolverTopeUsd(...candidatos: unknown[]): TopeResuelto {
  const presente = candidatos.find((c) => c !== undefined)
  if (presente === undefined) return { ok: true, valor: null }
  const n = typeof presente === 'number' ? presente : typeof presente === 'string' && presente.trim() !== '' ? Number(presente) : NaN
  if (!Number.isFinite(n) || n <= 0) return { ok: false, motivo: `max_budget_usd debe ser un número mayor que 0 (llegó ${JSON.stringify(presente)})` }
  if (n > TOPE_MAX_USD) return { ok: false, motivo: `max_budget_usd ${n} supera el techo absoluto de ${TOPE_MAX_USD} · parece un error de tipeo` }
  return { ok: true, valor: n }
}

/** la parte de las opciones del SDK · vacía sin tope (camino de siempre) */
export function opcionDeTope(maxBudgetUsd: number | null | undefined): { maxBudgetUsd?: number } {
  return typeof maxBudgetUsd === 'number' && Number.isFinite(maxBudgetUsd) && maxBudgetUsd > 0 ? { maxBudgetUsd } : {}
}

/** ¿el SDK cortó la corrida por presupuesto? · sólo tiene sentido si el pedido llevaba tope */
export function cortadoPorTope(maxBudgetUsd: number | null | undefined, resultSubtype: string | null | undefined): boolean {
  return typeof maxBudgetUsd === 'number' && maxBudgetUsd > 0 && resultSubtype === SUBTIPO_CORTE_POR_PRESUPUESTO
}

export function mensajeDeCorte(maxBudgetUsd: number, costoUsd: number): string {
  return (
    `${SUBTIPO_CORTE_POR_PRESUPUESTO} · el empleado alcanzó el tope de gasto de la corrida (US$ ${maxBudgetUsd}) y se DETUVO · ` +
    `gastado ≈ US$ ${costoUsd.toFixed(4)} · lo escrito hasta ahí es PARCIAL y no se da por respuesta`
  )
}

/**
 * FALLO DEL SDK QUE NO ES UN CORTE POR TOPE · CC#1 · 2026-09-30 (corrida real 158667: «response exceeded the 32000 output token maximum»).
 * El SDK entrega un `result` con `is_error:true` y luego el proceso sale ≠ 0 (excepción). Antes esa excepción subía a `fail()`: cero gasto registrado y la causa sólo en Braintrust.
 * Opt-in igual que el tope: sólo los pedidos con `max_budget_usd` cambian; el resto sigue byte a byte. `error_max_turns` NO es un fallo (siempre fue un cierre con texto parcial).
 */
export const SUBTIPO_TOPE_DE_TURNOS = 'error_max_turns'

/** ¿el `result` ya entregado es un fallo (corte por presupuesto o `is_error`)? · decide si la excepción de salida posterior es la consecuencia esperada */
export function terminoConResultadoFallido(resultSubtype: string | null | undefined, resultIsError: boolean | undefined): boolean {
  if (resultSubtype === SUBTIPO_CORTE_POR_PRESUPUESTO) return true
  return resultIsError === true && resultSubtype !== SUBTIPO_TOPE_DE_TURNOS
}

/** la causa de un fallo del resultado que NO es corte por tope · null si no aplica (sin tope opt-in, sin error, corte por tope o tope de turnos) */
export function falloDelResultado(maxBudgetUsd: number | null | undefined, resultSubtype: string | null | undefined, resultIsError: boolean | undefined, resultMessage: string | null | undefined): string | null {
  if (!(typeof maxBudgetUsd === 'number' && maxBudgetUsd > 0)) return null
  if (resultSubtype === SUBTIPO_CORTE_POR_PRESUPUESTO) return null
  if (!terminoConResultadoFallido(resultSubtype, resultIsError)) return null
  return resultMessage && resultMessage.trim() !== '' ? resultMessage : `el SDK cerró con error (${resultSubtype ?? 'sin subtipo'})`
}

export function mensajeDeFalloDelSdk(causa: string, costoUsd: number): string {
  return `el empleado FALLÓ · ${causa} · gastado ≈ US$ ${costoUsd.toFixed(4)} · lo escrito hasta ahí es PARCIAL y no se da por respuesta`
}

/**
 * RAZONAMIENTO INTERNO LIMITADO POR CORRIDA · CC#1 · 2026-09-30 · experimento autorizado por Emilio (Braintrust: ~90% de la salida del redactor es pensamiento que nadie lee,
 * y el fallo real es el máximo de 32.000 tokens POR RESPUESTA). OPT-IN igual que el tope: sin `thinking_mode` en el pedido, las opciones del SDK son las de siempre (ni existen las claves).
 *   · `disabled` → `thinking: {type:'disabled'}` (sin pensamiento extendido)
 *   · `low` | `medium` → `effort` (guía la profundidad del pensamiento adaptativo)
 * Un valor MAL ESCRITO se rechaza (400): ignorarlo dejaría correr con el razonamiento completo y pagar el fallo de siempre.
 */
export const MODOS_DE_RAZONAMIENTO = ['disabled', 'low', 'medium'] as const
export type ModoDeRazonamiento = (typeof MODOS_DE_RAZONAMIENTO)[number]

export type RazonamientoResuelto = { ok: true; valor: ModoDeRazonamiento | null } | { ok: false; motivo: string }

/** toma el PRIMER candidato presente y lo valida · ninguno presente ⇒ sin límite (`valor:null`) · `null` explícito NO es «ausente» */
export function resolverRazonamiento(...candidatos: unknown[]): RazonamientoResuelto {
  const presente = candidatos.find((c) => c !== undefined)
  if (presente === undefined) return { ok: true, valor: null }
  if (typeof presente === 'string' && (MODOS_DE_RAZONAMIENTO as readonly string[]).includes(presente)) return { ok: true, valor: presente as ModoDeRazonamiento }
  return { ok: false, motivo: `thinking_mode debe ser uno de ${MODOS_DE_RAZONAMIENTO.join(' | ')} (llegó ${JSON.stringify(presente)})` }
}

/** la parte de las opciones del SDK · vacía sin modo (camino de siempre) */
export function opcionDeRazonamiento(modo: ModoDeRazonamiento | null | undefined): { thinking?: { type: 'disabled' }; effort?: 'low' | 'medium' } {
  if (modo === 'disabled') return { thinking: { type: 'disabled' } }
  if (modo === 'low' || modo === 'medium') return { effort: modo }
  return {}
}
