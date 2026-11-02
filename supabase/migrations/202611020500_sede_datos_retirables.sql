-- 02-nov · datos de sede que no eran del cliente (tiendas de Uber Eats de otros negocios rotuladas «sitio»): la tabla no tenía forma de RETIRAR una fila con motivo.
-- Aditiva y reversible: dos columnas nuevas (NULL = vigente) y un índice parcial. No cambia ninguna fila, ninguna política ni ningún permiso.
-- Quien lee la tabla debe ignorar las filas con `retirada_en` (los lectores del cerebro, de la cadena y de la oficina lo hacen desde este cambio).
-- REVERSA (si hiciera falta): DROP INDEX IF EXISTS client_sede_datos_vigentes; ALTER TABLE public.client_sede_datos DROP COLUMN IF EXISTS motivo_retirada, DROP COLUMN IF EXISTS retirada_en;
ALTER TABLE public.client_sede_datos ADD COLUMN IF NOT EXISTS retirada_en timestamptz;
ALTER TABLE public.client_sede_datos ADD COLUMN IF NOT EXISTS motivo_retirada text;
COMMENT ON COLUMN public.client_sede_datos.retirada_en IS 'NULL = vigente. Con fecha = retirada con motivo (nunca se borra): el dato no era del cliente o quedó sin fuente.';
COMMENT ON COLUMN public.client_sede_datos.motivo_retirada IS 'por qué se retiró y quién la retiró';
CREATE INDEX IF NOT EXISTS client_sede_datos_vigentes ON public.client_sede_datos (client_id, sede_id, campo) WHERE retirada_en IS NULL;
