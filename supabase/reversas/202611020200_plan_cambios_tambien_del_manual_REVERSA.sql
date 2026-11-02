-- REVERSA de 202611020200_plan_cambios_tambien_del_manual. Se niega si ya hay pedidos del manual: borrarlos perdería lo que el dueño pidió.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.plan_cambios WHERE documento = 'manual') THEN
    RAISE EXCEPTION 'hay pedidos de cambios del manual: no se revierte';
  END IF;
END $$;
DROP INDEX IF EXISTS public.plan_cambios_un_abierto_por_manual;
ALTER TABLE public.plan_cambios DROP CONSTRAINT IF EXISTS plan_cambios_documento_valido;
ALTER TABLE public.plan_cambios ALTER COLUMN plan_id SET NOT NULL;
ALTER TABLE public.plan_cambios ALTER COLUMN vuelta SET NOT NULL;
ALTER TABLE public.plan_cambios
  DROP COLUMN IF EXISTS campos_liberados,
  DROP COLUMN IF EXISTS seccion,
  DROP COLUMN IF EXISTS manual_nuevo_id,
  DROP COLUMN IF EXISTS manual_id,
  DROP COLUMN IF EXISTS documento;
COMMIT;
NOTIFY pgrst, 'reload schema';
