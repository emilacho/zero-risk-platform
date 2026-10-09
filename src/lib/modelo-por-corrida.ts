/**
 * MODELO POR CORRIDA · OPT-IN · copia de la lista del corredor (`services/agent-runner/src/lib/modelo-por-corrida.ts`) para validar en la ruta `run-sdk` ANTES de gastar.
 * Deben ser idénticas (lo comprueba `__tests__/modelo-por-corrida.test.ts`). Ver el comentario del corredor para el porqué.
 */
export const MODELOS_POR_CORRIDA = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7'] as const

/** `true` si el valor es uno de los ids permitidos */
export const modeloPorCorridaValido = (v: unknown): v is (typeof MODELOS_POR_CORRIDA)[number] => typeof v === 'string' && (MODELOS_POR_CORRIDA as readonly string[]).includes(v)
