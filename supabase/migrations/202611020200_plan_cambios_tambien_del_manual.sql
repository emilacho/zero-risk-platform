-- 02-nov · «PEDIR CAMBIOS AL MANUAL» · encargo Lenovo, pedido por Emilio · CC#1 · US$ 0.
--   No es un segundo mecanismo: la tabla de los pedidos del plan guarda también los del manual, con los mismos estados.
--   Las filas de plan quedan iguales: `documento` vale 'plan' por omisión y siguen exigiendo `plan_id` y `vuelta`.
--   Un solo pedido abierto por cliente en el manual. Reversa: supabase/reversas/202611020200_plan_cambios_tambien_del_manual_REVERSA.sql
BEGIN;

ALTER TABLE public.plan_cambios
  ADD COLUMN IF NOT EXISTS documento text NOT NULL DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS manual_id uuid REFERENCES public.client_brand_books (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS manual_nuevo_id uuid REFERENCES public.client_brand_books (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seccion text,
  ADD COLUMN IF NOT EXISTS campos_liberados text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.plan_cambios ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE public.plan_cambios ALTER COLUMN vuelta DROP NOT NULL;

ALTER TABLE public.plan_cambios DROP CONSTRAINT IF EXISTS plan_cambios_documento_valido;
ALTER TABLE public.plan_cambios ADD CONSTRAINT plan_cambios_documento_valido CHECK (
  (documento = 'plan' AND plan_id IS NOT NULL AND vuelta IS NOT NULL)
  OR (documento = 'manual' AND manual_id IS NOT NULL AND plan_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_cambios_un_abierto_por_manual ON public.plan_cambios (client_id)
  WHERE documento = 'manual' AND estado IN ('pendiente', 'en_reescritura');

COMMIT;
NOTIFY pgrst, 'reload schema';
