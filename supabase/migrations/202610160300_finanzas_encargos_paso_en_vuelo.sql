-- OFICINA FINANCIERA · candado de «paso en vuelo» (arreglo del intento 4 · CC#2 · 16-oct)
-- Una sola llamada ejecuta un paso de un encargo a la vez: `en_vuelo_desde` lo marca y vence a los 15 min (un paso muerto no atasca el encargo).
-- Solo AGREGA una columna nullable: ningún dato existente cambia y el código funciona sin ella (sigue sin candado y lo declara).
BEGIN;
ALTER TABLE public.finanzas_encargos ADD COLUMN IF NOT EXISTS en_vuelo_desde timestamptz;
COMMENT ON COLUMN public.finanzas_encargos.en_vuelo_desde IS 'candado de paso en vuelo: no nulo = una llamada ejecuta un paso de este encargo; vence a los 900 s';
NOTIFY pgrst, 'reload schema';
COMMIT;
