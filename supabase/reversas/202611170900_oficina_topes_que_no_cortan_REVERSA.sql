-- REVERSA de 202611170900 · los 4 topes vuelven: post_img · kit_historias · carrusel_ig_v1 a 2,50 y concepto_mesa a 5, sin el dato de reserva. Exige lo que dejó la migración. Se niega con encargos vivos.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170900 REVERSA: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE (familia = 'post_img' AND tope_encargo_usd = 4 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'kit_historias' AND tope_encargo_usd = 5 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'carrusel_ig_v1' AND tope_encargo_usd = 7 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'concepto_mesa' AND tope_encargo_usd = 7 AND NOT limites ? 'reserva_por_pieza_usd')) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION '202611170900 REVERSA: los topes no son los que dejó la migración; no se pisan';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo AS t
   SET tope_encargo_usd = n.tope,
       limites = jsonb_set(t.limites - 'reserva_por_pieza_usd', '{tope_encargo_usd}', to_jsonb(n.tope)),
       version = t.version + 1
  FROM (VALUES ('post_img', 2.5::numeric), ('kit_historias', 2.5::numeric), ('carrusel_ig_v1', 2.5::numeric), ('concepto_mesa', 5::numeric)) AS n(familia, tope)
 WHERE t.familia = n.familia;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE (familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND tope_encargo_usd = 2.50 AND (limites->>'tope_encargo_usd')::numeric = 2.5 AND NOT limites ? 'reserva_por_pieza_usd')
         OR (familia = 'concepto_mesa' AND tope_encargo_usd = 5.00 AND (limites->>'tope_encargo_usd')::numeric = 5 AND NOT limites ? 'reserva_por_pieza_usd')) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION '202611170900 REVERSA: los 4 topes no volvieron';
  END IF;
END $$;

COMMIT;
