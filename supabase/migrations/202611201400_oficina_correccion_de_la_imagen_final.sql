-- 202611201400 · PUNTO 3 (va después de 202611201330, la reserva por pieza de CC2, que necesita aplicada) · tanda 1 · LA CORRECCIÓN DE LA IMAGEN FINAL · CC1 · 20-nov · US$ 0 (escribir una plantilla no gasta)
-- GO Lenovo a CC1 12:18Z (2026-11-20-GO-LENOVO-a-CC1-punto-3-dos-versiones-y-rondas) · diseño v3 de CC5 con las 9 condiciones de CC6 y CC7 · opción (a) de Lenovo para las vueltas.
-- En las 3 mesas de imagen final (post, carrusel, kit) mete 3 pasos JUSTO DESPUÉS de `imagen` (por clave): corregir_imagen · editar_imagen · mirar_correccion.
--   · la condición de los 3 es la MISMA del paso `imagen` de cada fila (se copia de la fila, no se escribe aquí)
--   · editar_imagen reserva imagenes_generadas_max × 0,07 (post 3 → 0,21 · carrusel y kit 8 → 0,56); mirar_correccion × 0,26 por llamada al revisor (post 0,78 · 2,08)
--   · la mirada del creativo 0,75 (topes = 2–3× lo medido en prd el 20-nov) · reserva_por_pieza_usd + lo ESPERADO de la corrección (post 0,40 · carrusel y kit 0,90)
--   · la vuelta de mirar_correccion es el TECHO DE SEGURIDAD del motor: 2 regresos × (1 + 6 de la vuelta de la jefatura a la mesa) = 14; la cuenta que decide va por imagen (3 vueltas)
--   · limites.margen + 44 (14 × 3 + 2) · limites.vueltas_de_correccion_imagen = 3 · la indicación del creativo (la agrega al final de la suya, si tuviera)
-- Solo toca lo suyo: no cambia ningún paso existente, ni topes, ni cota. Se niega con encargos vivos de esas familias, si una fila no tiene `imagen` seguido de `observar`,
-- si ya tiene la corrección, o si la vuelta que la envuelve no es la de la jefatura con máximo 6 (el 14 sale de ahí). Los pasos literales los fija una prueba contra el código.
-- Reversa: supabase/reversas/202611201400_oficina_correccion_de_la_imagen_final_REVERSA.sql
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;

DO $$
DECLARE
  f record;
  i_img int;
  envuelve numeric;
  otras int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN
    RAISE EXCEPTION '202611201400: hay un encargo vivo de una mesa de imagen; esperar a que cierre';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) <> 3 THEN
    RAISE EXCEPTION '202611201400: no están las 3 filas de las mesas de imagen';
  END IF;
  FOR f IN SELECT tipo, pasos, limites FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(f.pasos) p WHERE p->>'clave' IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')) THEN
      RAISE EXCEPTION '202611201400: % ya tiene la corrección de la imagen; no se toca', f.tipo;
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(f.pasos) p WHERE p->>'clave' = 'imagen') <> 1 THEN
      RAISE EXCEPTION '202611201400: % no tiene exactamente un paso «imagen»', f.tipo;
    END IF;
    SELECT (o - 1)::int INTO i_img FROM jsonb_array_elements(f.pasos) WITH ORDINALITY z(p, o) WHERE z.p->>'clave' = 'imagen';
    IF f.pasos->(i_img + 1)->>'clave' IS DISTINCT FROM 'observar' THEN
      RAISE EXCEPTION '202611201400: en % el paso después de «imagen» no es «observar»', f.tipo;
    END IF;
    IF jsonb_typeof(f.limites->'margen') IS DISTINCT FROM 'number' OR jsonb_typeof(f.limites->'imagenes_generadas_max') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '202611201400: % no tiene margen o imagenes_generadas_max numéricos', f.tipo;
    END IF;
    -- va DESPUÉS de la reserva por pieza de CC2 (la fila: #1249 → la reserva → #1248): sin su dato no hay piso que subir
    IF jsonb_typeof(f.limites->'reserva_por_pieza_usd') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '202611201400: % no tiene limites.reserva_por_pieza_usd (va después de la migración de la reserva por pieza)', f.tipo;
    END IF;
    -- las vueltas que ENVUELVEN a la corrección: salen después de «imagen» y vuelven a un paso antes de él (en las filas leídas: solo la jefatura a la mesa, máximo 6)
    SELECT coalesce(sum((z.p->'vuelve_a'->>'max')::numeric), 0), count(*) INTO envuelve, otras
      FROM jsonb_array_elements(f.pasos) WITH ORDINALITY z(p, o)
      WHERE z.p ? 'vuelve_a' AND (z.o - 1) > i_img
        AND (SELECT (y.o - 1) FROM jsonb_array_elements(f.pasos) WITH ORDINALITY y(p, o) WHERE y.p->>'clave' = z.p->'vuelve_a'->>'paso') < i_img;
    IF envuelve <> 6 OR otras <> 1 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f.pasos) p WHERE p->>'clave' = 'jefatura' AND p->'vuelve_a'->>'paso' = 'mesa' AND (p->'vuelve_a'->>'max')::int = 6) THEN
      RAISE EXCEPTION '202611201400: en % la vuelta que envuelve a la corrección no es solo la de la jefatura con máximo 6 (el techo 14 sale de ahí); medir de nuevo', f.tipo;
    END IF;
  END LOOP;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET pasos = (
      SELECT jsonb_agg(x.p ORDER BY x.o)
      FROM (
        SELECT z.p, z.o::numeric AS o FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o)
        UNION ALL
        SELECT jsonb_set(n.p, '{condicion}', (SELECT y.p->'condicion' FROM jsonb_array_elements(g.pasos) y(p) WHERE y.p->>'clave' = 'imagen'))
                 || CASE n.p->>'clave'
                      WHEN 'editar_imagen' THEN jsonb_build_object('tope_usd', round((g.limites->>'imagenes_generadas_max')::numeric * 0.07, 4))
                      WHEN 'mirar_correccion' THEN jsonb_build_object('tope_usd', round((g.limites->>'imagenes_generadas_max')::numeric * 0.26, 4))
                      ELSE '{}'::jsonb END,
               (SELECT y.o FROM jsonb_array_elements(g.pasos) WITH ORDINALITY y(p, o) WHERE y.p->>'clave' = 'imagen')::numeric + n.k / 10.0
        FROM (VALUES
          -- PASO_LITERAL
          (1, '{"clave":"corregir_imagen","tipo":"agente","quien":"design-image-prompt-engineer","condicion":null,"entrada":["imagenes"],"salida_artefacto":"pedido_de_correccion","tope_usd":0.75,"salida":{"esquema":"correccion_imagen.v1","reintento_formato":1}}'::jsonb),
          -- PASO_LITERAL
          (2, '{"clave":"editar_imagen","tipo":"codigo","quien":"sala","funcion":"editar_imagen","condicion":null,"entrada":["pedido_de_correccion"],"salida_artefacto":"ediciones_de_imagen","tope_usd":null}'::jsonb),
          -- PASO_LITERAL
          (3, '{"clave":"mirar_correccion","tipo":"codigo","quien":"sala","funcion":"mirar_correccion","condicion":null,"entrada":["ediciones_de_imagen"],"salida_artefacto":"correcciones_de_imagen","tope_usd":null,"vuelve_a":{"paso":"corregir_imagen","max":14,"si":{"tipo":"si_artefacto","artefacto":"correcciones_de_imagen","campo":"sigue","igual":true}}}'::jsonb)
        ) n(k, p)
      ) x
    ),
    limites = g.limites || jsonb_build_object('margen', (g.limites->>'margen')::numeric + 44, 'vueltas_de_correccion_imagen', 3,
      -- RESERVA_LITERAL · lo ESPERADO de la corrección por pieza (no el peor caso) sube el piso de la reserva (CC7 en el GO de CC2, 12:49Z)
      'reserva_por_pieza_usd', (g.limites->>'reserva_por_pieza_usd')::numeric + CASE g.tipo WHEN 'post_mesa' THEN 0.4 WHEN 'carrusel_mesa' THEN 0.9 WHEN 'kit_mesa' THEN 0.9 END),
    indicaciones = coalesce(g.indicaciones, '{}'::jsonb) || jsonb_build_object('design-image-prompt-engineer',
      coalesce(g.indicaciones->'design-image-prompt-engineer', '[]'::jsonb)
      -- INDICACION_LITERAL
      || '[{"regla":"Cuando miras las imágenes finales que pediste, NO las calificas: eliges la versión sobre la que se edita y dices qué cambiar, en lenguaje llano y concreto, para que se parezcan a lo pedido y a la foto real. Si no hay nada que cambiar, no inventes cambios.","aplica":"guia"}]'::jsonb),
    version = g.version + 1
WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa');

DO $$
DECLARE
  f record;
  i_img int;
BEGIN
  FOR f IN SELECT tipo, pasos, limites FROM public.oficina_tipos_de_grupo WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') LOOP
    SELECT (o - 1)::int INTO i_img FROM jsonb_array_elements(f.pasos) WITH ORDINALITY z(p, o) WHERE z.p->>'clave' = 'imagen';
    IF f.pasos->(i_img + 1)->>'clave' IS DISTINCT FROM 'corregir_imagen' OR f.pasos->(i_img + 2)->>'clave' IS DISTINCT FROM 'editar_imagen'
       OR f.pasos->(i_img + 3)->>'clave' IS DISTINCT FROM 'mirar_correccion' OR f.pasos->(i_img + 4)->>'clave' IS DISTINCT FROM 'observar' THEN
      RAISE EXCEPTION '202611201400: en % los pasos no quedaron entre «imagen» y «observar»', f.tipo;
    END IF;
    IF f.pasos->(i_img + 1)->'condicion' IS DISTINCT FROM f.pasos->i_img->'condicion' OR f.pasos->(i_img + 3)->'condicion' IS DISTINCT FROM f.pasos->i_img->'condicion' THEN
      RAISE EXCEPTION '202611201400: en % la condición no es la de «imagen»', f.tipo;
    END IF;
    IF (f.pasos->(i_img + 2)->>'tope_usd')::numeric <> round((f.limites->>'imagenes_generadas_max')::numeric * 0.07, 4)
       OR (f.pasos->(i_img + 3)->>'tope_usd')::numeric <> round((f.limites->>'imagenes_generadas_max')::numeric * 0.26, 4) OR (f.limites->>'vueltas_de_correccion_imagen')::int <> 3 THEN
      RAISE EXCEPTION '202611201400: en % el tope de la edición o las vueltas no quedaron', f.tipo;
    END IF;
  END LOOP;
END $$;

COMMIT;
