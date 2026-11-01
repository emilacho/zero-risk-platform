ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_semanas_de_tanda_valida;
ALTER TABLE public.cadena_campanas DROP COLUMN IF EXISTS semanas_de_tanda;
