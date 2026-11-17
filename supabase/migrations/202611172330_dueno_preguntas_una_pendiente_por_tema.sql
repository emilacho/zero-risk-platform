-- 17-nov · CC1 · GO de Lenovo (RESPUESTA-LENOVO-a-CC1-preguntas-repetidas) sobre la observación de CC6 a #1140 (carrera entre dos corridas del vigilante del cerebro)
-- UNA sola pregunta PENDIENTE por (cliente, sede, tema normalizado): si dos corridas preguntan lo mismo a la vez, la base deja entrar solo una y la ruta responde a la otra
-- «ya_preguntada» / «repetida» con el id de la que ganó. Las ya respondidas, asumidas, descartadas, vencidas u obsoletas no cuentan: un tema se puede volver a preguntar.
-- Antes del índice, las pendientes duplicadas (si las hay) se cierran como «obsoleta» con motivo, SIN borrar; queda la más vieja. Lectura de prd 17-nov 19:00Z: 11 filas, 0 pendientes, 0 duplicadas.
-- REVERSA: supabase/reversas/202611172330_dueno_preguntas_una_pendiente_por_tema_REVERSA.sql (quita el índice; lo cerrado queda cerrado, con su motivo).
BEGIN;

WITH orden AS (
  SELECT id, row_number() OVER (PARTITION BY client_id, coalesce(sede_clave, ''), tema_norm ORDER BY creado_en, id) AS n
  FROM public.dueno_preguntas
  WHERE estado = 'pendiente'
)
UPDATE public.dueno_preguntas p
SET estado = 'obsoleta',
    motivo = 'duplicada: ya había otra pendiente del mismo tema (índice único 202611172330)',
    actualizado_en = now()
FROM orden o
WHERE p.id = o.id AND o.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS dueno_preguntas_una_pendiente_por_tema
  ON public.dueno_preguntas (client_id, coalesce(sede_clave, ''), tema_norm)
  WHERE estado = 'pendiente';

COMMENT ON INDEX public.dueno_preguntas_una_pendiente_por_tema IS 'Una sola pregunta pendiente por cliente, sede y tema (17-nov · CC1): dos corridas a la vez no le preguntan dos veces lo mismo al dueño.';

COMMIT;
