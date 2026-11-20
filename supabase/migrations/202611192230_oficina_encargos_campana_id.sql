-- 19-nov · VARIAS CAMPAÑAS · parte B (ajuste de Emilio 22:07 Zúrich · GO de Lenovo a CC1): cada encargo sabe de qué campaña es.
-- Para que el Centro muestre por campaña las Piezas, el Equipo y el Dinero (parte C), la pieza tiene que poder llegar a su campaña:
--   · columna `campana_id` en `oficina_encargos` (nullable): la pone la oficina al crear el encargo (la del sobre · si no viene, la de la versión
--     anterior del mismo brief · si tampoco, la de su fila del calendario);
--   · los encargos que ya existen quedan sin campaña (NULL): nada de lo suyo cambia;
--   · si se borra la campaña, el encargo queda sin campaña (ON DELETE SET NULL), nunca se borra.
-- Reversa: supabase/reversas/202611192230_oficina_encargos_campana_id_REVERSA.sql
BEGIN;

ALTER TABLE public.oficina_encargos ADD COLUMN IF NOT EXISTS campana_id uuid
  REFERENCES public.cadena_campanas (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.oficina_encargos.campana_id IS
  'VARIAS CAMPAÑAS (19-nov): de qué campaña es el encargo. NULL = sin saberlo (los anteriores al 19-nov, o un sobre sin campaña ni fila).';
CREATE INDEX IF NOT EXISTS oficina_encargos_por_campana ON public.oficina_encargos (campana_id) WHERE campana_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'oficina_encargos' AND column_name = 'campana_id' AND data_type = 'uuid') THEN
    RAISE EXCEPTION 'oficina_encargos.campana_id: la columna no quedó como uuid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'oficina_encargos' AND indexname = 'oficina_encargos_por_campana') THEN
    RAISE EXCEPTION 'oficina_encargos.campana_id: falta el índice';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE campana_id IS NOT NULL) THEN
    RAISE EXCEPTION 'oficina_encargos.campana_id: un encargo que ya existía tiene campaña';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
