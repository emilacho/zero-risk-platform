-- OFICINA · TOPE POR ENCARGO 1,50 → 2,50 en las 3 familias de pieza · CC#2 · 2026-10-27 · firma de Emilio («dale» 27-oct 20:16Z, GO fusionar-y-encender-oficina).
-- Cambia la columna y la llave `limites.tope_encargo_usd` (las dos deben coincidir) y sube `version`. Los encargos ya creados conservan su propio tope.
-- REVERSA: supabase/reversas/202610272100_oficina_tope_encargo_2_50_REVERSA.sql
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'hay encargos de la oficina en vuelo: no se cambia la plantilla a mitad de un encargo';
  END IF;
END $$;
UPDATE public.oficina_tipos_de_grupo
   SET tope_encargo_usd = 2.50, limites = jsonb_set(limites, '{tope_encargo_usd}', '2.5'::jsonb), version = version + 1
 WHERE tipo IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND tope_encargo_usd = 1.50;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND tope_encargo_usd = 2.50 AND (limites->>'tope_encargo_usd')::numeric = 2.5;
  IF n <> 3 THEN RAISE EXCEPTION 'se esperaban las 3 plantillas con tope 2,50 y hay %', n; END IF;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
