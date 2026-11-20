-- REVERSA de 202611192230_oficina_encargos_campana_id.sql · el encargo deja de saber de qué campaña es.
-- 🔴 Solo se puede si NINGÚN encargo tiene campaña: la reversa no borra lo que la oficina ya guardó. Si hay alguno, se detiene y no cambia nada.
-- Antes de correrla: volver el código a la versión sin `campana_id` (si no, la oficina intenta escribir la columna y falla al crear encargos).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE campana_id IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSA oficina_encargos.campana_id: hay encargos con campaña; no se revierte nada';
  END IF;
END $$;

DROP INDEX IF EXISTS public.oficina_encargos_por_campana;
ALTER TABLE public.oficina_encargos DROP COLUMN IF EXISTS campana_id;

NOTIFY pgrst, 'reload schema';
COMMIT;
