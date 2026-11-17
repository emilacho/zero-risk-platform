-- 17-nov · Sprint 4 · fase 1 · E · ENCENDIDO del rol de crítica EN LA GRAN IDEA (`concepto:critica`) · GO Lenovo (`RESPUESTA-LENOVO-a-CC2-CC1-encendido-critica-y-tope-gran-idea.md`) · CC2.
--   ORDEN: se aplica DESPUÉS de 202611172120 (la crítica en las piezas) y DESPUÉS de la 202611172200 de CC1, que sube el tope de la fila `concepto_mesa` de 7 a 10 (hoy 7,00; peor caso medido con
--   la crítica ≈ 7,6 · condición 1 de CC6). Sin ese tope, la mesa de la gran idea cerraría por tope, que es cortar a medias. La guarda de abajo frena si el tope sigue en 7.
--   Agrega SOLO `concepto:critica` (sin `concepto` suelto: la tarjeta critica y no aporta en ese tipo). Idempotente.
--   NO APLICADA: con el 🟢 de CC7, el tope de CC1 aplicado y el GO de Lenovo al paso; CC7 verifica en vivo.
--   Reversa: supabase/reversas/202611172210_oficina_directorio_critica_en_la_gran_idea_REVERSA.sql
BEGIN;

DO $$
DECLARE t numeric;
BEGIN
  SELECT tope_encargo_usd INTO t FROM public.oficina_tipos_de_grupo WHERE familia = 'concepto_mesa';
  IF t IS NULL OR t <= 7 THEN RAISE EXCEPTION 'el tope de concepto_mesa sigue en % (debe subirlo CC1 antes de encender la crítica en la gran idea)', t; END IF;
END $$;

UPDATE public.oficina_directorio
   SET pertinente_en = pertinente_en || ARRAY['concepto:critica']::text[],
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'social-media-strategist'
   AND activo
   AND NOT ('concepto:critica' = ANY(pertinente_en));

DO $$
DECLARE i int; d int;
BEGIN
  SELECT count(*) INTO i FROM public.oficina_directorio WHERE agente = 'social-media-strategist' AND activo AND rol = 'miembro' AND 'concepto:critica' = ANY(pertinente_en);
  SELECT count(*) INTO d FROM public.oficina_directorio t, unnest(t.pertinente_en) p
   WHERE t.activo AND p LIKE '%:critica' AND split_part(p, ':', 1) = ANY(t.pertinente_en);
  IF i <> 1 THEN RAISE EXCEPTION 'social-media-strategist debía quedar activo con concepto:critica (¿se aplicó antes 202611172120?) (filas: %)', i; END IF;
  IF d <> 0 THEN RAISE EXCEPTION 'una tarjeta activa critica y aporta en el mismo tipo (filas: %)', d; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
