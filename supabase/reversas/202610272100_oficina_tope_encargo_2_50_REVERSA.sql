-- REVERSA de 202610272100_oficina_tope_encargo_2_50 · devuelve el tope por encargo a 1,50 (columna y límites). Se niega con encargos en vuelo.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'hay encargos de la oficina en vuelo: no se cambia la plantilla a mitad de un encargo';
  END IF;
END $$;
UPDATE public.oficina_tipos_de_grupo
   SET tope_encargo_usd = 1.50, limites = jsonb_set(limites, '{tope_encargo_usd}', '1.5'::jsonb), version = version + 1
 WHERE tipo IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND tope_encargo_usd = 2.50;
COMMIT;
NOTIFY pgrst, 'reload schema';
