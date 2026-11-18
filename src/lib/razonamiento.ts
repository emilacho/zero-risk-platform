/**
 * LOS MODOS DE RAZONAMIENTO QUE ACEPTA UN PEDIDO (`thinking_mode`) · 18-nov · firma de Emilio «nada se recorta» (G1 del barrido de topes · CC5).
 * Es la MISMA lista que valida el corredor (`services/agent-runner/src/lib/tope-por-corrida.ts` · `MODOS_DE_RAZONAMIENTO`); una prueba vigila que no se separen.
 * El corredor ajusta el nivel a lo que admite cada modelo (`maximo` ⇒ `max`; `xhigh` ⇒ `high` en Opus 4.6 y Sonnet 4.6; nada en Haiku 4.5; `disabled` ⇒ `low` en
 * Opus 5.5 y Sonnet 5.5, que no dejan apagarlo) · fuente: code.claude.com/docs/en/model-config «Adjust effort level», leída el 18-nov.
 */
export const MODOS_DE_RAZONAMIENTO_DEL_PEDIDO = ['disabled', 'low', 'medium', 'high', 'xhigh', 'max', 'maximo'] as const
