-- REVERSA de 202611201600 · saca de video_mesa SOLO los 3 pasos de la corrección (corregir_imagen · editar_imagen · mirar_correccion), vuelve margen 1102 → 50,
-- reserva 31,6 → 30, tope fijo 45,75 → 45, por segundo 5,395/5,435 → 4,86/4,9, columna 693,15 → 628,2, quita vueltas_ y turnos_de_correccion_imagen y la indicación
-- del director, y baja el techo de la base 1000 → 650.
-- Exige que la fila tenga EXACTAMENTE lo que dejó la migración (con otra encima, frena: deshacer primero esa) y se niega con encargos vivos de video_mesa.
-- CC6 (16:40Z): el techo vale para TODAS las familias: frena si ya hay un encargo o una plantilla (de cualquier familia) con tope por encima de 650.
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo FOR UPDATE;

DO $$
DECLARE
  g record;
  orden text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'video_mesa') THEN
    RAISE EXCEPTION 'REVERSA 202611201600: hay un encargo vivo de video_mesa; esperar a que cierre';
  END IF;
  SELECT * INTO g FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa';
  SELECT string_agg(p->>'clave', ',' ORDER BY o) INTO orden FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o);
  IF orden IS DISTINCT FROM 'abrir,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,imagenes_clave_final,corregir_imagen,editar_imagen,mirar_correccion,revisar_imagenes_clave,pedido,video,cuadros_video,mirar_video,chequeos,jefatura,chequeos_2,entrega,cierre' THEN
    RAISE EXCEPTION 'REVERSA 202611201600: los pasos de video_mesa no son los que dejó la migración (%): hay otra migración encima; deshacer primero esa', orden;
  END IF;
  IF (g.limites->>'margen')::numeric IS DISTINCT FROM 1102 OR (g.limites->>'reserva_por_pieza_usd')::numeric IS DISTINCT FROM 31.6
     OR (g.limites->>'tope_encargo_usd')::numeric IS DISTINCT FROM 45.75 OR g.limites->'tope_encargo_usd_por_segundo' IS DISTINCT FROM '{"720p":5.395,"1080p":5.435}'::jsonb
     OR (g.limites->>'vueltas_de_correccion_imagen') IS DISTINCT FROM '3' OR (g.limites->>'turnos_de_correccion_imagen') IS DISTINCT FROM '12'
     OR (g.limites->'video'->>'segundos_max')::numeric IS DISTINCT FROM 120 OR g.tope_encargo_usd IS DISTINCT FROM 693.15::numeric
     OR (SELECT p->'vuelve_a'->>'max' FROM jsonb_array_elements(g.pasos) p WHERE p->>'clave' = 'mirar_correccion') IS DISTINCT FROM '350' THEN
    RAISE EXCEPTION 'REVERSA 202611201600: los límites o el tope de video_mesa no son los que dejó la migración: hay otra migración encima; deshacer primero esa';
  END IF;
  IF g.indicaciones->'creative-director-mesa' IS DISTINCT FROM $i$[{"regla":"Cuando miras las imágenes clave que pediste en la hoja de planos, NO las calificas: eliges la versión sobre la que se edita y dices qué cambiar, en lenguaje llano y concreto, para que cada una cumpla su plano y se parezca a la foto real. Si no hay nada que cambiar, no inventes cambios.","aplica":"guia"}]$i$::jsonb THEN
    RAISE EXCEPTION 'REVERSA 202611201600: las indicaciones del director no son las que dejó la migración; no se tocan';
  END IF;
  -- CC6: volver a 650 deja fuera de la regla a lo que ya pasó de 650 (en cualquier familia): frena antes de tocar nada
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE tope_usd > 650) THEN
    RAISE EXCEPTION 'REVERSA 202611201600: hay encargos con tope por encima de 650 (%); volver a 650 los deja fuera de la regla', (SELECT count(*) FROM public.oficina_encargos WHERE tope_usd > 650);
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo <> 'video_mesa' AND tope_encargo_usd > 650) THEN
    RAISE EXCEPTION 'REVERSA 202611201600: hay otra plantilla con tope por encima de 650 (%); volver a 650 la deja fuera de la regla', (SELECT string_agg(tipo, ', ') FROM public.oficina_tipos_de_grupo WHERE tipo <> 'video_mesa' AND tope_encargo_usd > 650);
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET pasos = (SELECT jsonb_agg(z.p ORDER BY z.o) FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o) WHERE z.p->>'clave' NOT IN ('corregir_imagen', 'editar_imagen', 'mirar_correccion')),
    limites = (g.limites - 'vueltas_de_correccion_imagen' - 'turnos_de_correccion_imagen') || jsonb_build_object(
      'margen', 50, 'reserva_por_pieza_usd', 30, 'tope_encargo_usd', 45, 'tope_encargo_usd_por_segundo', '{"720p":4.86,"1080p":4.9}'::jsonb),
    tope_encargo_usd = 628.2,
    indicaciones = g.indicaciones - 'creative-director-mesa',
    version = g.version + 1
WHERE g.tipo = 'video_mesa';

ALTER TABLE public.oficina_encargos DROP CONSTRAINT oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 650);
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 650);

DO $$
DECLARE
  orden text;
BEGIN
  SELECT string_agg(p->>'clave', ',' ORDER BY o) INTO orden FROM public.oficina_tipos_de_grupo g, jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o) WHERE g.tipo = 'video_mesa';
  IF orden IS DISTINCT FROM 'abrir,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,imagenes_clave_final,revisar_imagenes_clave,pedido,video,cuadros_video,mirar_video,chequeos,jefatura,chequeos_2,entrega,cierre' THEN
    RAISE EXCEPTION 'REVERSA 202611201600: video_mesa no quedó como antes de la migración (%)', orden;
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('oficina_encargos_tope_valido', 'oficina_tipos_tope_valido') AND pg_get_constraintdef(oid) LIKE '%<= (650)::numeric%') <> 2 THEN
    RAISE EXCEPTION 'REVERSA 202611201600: el techo de los topes de la base no volvió a 650';
  END IF;
END $$;

COMMIT;
