-- 202611170900 · TOPES QUE NO CORTAN EL TRABAJO · CC1 · ADENDA 08:06 de Lenovo (regla de Emilio: «es peor gastar 18 y que se pierda por tope de 21, que gastar 25 y que se complete»)
-- La cuenta del motor real en el PEOR caso (todas las vueltas y la re-imagen; cada paso al mayor entre su gasto real máximo y su reserva; la jefatura al mayor real visto, 0,985):
--   post_img 3,34 · kit_historias 4,07 · carrusel_ig_v1 5,83 → con 2,50 se cortaban a medias. concepto_mesa: un encargo real terminado gastó 6,15 y la mesa corta en 1,2 × tope = 6,00.
-- Topes nuevos: post_img 4 · kit_historias 5 · carrusel_ig_v1 7 · concepto_mesa 7. Columna y llave `limites.tope_encargo_usd` (las dos deben coincidir) + `version`.
-- Para que el freno de la CAMPAÑA no cambie: las 3 de pieza (sin historia suficiente) llevan `limites.reserva_por_pieza_usd` = 2,5 (lo que hoy reserva: su tope viejo).
-- Nada se enciende ni se gasta. Se niega con encargos vivos y si los topes de hoy no son los esperados. Reversa: reversas/202611170900_oficina_topes_que_no_cortan_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611170900: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE (familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias') AND tope_encargo_usd = 2.50 AND (limites->>'tope_encargo_usd')::numeric = 2.5 AND NOT limites ? 'reserva_por_pieza_usd')
         OR (familia = 'concepto_mesa' AND tope_encargo_usd = 5.00 AND (limites->>'tope_encargo_usd')::numeric = 5 AND NOT limites ? 'reserva_por_pieza_usd')) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION '202611170900: los topes de hoy no son los esperados (2,5 · 2,5 · 2,5 · 5 sin dato de reserva); no se pisan';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo AS t
   SET tope_encargo_usd = n.tope,
       limites = CASE WHEN n.reserva IS NULL THEN jsonb_set(t.limites, '{tope_encargo_usd}', to_jsonb(n.tope))
                      ELSE jsonb_set(jsonb_set(t.limites, '{tope_encargo_usd}', to_jsonb(n.tope)), '{reserva_por_pieza_usd}', to_jsonb(n.reserva)) END,
       version = t.version + 1
  FROM (VALUES ('post_img', 4::numeric, 2.5::numeric), ('kit_historias', 5::numeric, 2.5::numeric), ('carrusel_ig_v1', 7::numeric, 2.5::numeric), ('concepto_mesa', 7::numeric, NULL::numeric)) AS n(familia, tope, reserva)
 WHERE t.familia = n.familia;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo
      WHERE (familia = 'post_img' AND tope_encargo_usd = 4 AND (limites->>'tope_encargo_usd')::numeric = 4 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'kit_historias' AND tope_encargo_usd = 5 AND (limites->>'tope_encargo_usd')::numeric = 5 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'carrusel_ig_v1' AND tope_encargo_usd = 7 AND (limites->>'tope_encargo_usd')::numeric = 7 AND (limites->>'reserva_por_pieza_usd')::numeric = 2.5)
         OR (familia = 'concepto_mesa' AND tope_encargo_usd = 7 AND (limites->>'tope_encargo_usd')::numeric = 7 AND NOT limites ? 'reserva_por_pieza_usd')) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION '202611170900: los 4 topes no quedaron como se esperaba';
  END IF;
END $$;

COMMIT;
