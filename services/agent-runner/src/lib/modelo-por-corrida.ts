/**
 * MODELO POR CORRIDA · OPT-IN (relevo 25 · CC#1 · firma de Emilio: «en el modelo más alto posible» para UNA prueba de `social-media-strategist`).
 *
 * El modelo de un agente sale de `agents.model` / el registro (`MODEL_MAP`). Esto agrega un OVERRIDE por pedido, aditivo y opcional (`model_override`), que vale SOLO para esa corrida:
 * no cambia `agents.model` ni el registro, y sin él el camino es EXACTAMENTE el de siempre.
 *
 * Solo acepta ids de una lista corta y explícita (familia Opus + Fable 5.1, los que el SDK 0.3.x ya puede llamar y cuyo precio oficial está en la tabla del corredor). Un valor mal escrito o fuera de la lista se RECHAZA (400) antes de gastar:
 * ignorarlo correría el agente en otro modelo del que se creía. La copia de esta lista que usa la ruta `run-sdk` (`src/lib/modelo-por-corrida.ts`) debe ser idéntica; lo comprueba una prueba.
 */
export const MODELOS_POR_CORRIDA = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-fable-5-1'] as const
export type ModeloPorCorrida = (typeof MODELOS_POR_CORRIDA)[number]

export type ModeloResuelto = { ok: true; valor: ModeloPorCorrida | null } | { ok: false; motivo: string }

/** el primer candidato presente (no `undefined`) manda; `null` explícito NO es «ausente» y se rechaza */
export function resolverModelo(...candidatos: unknown[]): ModeloResuelto {
  const presente = candidatos.find((c) => c !== undefined)
  if (presente === undefined) return { ok: true, valor: null }
  if (typeof presente === 'string' && (MODELOS_POR_CORRIDA as readonly string[]).includes(presente)) return { ok: true, valor: presente as ModeloPorCorrida }
  return { ok: false, motivo: `model_override debe ser uno de ${MODELOS_POR_CORRIDA.join(' | ')} (llegó ${JSON.stringify(presente)})` }
}
