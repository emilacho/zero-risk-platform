-- 202611172100 · ENCENDIDO DE PROPUESTAS EN IMAGEN (kit_mesa · carrusel_mesa · post_mesa) · CC1 · GO Lenovo (RESPUESTA-LENOVO-a-CC1-encendido-propuestas-imagen, paso 2) · US$ 0
-- Solo DATO, derivado de las FILAS VIVAS (leídas el 17-nov): es exactamente `conPropuestasDeImagen(fila viva)` de src/lib/oficina/plantillas/imagen-propuestas.ts.
--   · pasos: después de `mesa` entran `borrador_imagen` (tope 0,48; en post 0,18) y `aprobar_propuestas` (vuelve a la mesa, máx. 2, si el dueño pide cambios)
--   · limites: propuestas {n:3} · cota_de_la_mesa_usd 3,2 (por pasada) · tope_encargo_usd = el que sale de la cuenta (kit 18 · carrusel 15 · post 15)
--   · la columna tope_encargo_usd igual que el límite
-- No toca indicaciones, modelos, activo ni los demás pasos. Se niega con encargos vivos (no cuenta el que solo espera al dueño) y si la fila no es la esperada.
-- Reversa: supabase/reversas/202611172100_oficina_imagen_con_propuestas_REVERSA.sql
BEGIN;

DO $$
DECLARE t text;
BEGIN
  -- encargo vivo = abierto o en paso, SALVO el que solo espera al dueño (la misma guarda de 202611172000 y 202611171900, certificada por CC6)
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND NOT (
       EXISTS (SELECT 1 FROM public.oficina_turnos x WHERE x.encargo_id = e.id AND x.estado IN ('pendiente', 'corriendo') AND x.tipo = 'dueno')
       AND NOT EXISTS (SELECT 1 FROM public.oficina_turnos x WHERE x.encargo_id = e.id AND x.estado IN ('pendiente', 'corriendo') AND x.tipo <> 'dueno'))) THEN
    RAISE EXCEPTION '202611172100: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  FOREACH t IN ARRAY ARRAY['kit_mesa', 'carrusel_mesa', 'post_mesa'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = t) THEN
      RAISE EXCEPTION '202611172100: no existe la fila %', t;
    END IF;
    IF (SELECT count(*) FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' = 'mesa') IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '202611172100: % no tiene exactamente un paso mesa; no se toca', t;
    END IF;
    IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) p WHERE g.tipo = t AND p->>'clave' IN ('borrador_imagen', 'aprobar_propuestas')) THEN
      RAISE EXCEPTION '202611172100: % ya tiene propuestas; no se pisa', t;
    END IF;
    IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = t AND (g.limites ? 'propuestas' OR g.limites ? 'cota_de_la_mesa_usd')) THEN
      RAISE EXCEPTION '202611172100: % ya trae propuestas o cota en sus límites; no se pisa', t;
    END IF;
    -- la fila es la leída: tope 5 en la columna y en el límite (si cambió, se vuelve a derivar)
    IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = t AND g.tope_encargo_usd = 5 AND (g.limites->>'tope_encargo_usd')::numeric = 5) THEN
      RAISE EXCEPTION '202611172100: el tope de % no es el leído (5); volver a derivar desde la fila viva', t;
    END IF;
  END LOOP;
END $$;

-- los dos pasos nuevos, justo después de `mesa`
UPDATE public.oficina_tipos_de_grupo g
SET pasos = (
  SELECT jsonb_agg(q ORDER BY i, j)
  FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i),
  LATERAL (
    SELECT p AS q, 0 AS j
    UNION ALL
    SELECT n.q, n.j FROM (VALUES
      (jsonb_build_object('clave', 'borrador_imagen', 'tipo', 'codigo', 'quien', 'sala', 'funcion', 'borrador_imagen', 'condicion', '{"tipo":"siempre"}'::jsonb, 'entrada', '["mesa"]'::jsonb, 'salida_artefacto', 'borrador_imagen', 'tope_usd', CASE WHEN g.tipo = 'post_mesa' THEN 0.18 ELSE 0.48 END), 1),
      ($a${"clave":"aprobar_propuestas","tipo":"codigo","quien":"sala","funcion":"aprobar_propuestas","condicion":{"tipo":"siempre"},"entrada":["mesa"],"salida_artefacto":"aprobacion_propuestas","tope_usd":0,"vuelve_a":{"paso":"mesa","max":2,"si":{"tipo":"si_artefacto","artefacto":"aprobacion_propuestas","campo":"vuelve_a_la_mesa","igual":true}}}$a$::jsonb, 2)
    ) AS n(q, j) WHERE p->>'clave' = 'mesa'
  ) y
),
limites = g.limites || jsonb_build_object('propuestas', '{"n":3}'::jsonb, 'cota_de_la_mesa_usd', 3.2, 'tope_encargo_usd', CASE WHEN g.tipo = 'kit_mesa' THEN 18 ELSE 15 END),
tope_encargo_usd = CASE WHEN g.tipo = 'kit_mesa' THEN 18 ELSE 15 END
WHERE g.tipo IN ('kit_mesa', 'carrusel_mesa', 'post_mesa');

DO $$
DECLARE t text; orden text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kit_mesa', 'carrusel_mesa', 'post_mesa'] LOOP
    SELECT string_agg(p->>'clave', ',' ORDER BY i) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i) WHERE g.tipo = t;
    IF orden NOT LIKE '%,mesa,borrador_imagen,aprobar_propuestas,imagen,%' THEN
      RAISE EXCEPTION '202611172100: % no quedó con mesa → borrador_imagen → aprobar_propuestas → imagen (%)', t, orden;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = t AND g.limites->'propuestas'->>'n' = '3' AND (g.limites->>'cota_de_la_mesa_usd')::numeric = 3.2
                   AND (g.limites->>'tope_encargo_usd')::numeric = g.tope_encargo_usd AND g.tope_encargo_usd = CASE WHEN t = 'kit_mesa' THEN 18 ELSE 15 END) THEN
      RAISE EXCEPTION '202611172100: los límites de % no quedaron como se esperaba', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
