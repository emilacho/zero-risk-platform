-- 202611201600 · PUNTO 3 TANDA 2 · LA CORRECCIÓN DE LAS IMÁGENES CLAVE DEL VIDEO (video_mesa) · CC1 · decisiones de LENOVO 16:55Z (GO 2026-11-20 punto 3) · US$ 0
-- Va DESPUÉS de 202611201500 (el segundo doctor de CC4): exige su paso `segunda_mirada` y la fila que dejó.
--   · 3 pasos nuevos entre `imagenes_clave_final` y `revisar_imagenes_clave`, con la misma condición de la revisión (se saltan en un ensayo):
--     corregir_imagen (creative-director-mesa, 0,75) · editar_imagen (4,0 por turno) · mirar_correccion (5,2 por turno, vuelve a corregir_imagen hasta 350 veces)
--     (LENOVO 18:30Z, opción (a): los topes de paso van por TURNO, 20 planos × 0,2 y × 0,26; el del encargo sigue por segundo)
--   · el techo 350 = (3 vueltas × 12 turnos − 1) × (1 + 9): las vueltas que envuelven el bloque en la fila leída suman 9 (revisión 1 · pedido 1 · mirada del video 1 ·
--     jefatura 6); 12 turnos = un plano por segundo a 120 s, 20 imágenes por pedido (la elegida y su foto real por plano). La cuenta que decide la lleva el código.
--   · margen 50 → 1102 (+ 350 × 3 + 2) · vueltas_de_correccion_imagen 3 · turnos_de_correccion_imagen 12
--   · tope del encargo: fijo 45 → 45,75 · por segundo 720p 4,86 → 5,395 y 1080p 4,9 → 5,435 · columna 628,2 → 693,15 (= 45,75 + 5,395 × 120). Es techo, no gasto.
--   · reserva por pieza 30 → 31,6 (lo esperado de la corrección en un reel de 15 s; punto 1 de CC6)
--   · la regla del director (indicación «guia») · el techo de la base de los topes 650 → 1000 (LENOVO: límites técnicos al máximo; un tope no es gasto),
--     en `oficina_encargos_tope_valido` y `oficina_tipos_tope_valido` (las dos de 202611171900), para TODAS las familias.
-- No toca las mesas de imagen, ni los demás pasos, modelos, activo, cota ni la resolución. version + 1. Se niega con encargos vivos de video_mesa.
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.oficina_encargos IN SHARE MODE;
SELECT 1 FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa' FOR UPDATE;

DO $$
DECLARE
  g record;
  orden text;
  i_final int;
  envuelve numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'video_mesa') THEN
    RAISE EXCEPTION '202611201600: hay un encargo vivo de video_mesa; esperar a que cierre';
  END IF;
  SELECT * INTO g FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa';
  IF NOT FOUND THEN
    RAISE EXCEPTION '202611201600: no está la fila de video_mesa';
  END IF;
  -- los pasos leídos: los de la fila viva con el `segunda_mirada` de 202611201500 (CC4), y nada de esta corrección
  SELECT string_agg(p->>'clave', ',' ORDER BY o) INTO orden FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o);
  IF orden IS DISTINCT FROM 'abrir,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,imagenes_clave_final,revisar_imagenes_clave,pedido,video,cuadros_video,mirar_video,chequeos,jefatura,chequeos_2,entrega,cierre' THEN
    RAISE EXCEPTION '202611201600: los pasos de video_mesa no son los leídos (¿falta 202611201500?): %', orden;
  END IF;
  -- la revisión de las imágenes clave lleva la condición que copian los pasos nuevos
  IF (SELECT p->'condicion' FROM jsonb_array_elements(g.pasos) p WHERE p->>'clave' = 'revisar_imagenes_clave')
     IS DISTINCT FROM '{"tipo":"si_artefacto","campo":"hay_imagenes","igual":true,"artefacto":"imagenes_clave_final"}'::jsonb THEN
    RAISE EXCEPTION '202611201600: la condición de revisar_imagenes_clave no es la leída; no se toca';
  END IF;
  -- CC6 (punto 2): el techo 350 sale de las vueltas que ENVUELVEN el bloque (vuelven a un paso antes del bloque desde uno después) · en la fila leída suman 9
  SELECT (o - 1)::int INTO i_final FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o) WHERE p->>'clave' = 'imagenes_clave_final';
  SELECT COALESCE(sum((p->'vuelve_a'->>'max')::numeric), 0) INTO envuelve
    FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o)
    WHERE (o - 1) > i_final AND p ? 'vuelve_a'
      AND (SELECT (o2 - 1)::int FROM jsonb_array_elements(g.pasos) WITH ORDINALITY y(q, o2) WHERE q->>'clave' = p->'vuelve_a'->>'paso') <= i_final;
  IF envuelve IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION '202611201600: las vueltas que envuelven la corrección suman %, no 9: el techo 350 ya no vale; no se toca', envuelve;
  END IF;
  -- los límites y la columna leídos
  IF (g.limites->>'margen')::numeric IS DISTINCT FROM 50 OR (g.limites->>'reserva_por_pieza_usd')::numeric IS DISTINCT FROM 30
     OR (g.limites->>'tope_encargo_usd')::numeric IS DISTINCT FROM 45 OR g.limites->'tope_encargo_usd_por_segundo' IS DISTINCT FROM '{"720p":4.86,"1080p":4.9}'::jsonb
     OR (g.limites->'video'->>'segundos_max')::numeric IS DISTINCT FROM 120 OR g.limites->'video'->>'resolucion' IS DISTINCT FROM '720p'
     OR g.limites ? 'vueltas_de_correccion_imagen' OR g.limites ? 'turnos_de_correccion_imagen' OR g.tope_encargo_usd IS DISTINCT FROM 628.2::numeric THEN
    RAISE EXCEPTION '202611201600: los límites o el tope de video_mesa no son los leídos; no se pisan';
  END IF;
  IF g.indicaciones ? 'creative-director-mesa' THEN
    RAISE EXCEPTION '202611201600: video_mesa ya tiene indicaciones del director; no se pisan';
  END IF;
  -- el techo de la base leído (202611171900)
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('oficina_encargos_tope_valido', 'oficina_tipos_tope_valido') AND pg_get_constraintdef(oid) LIKE '%<= (650)::numeric%') <> 2 THEN
    RAISE EXCEPTION '202611201600: el techo de los topes de la base no es el leído (650); no se toca';
  END IF;
END $$;

-- el techo de la base: 650 → 1000 (mismas reglas, mismo nombre)
ALTER TABLE public.oficina_encargos DROP CONSTRAINT oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 1000);
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 1000);

UPDATE public.oficina_tipos_de_grupo g
SET pasos = (
      SELECT jsonb_agg(q ORDER BY i, j)
      FROM jsonb_array_elements(g.pasos) WITH ORDINALITY AS x(p, i),
      LATERAL (
        SELECT p AS q, 0 AS j
        UNION ALL
        SELECT n.q, n.j FROM (VALUES
          ($c${"clave":"corregir_imagen","tipo":"agente","quien":"creative-director-mesa","condicion":{"tipo":"si_artefacto","campo":"hay_imagenes","igual":true,"artefacto":"imagenes_clave_final"},"entrada":["imagenes_clave_final"],"salida_artefacto":"pedido_de_correccion","tope_usd":0.75,"salida":{"esquema":"correccion_imagen.v1","reintento_formato":1}}$c$::jsonb, 1),
          ($e${"clave":"editar_imagen","tipo":"codigo","quien":"sala","funcion":"editar_imagen","condicion":{"tipo":"si_artefacto","campo":"hay_imagenes","igual":true,"artefacto":"imagenes_clave_final"},"entrada":["pedido_de_correccion"],"salida_artefacto":"ediciones_de_imagen","tope_usd":4}$e$::jsonb, 2),
          ($m${"clave":"mirar_correccion","tipo":"codigo","quien":"sala","funcion":"mirar_correccion","condicion":{"tipo":"si_artefacto","campo":"hay_imagenes","igual":true,"artefacto":"imagenes_clave_final"},"entrada":["ediciones_de_imagen"],"salida_artefacto":"correcciones_de_imagen","tope_usd":5.2,"vuelve_a":{"paso":"corregir_imagen","max":350,"si":{"tipo":"si_artefacto","artefacto":"correcciones_de_imagen","campo":"sigue","igual":true}}}$m$::jsonb, 3)
        ) AS n(q, j)
        WHERE p->>'clave' = 'imagenes_clave_final'
      ) y
    ),
    limites = g.limites || jsonb_build_object(
      'margen', 1102, 'reserva_por_pieza_usd', 31.6, 'tope_encargo_usd', 45.75,
      'tope_encargo_usd_por_segundo', '{"720p":5.395,"1080p":5.435}'::jsonb,
      'vueltas_de_correccion_imagen', 3, 'turnos_de_correccion_imagen', 12),
    tope_encargo_usd = 693.15,
    indicaciones = g.indicaciones || jsonb_build_object('creative-director-mesa', $i$[{"regla":"Cuando miras las imágenes clave que pediste en la hoja de planos, NO las calificas: eliges la versión sobre la que se edita y dices qué cambiar, en lenguaje llano y concreto, para que cada una cumpla su plano y se parezca a la foto real. Si no hay nada que cambiar, no inventes cambios.","aplica":"guia"}]$i$::jsonb),
    version = g.version + 1
WHERE g.tipo = 'video_mesa';

DO $$
DECLARE
  g record;
  orden text;
BEGIN
  SELECT * INTO g FROM public.oficina_tipos_de_grupo WHERE tipo = 'video_mesa';
  SELECT string_agg(p->>'clave', ',' ORDER BY o) INTO orden FROM jsonb_array_elements(g.pasos) WITH ORDINALITY z(p, o);
  IF orden IS DISTINCT FROM 'abrir,mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,imagenes_clave_final,corregir_imagen,editar_imagen,mirar_correccion,revisar_imagenes_clave,pedido,video,cuadros_video,mirar_video,chequeos,jefatura,chequeos_2,entrega,cierre' THEN
    RAISE EXCEPTION '202611201600: video_mesa no quedó con imagenes_clave_final → corregir_imagen → editar_imagen → mirar_correccion → revisar_imagenes_clave (%)', orden;
  END IF;
  -- la columna es lo calculado: fijo + por segundo de su resolución × la pieza más larga
  IF g.tope_encargo_usd IS DISTINCT FROM ((g.limites->>'tope_encargo_usd')::numeric + (g.limites->'tope_encargo_usd_por_segundo'->>(g.limites->'video'->>'resolucion'))::numeric * (g.limites->'video'->>'segundos_max')::numeric)
     OR g.tope_encargo_usd IS DISTINCT FROM 693.15::numeric OR (g.limites->>'margen')::numeric IS DISTINCT FROM 1102 OR (g.limites->>'reserva_por_pieza_usd')::numeric IS DISTINCT FROM 31.6 THEN
    RAISE EXCEPTION '202611201600: el tope, el margen o la reserva de video_mesa no quedaron como se calculó';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('oficina_encargos_tope_valido', 'oficina_tipos_tope_valido') AND pg_get_constraintdef(oid) LIKE '%<= (1000)::numeric%') <> 2 THEN
    RAISE EXCEPTION '202611201600: el techo de los topes de la base no quedó en 1000';
  END IF;
END $$;

COMMIT;
