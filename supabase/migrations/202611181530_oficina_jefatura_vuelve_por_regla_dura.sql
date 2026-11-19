-- 202611181530 · LA REGLA DURA ROTA VUELVE AL CREADOR · CC4 · GO Lenovo 18-nov 13:52Z (DECISION-EMILIO «nada detiene el flujo») · certifica CC6.
-- Solo DATO: el paso `jefatura` de las cuatro plantillas con mesa puede devolver la pieza a la mesa (`vuelve_a`):
--   · post_mesa, carrusel_mesa, video_mesa: no tenían vuelta (una regla dura rota llegaba a la bandeja como observación) → la ganan;
--   · kit_mesa: tenía UNA vuelta (max 1) → la misma vuelta con max 6.
-- El tope real es el dinero del encargo (cada vuelta tiene que caber en lo que queda) y los pasos de la plantilla; `max` 6 es la red de seguridad (guardrail 2).
-- Lo de criterio sigue teniendo UNA vuelta: el código no lo reabre después (paso-jefatura.ts). Es el dato EXACTO de src/lib/oficina/plantillas/vuelta-por-regla-dura.ts (una prueba lo mantiene igual).
-- No cambia el orden de los pasos ni ningún otro campo. Se niega con encargos vivos y si el dato de antes no es el esperado. Reversa: reversas/202611181530_oficina_jefatura_vuelve_por_regla_dura_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611181530: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  -- cada familia tiene UN paso jefatura y su vuelta de antes es la esperada: si alguien la cambió, no se pisa
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p
      WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa', 'kit_mesa') AND p->>'clave' = 'jefatura') IS DISTINCT FROM 4::bigint THEN
    RAISE EXCEPTION '202611181530: no hay exactamente un paso jefatura en cada una de las cuatro familias; no se pisa';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p
      WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa') AND p->>'clave' = 'jefatura' AND p ? 'vuelve_a') THEN
    RAISE EXCEPTION '202611181530: la jefatura de post, carrusel o video con mesa ya tiene vuelta; no se pisa';
  END IF;
  IF (SELECT p->'vuelve_a' FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p WHERE t.familia = 'kit_mesa' AND p->>'clave' = 'jefatura')
     IS DISTINCT FROM $antes${"si":{"tipo":"si_artefacto","campo":"vuelve_a_la_mesa","igual":true,"artefacto":"respuesta_imagen"},"max":1,"paso":"mesa"}$antes$::jsonb THEN
    RAISE EXCEPTION '202611181530: la vuelta de la jefatura de kit_mesa no es la esperada; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo t
SET pasos = (
  SELECT jsonb_agg(CASE WHEN x.p->>'clave' = 'jefatura' THEN x.p || jsonb_build_object('vuelve_a', $vuelta${"paso":"mesa","max":6,"si":{"tipo":"si_artefacto","artefacto":"respuesta_imagen","campo":"vuelve_a_la_mesa","igual":true}}$vuelta$::jsonb) ELSE x.p END ORDER BY x.i)
  FROM jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, i)
)
WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa', 'kit_mesa');

COMMIT;
