-- REVERSA de 202611172330 · quita el índice único de pendientes por tema. Las filas que la migración cerró como «obsoleta» (duplicadas) quedan cerradas, con su motivo: no se reabren.
-- Con el índice fuera, la ruta sigue funcionando: sin choque en la base, vuelve a frenar solo con su lectura previa (como antes).
BEGIN;
DROP INDEX IF EXISTS public.dueno_preguntas_una_pendiente_por_tema;
COMMIT;
