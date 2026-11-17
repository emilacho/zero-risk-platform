-- REVERSA de 202611180030_oficina_mesa_de_correccion_del_banco.sql · se niega si ya hay encargos de la mesa (no se borra una plantilla con historia).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'banco_mesa') THEN
    RAISE EXCEPTION 'hay encargos de banco_mesa: la reversa no borra una plantilla con historia';
  END IF;
END $$;

UPDATE public.oficina_directorio
   SET pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post'], actualizado_en = now()
 WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'];

DELETE FROM public.oficina_tipos_de_grupo WHERE tipo = 'banco_mesa';

COMMIT;
NOTIFY pgrst, 'reload schema';
