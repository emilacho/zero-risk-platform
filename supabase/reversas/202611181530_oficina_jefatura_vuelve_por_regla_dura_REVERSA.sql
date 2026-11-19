-- REVERSA de 202611181530 · la jefatura vuelve a como estaba: post, carrusel y video con mesa SIN vuelta; kit_mesa con su vuelta de max 1.
-- Se niega con encargos vivos y si la vuelta de hoy no es la que puso 202611181530.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'REVERSA 202611181530: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p
      WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa', 'kit_mesa') AND p->>'clave' = 'jefatura'
        AND p->'vuelve_a' IS DISTINCT FROM $hoy${"paso":"mesa","max":6,"si":{"tipo":"si_artefacto","artefacto":"respuesta_imagen","campo":"vuelve_a_la_mesa","igual":true}}$hoy$::jsonb) THEN
    RAISE EXCEPTION 'REVERSA 202611181530: alguna jefatura no tiene la vuelta que puso 202611181530; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo t
SET pasos = (
  SELECT jsonb_agg(CASE WHEN x.p->>'clave' <> 'jefatura' THEN x.p
                        WHEN t.familia = 'kit_mesa' THEN x.p || jsonb_build_object('vuelve_a', $antes${"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"respuesta_imagen","campo":"vuelve_a_la_mesa","igual":true}}$antes$::jsonb)
                        ELSE x.p - 'vuelve_a' END ORDER BY x.i)
  FROM jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, i)
)
WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa', 'kit_mesa');

COMMIT;
