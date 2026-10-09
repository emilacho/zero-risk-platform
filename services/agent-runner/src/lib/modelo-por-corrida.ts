/**
 * MODELO POR CORRIDA · OPT-IN (relevo 25 · CC#1 · firma de Emilio: «en el modelo más alto posible» para UNA prueba de `social-media-strategist`).
 *
 * El modelo de un agente sale de `agents.model` / el registro (`MODEL_MAP`). Esto agrega un OVERRIDE por pedido, aditivo y opcional (`model_override`), que vale SOLO para esa corrida:
 * no cambia `agents.model` ni el registro, y sin él el camino es EXACTAMENTE el de siempre.
 *
 * Solo acepta ids de una lista corta y explícita, TODOS con precio oficial en `PRECIOS_OFICIALES` (el corredor no corre un id del que no sepa calcular el costo). Un valor mal escrito o fuera de la lista
 * se RECHAZA (400) antes de gastar: ignorarlo correría el agente en otro modelo del que se creía. La copia de la lista que usa la ruta `run-sdk` (`src/lib/modelo-por-corrida.ts`) debe ser idéntica; lo comprueba una prueba.
 *
 * Relevo 26: Fable 5.1 entra a la lista y los precios salen de la documentación OFICIAL de Anthropic (no de la tabla vieja de familia).
 */
export const MODELOS_POR_CORRIDA = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-fable-5-1'] as const
export type ModeloPorCorrida = (typeof MODELOS_POR_CORRIDA)[number]

/**
 * PRECIOS OFICIALES · US$ por millón de tokens · fuente: https://platform.claude.com/docs/en/about-claude/pricing (tabla «Model pricing», leída el 2026-10-09).
 *   claude-fable-5-1 · entrada 10 · salida 50 · lectura de caché 0,25 (0,025× la entrada)
 *   claude-opus-5-5  · entrada 4  · salida 20 · lectura de caché 0,20 (0,05× la entrada)
 *   claude-opus-5 / 4-8 / 4-7 · entrada 5 · salida 25 · lectura de caché 0,50 (0,1×)
 * Las escrituras de caché valen 1,25× (5 min) y 2× (1 h) la entrada en todos estos modelos (Opus 5.5: 5 y 8 sobre 4; Fable 5.1: 12,50 y 20 sobre 10).
 * Solo estos ids tienen precio propio; el resto sigue con la tabla por familia de siempre (no se cambió el costo de ningún modelo que ya corría).
 */
export const PRECIOS_OFICIALES: Record<ModeloPorCorrida, { entrada: number; salida: number; lecturaCache: number }> = {
  'claude-opus-5-5': { entrada: 4, salida: 20, lecturaCache: 0.2 },
  'claude-opus-5': { entrada: 5, salida: 25, lecturaCache: 0.5 },
  'claude-opus-4-8': { entrada: 5, salida: 25, lecturaCache: 0.5 },
  'claude-opus-4-7': { entrada: 5, salida: 25, lecturaCache: 0.5 },
  'claude-fable-5-1': { entrada: 10, salida: 50, lecturaCache: 0.25 },
}

export type ModeloResuelto = { ok: true; valor: ModeloPorCorrida | null } | { ok: false; motivo: string }

/** el primer candidato presente (no `undefined`) manda; `null` explícito NO es «ausente» y se rechaza */
export function resolverModelo(...candidatos: unknown[]): ModeloResuelto {
  const presente = candidatos.find((c) => c !== undefined)
  if (presente === undefined) return { ok: true, valor: null }
  if (typeof presente === 'string' && (MODELOS_POR_CORRIDA as readonly string[]).includes(presente)) return { ok: true, valor: presente as ModeloPorCorrida }
  return { ok: false, motivo: `model_override debe ser uno de ${MODELOS_POR_CORRIDA.join(' | ')} (llegó ${JSON.stringify(presente)})` }
}
