-- 31-oct (ENCARGO Lenovo «dos días más de margen», aprobado por Emilio) · CC#2
-- A cada formato se le suman 2 días de anticipación (`lead_dias`): la pieza se produce 2 días antes para dar margen de revisar, corregir y aprobar.
-- La fecha, la hora y el canal del calendario NO cambian. Es DATO (la cadena no tiene el número en el código).
-- IDEMPOTENTE: una marca en `cadena_config` ('lead_mas_2_aplicado') impide sumar dos veces si se vuelve a correr.
-- REVERSA: supabase/reversas/202610311500_cadena_dos_dias_mas_de_margen_REVERSA.sql (resta 2 solo si la marca existe). Respaldo previo: raw/backups/2026-10-31-cadena-formatos-lead-antes.json (vault).
DO $cadena$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cadena_config WHERE clave = 'lead_mas_2_aplicado') THEN
    UPDATE public.cadena_formatos_por_red SET lead_dias = lead_dias + 2;
    INSERT INTO public.cadena_config (clave, valor) VALUES ('lead_mas_2_aplicado', 'true'::jsonb);
  END IF;
END
$cadena$;
