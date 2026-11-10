-- REVERSA de 202611110000_oficina_mesa_de_reubicacion.sql · deja la tarjeta de jefe-marketing como estaba (miembro, sin mesas, inactiva) y quita la plantilla.
-- Se NIEGA si ya hay encargos de la mesa de reubicación (quitar la plantilla los dejaría sin su molde).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'reubicacion_mesa') THEN
    RAISE EXCEPTION 'hay encargos de la mesa de reubicación: no se revierte (ciérralos o archívalos primero)';
  END IF;
END $$;
UPDATE public.oficina_directorio
   SET rol = 'miembro', especialidad = 'dirige el departamento y escribe el plan de 90 días', pertinente_en = ARRAY[]::text[], activo = false, actualizado_en = now()
 WHERE agente = 'jefe-marketing';
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'reubicacion_mesa';
COMMIT;
NOTIFY pgrst, 'reload schema';
