-- REVERSA de 202610311500_cadena_dos_dias_mas_de_margen.sql: resta 2 días a cada formato SOLO si la marca existe (así no resta de más) y quita la marca.
DO $cadena$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cadena_config WHERE clave = 'lead_mas_2_aplicado') THEN
    UPDATE public.cadena_formatos_por_red SET lead_dias = GREATEST(lead_dias - 2, 0);
    DELETE FROM public.cadena_config WHERE clave = 'lead_mas_2_aplicado';
  END IF;
END
$cadena$;
