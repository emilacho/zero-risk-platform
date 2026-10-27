-- OFICINA · EL MATERIAL QUE SE PIDE AL PORTERO Y LA IMAGEN QUE SE GENERA SI NO HAY FOTO · CC#2 · 2026-10-27 · SIN APLICAR (pide la firma de Emilio, la certificación de CC#3, 0 encargos en vuelo, n8n 0/0 y fuera de 12–14 UTC).
-- Dos cosas, ambas DATO (nada de código nuevo se enciende solo):
--   1) amplía el CHECK de los pasos registrados para admitir el tipo «material» (sin esto el primer turno de material no se podría anotar);
--   2) FUSIONA llaves nuevas en `limites` de las tres plantillas de pieza (no reemplaza nada, no toca `tope_encargo_usd` ni los pasos):
--        material_activo = false            el interruptor del portero: APAGADO. Se enciende en otra firma, DESPUÉS de publicar la rama `esperar_material` del flujo `oficina · turno` (scripts/ops/material-oficina).
--        material_plazo_min = 20            a los 20 min el vigía lee el pedido por su cuenta; material_techo_min = 30: pasado el techo se sigue SIN dato (se genera / se declara).
--        material_tope_usd = 0.4            lo máximo que se carga a un encargo por el portero (el portero ya topa en 0,40 por pedido).
--        material_max_pedidos_por_encargo = 1   un pedido por clase por encargo (sin bucles ni gasto doble).
--        generar_cuando_no_hay_foto = true  carrusel y kit ya no dejan una lámina vacía si no hay foto apta: se genera con el contexto del cliente, rotulada. Con esto también corren la guarda de prompts y la marca de origen.
--        roles_sin_imagen = ["cta","cierre"]  láminas tipográficas de marca (declaradas, no vacías).
--        imagenes_generadas_max = 8 (carrusel y kit; el post sigue en 3)   el tope de imágenes por pieza pasa a ser alto; el costo sigue contando contra `tope_encargo_usd` (no se cambia aquí).
-- NO sube `tope_encargo_usd` a 2,50 ni enciende DESCARTAR_EYEBROW_LARGO: son firmas de Emilio aparte. Repetible (fusionar dos veces da lo mismo). Requiere 202610090100, 202610100200 y 202610141000.
-- REVERSA: supabase/reversas/202610271900_oficina_material_y_generar_si_falta_REVERSA.sql
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'hay encargos de la oficina en vuelo: no se cambia la plantilla a mitad de un encargo';
  END IF;
END $$;

ALTER TABLE public.oficina_turnos DROP CONSTRAINT IF EXISTS oficina_turnos_tipo_valido;
ALTER TABLE public.oficina_turnos ADD CONSTRAINT oficina_turnos_tipo_valido CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material'));

UPDATE public.oficina_tipos_de_grupo SET
  limites = limites || $lim${"material_activo":false,"material_plazo_min":20,"material_techo_min":30,"material_tope_usd":0.4,"material_max_pedidos_por_encargo":1,"generar_cuando_no_hay_foto":true,"roles_sin_imagen":["cta","cierre"]}$lim$::jsonb,
  version = version + 1
WHERE tipo = 'post_img';

UPDATE public.oficina_tipos_de_grupo SET
  limites = limites || $lim${"material_activo":false,"material_plazo_min":20,"material_techo_min":30,"material_tope_usd":0.4,"material_max_pedidos_por_encargo":1,"generar_cuando_no_hay_foto":true,"roles_sin_imagen":["cta","cierre"],"imagenes_generadas_max":8}$lim$::jsonb,
  version = version + 1
WHERE tipo IN ('carrusel_ig_v1', 'kit_historias');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_tipos_de_grupo
   WHERE tipo IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND (limites->>'material_activo') = 'false' AND (limites->>'generar_cuando_no_hay_foto') = 'true';
  IF n <> 3 THEN
    RAISE EXCEPTION 'se esperaban las 3 plantillas con el material apagado y generar_cuando_no_hay_foto y hay %', n;
  END IF;
  SELECT count(*) INTO n FROM public.oficina_tipos_de_grupo WHERE tipo IN ('carrusel_ig_v1', 'kit_historias') AND (limites->>'imagenes_generadas_max')::int = 8;
  IF n <> 2 THEN
    RAISE EXCEPTION 'carrusel y kit deben quedar con imagenes_generadas_max = 8 y hay %', n;
  END IF;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
