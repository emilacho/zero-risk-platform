-- REVERSA de 202610160300_finanzas_encargos_paso_en_vuelo: quita el candado de «paso en vuelo» (el código sigue funcionando sin él).
BEGIN;
ALTER TABLE public.finanzas_encargos DROP COLUMN IF EXISTS en_vuelo_desde;
NOTIFY pgrst, 'reload schema';
COMMIT;
