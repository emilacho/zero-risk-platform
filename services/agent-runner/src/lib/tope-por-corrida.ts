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

/**
 * LO GASTADO Y EL TEXTO DE UNA CORRIDA CORTADA · CC#1 · 2026-10-01 (corrida 160410 del flujo de prueba: 4 llamadas con tope de US$ 0,12 · las 4 cortadas por el tope · las 4 registradas con «gastado ≈ US$ 0.0000»).
 *
 * 🔴 EL DEFECTO, MEDIDO: el SDK entrega el `result` de un corte (`error_max_budget_usd`) con `usage` en CERO, pero SÍ trae su medidor propio: `total_cost_usd` y `modelUsage` (por modelo: fichas y `costUSD`).
 * El corredor sólo leía `usage`, así que el corte se registraba con costo 0 y 0 fichas: el freno diario no veía el gasto (4 llamadas ≈ US$ 0,48 invisibles) y el mensaje del propio corte decía «gastado ≈ US$ 0.0000».
 * Sólo aplica a un resultado FALLIDO (corte por tope o error del resultado con tope opt-in): un éxito se calcula igual que siempre, byte a byte.
 *
 * Regla: el gasto de un fallo es el MAYOR entre lo calculado por fichas y lo que el SDK declara (`total_cost_usd`, o la suma de `modelUsage[].costUSD`). Nunca se inventa: sin medidor del SDK y sin fichas, queda en 0 y se dice la fuente.
 */
export interface UsoDeModelo {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}

/** suma el `modelUsage` del SDK (por modelo) · null si no es un objeto con al menos un modelo legible */
export function sumarModelUsage(modelUsage: unknown): UsoDeModelo | null {
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return null
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  let hay = false
  const suma: UsoDeModelo = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 }
  for (const m of Object.values(modelUsage as Record<string, unknown>)) {
    if (!m || typeof m !== 'object') continue
    hay = true
    const u = m as Record<string, unknown>
    suma.inputTokens += n(u.inputTokens)
    suma.outputTokens += n(u.outputTokens)
    suma.cacheReadInputTokens += n(u.cacheReadInputTokens)
    suma.cacheCreationInputTokens += n(u.cacheCreationInputTokens)
    suma.costUSD += n(u.costUSD)
  }
  return hay ? suma : null
}

export type FuenteDelGasto = 'fichas' | 'sdk_total_cost_usd' | 'sdk_model_usage'

export interface GastoReconciliado {
  /** lo gastado que se REGISTRA (el mayor entre lo calculado por fichas y lo que el SDK declara) */
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  fuente: FuenteDelGasto
}

/**
 * Reconcilia el gasto de un resultado FALLIDO. Las fichas del `usage` mandan cuando existen; si vienen en cero y el SDK declara `modelUsage`, se usan las de `modelUsage`.
 * El costo es el mayor entre `costoPorFichas` (calculado con los precios del corredor) y el medidor del SDK.
 */
export function reconciliarGastoDeFallo(a: {
  costoPorFichas: (f: { input: number; output: number; cacheRead: number; cacheCreate: number }) => number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  sdkTotalCostUsd?: number | null
  sdkModelUsage?: unknown
}): GastoReconciliado {
  const uso = sumarModelUsage(a.sdkModelUsage)
  const usageEnCero = a.inputTokens === 0 && a.outputTokens === 0 && a.cacheReadInputTokens === 0 && a.cacheCreationInputTokens === 0
  const f =
    usageEnCero && uso
      ? { input: uso.inputTokens, output: uso.outputTokens, cacheRead: uso.cacheReadInputTokens, cacheCreate: uso.cacheCreationInputTokens }
      : { input: a.inputTokens, output: a.outputTokens, cacheRead: a.cacheReadInputTokens, cacheCreate: a.cacheCreationInputTokens }
  const porFichas = a.costoPorFichas(f)
  const total = typeof a.sdkTotalCostUsd === 'number' && Number.isFinite(a.sdkTotalCostUsd) && a.sdkTotalCostUsd > 0 ? a.sdkTotalCostUsd : 0
  const porModelo = uso ? uso.costUSD : 0
  const medidor = Math.max(total, porModelo)
  const costUsd = Math.max(porFichas, medidor)
  const fuente: FuenteDelGasto = medidor > porFichas ? (total >= porModelo ? 'sdk_total_cost_usd' : 'sdk_model_usage') : 'fichas'
  return { costUsd, inputTokens: f.input, outputTokens: f.output, cacheReadInputTokens: f.cacheRead, cacheCreationInputTokens: f.cacheCreate, fuente }
}

/** tope del texto parcial que se conserva en el libro de invocaciones (el punto de control ya usa el mismo tope de 100 mil) */
export const TEXTO_PARCIAL_MAX_CHARS = 100_000

/** la causa corta con la que se marca un resultado parcial: el subtype del SDK (`error_max_budget_usd`…) o «error_del_sdk» si no llegó ninguno */
export function causaDelParcial(resultSubtype: string | null | undefined): string {
  return typeof resultSubtype === 'string' && resultSubtype !== '' ? resultSubtype : 'error_del_sdk'
}
