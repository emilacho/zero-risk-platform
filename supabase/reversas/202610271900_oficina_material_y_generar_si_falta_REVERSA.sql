-- REVERSA de 202610271900_oficina_material_y_generar_si_falta · quita las llaves que esa migración fusionó y devuelve `imagenes_generadas_max` a lo que era (carrusel 2 · kit 3 — comprobar contra la base viva ANTES de aplicar la migración y ajustar aquí si difiere).
-- Se niega si hay encargos en vuelo o si ya existe algún turno de tipo «material» (borrar el tipo del CHECK dejaría la fila inválida). No toca `tope_encargo_usd` ni los pasos.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'hay encargos de la oficina en vuelo: no se cambia la plantilla a mitad de un encargo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_turnos WHERE tipo = 'material') THEN
    RAISE EXCEPTION 'ya hay turnos de tipo material registrados: no se retira el tipo del CHECK (se conserva el historial)';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo SET
  limites = limites - 'material_activo' - 'material_plazo_min' - 'material_techo_min' - 'material_tope_usd' - 'material_max_pedidos_por_encargo' - 'generar_cuando_no_hay_foto' - 'roles_sin_imagen',
  version = version + 1
WHERE tipo IN ('post_img', 'carrusel_ig_v1', 'kit_historias');
UPDATE public.oficina_tipos_de_grupo SET limites = jsonb_set(limites, '{imagenes_generadas_max}', '2'::jsonb), version = version + 1 WHERE tipo = 'carrusel_ig_v1';
UPDATE public.oficina_tipos_de_grupo SET limites = jsonb_set(limites, '{imagenes_generadas_max}', '3'::jsonb), version = version + 1 WHERE tipo = 'kit_historias';

ALTER TABLE public.oficina_turnos DROP CONSTRAINT IF EXISTS oficina_turnos_tipo_valido;
ALTER TABLE public.oficina_turnos ADD CONSTRAINT oficina_turnos_tipo_valido CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura'));
COMMIT;
NOTIFY pgrst, 'reload schema';
