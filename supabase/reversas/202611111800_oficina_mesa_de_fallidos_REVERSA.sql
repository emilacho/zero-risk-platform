-- REVERSA de 202611111800_oficina_mesa_de_fallidos.sql · deja la tarjeta de jefe-marketing como la dejó la reubicación (solo `reubicacion:dirige`) y quita la plantilla.
-- Se NIEGA si ya hay encargos de la mesa de revisión de fallidos (quitar la plantilla los dejaría sin su molde).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'fallidos_mesa') THEN
    RAISE EXCEPTION 'hay encargos de la mesa de revisión de fallidos: no se revierte (ciérralos o archívalos primero)';
  END IF;
END $$;
UPDATE public.oficina_directorio
   SET especialidad = 'decide qué hacer con las filas del calendario que quedaron atrás sin producir: reubicarlas, fusionarlas con una que viene o descartarlas, cada una con su razón',
       pertinente_en = ARRAY['reubicacion:dirige'], actualizado_en = now()
 WHERE agente = 'jefe-marketing' AND pertinente_en = ARRAY['reubicacion:dirige', 'fallidos:dirige'];
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'fallidos_mesa';
COMMIT;
NOTIFY pgrst, 'reload schema';
