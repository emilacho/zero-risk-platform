-- REVERSA de 202610281500_oficina_la_mesa · quita las dos plantillas de la mesa, el libro de aportes y el directorio. Se niega si existe algún encargo de la mesa (no se borra el rastro de una pieza hecha).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE tipo_de_grupo IN ('carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION 'hay encargos de la mesa: no se quita su plantilla ni su libro';
  END IF;
END $$;
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo IN ('carrusel_mesa', 'kit_mesa');
DROP TABLE IF EXISTS public.oficina_mesa_aportes;
DROP TABLE IF EXISTS public.oficina_directorio;
COMMIT;
NOTIFY pgrst, 'reload schema';
