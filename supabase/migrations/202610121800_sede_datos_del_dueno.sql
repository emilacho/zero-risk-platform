-- DATOS DE SEDE DICHOS POR EL DUEÑO · CC#1 · 2026-10-12 (encargo «misión corregida» · firma de Emilio «corrección de la misión de Náufrago (dato del dueño)»).
-- 🔴 NO APLICADA al escribirse: se aplica con respaldo de las definiciones y 0 corridas vivas.
-- El lector del cerebro (`leerSedes`) YA trata `fuente = 'dueno'` como «dicho por el dueño» (origen dueno · estado dicho_por_dueno), pero la base solo admitía sitio/instagram/mapas:
-- el camino existía en el lector y estaba cerrado en la base. Esta migración lo abre y agrega el campo «tipo de atención» (local · domicilio) de una sede.
-- 🔴 SOLO AMPLÍA dos listas cerradas (CHECK): ninguna fila existente cambia. Idempotente (se quita y se vuelve a poner con el mismo nombre). Una sola transacción.
-- REVERSA: `supabase/reversas/202610121800_sede_datos_del_dueno_REVERSA.sql` (se niega si ya hay filas con los valores nuevos).
BEGIN;
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_campo_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_campo_check CHECK (campo IN ('direccion','horario','canal_pedido','tipo_de_atencion'));
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_fuente_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_fuente_check CHECK (fuente IN ('sitio','instagram','mapas','dueno'));
COMMENT ON CONSTRAINT client_sede_datos_fuente_check ON public.client_sede_datos IS 'dueno = corrección o dato dicho por el dueño del negocio (manda sobre lo inferido de sitio/redes/mapas)';
COMMIT;
NOTIFY pgrst, 'reload schema';
