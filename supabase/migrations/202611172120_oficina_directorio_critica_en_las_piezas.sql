-- 17-nov · Sprint 4 · fase 1 · E · ENCENDIDO del rol de crítica EN LAS PIEZAS (GO Lenovo en `RESPUESTA-LENOVO-a-CC2-CC1-encendido-critica-y-tope-gran-idea.md`) · CC2.
--   `oficina_directorio` es DATO. `social-media-strategist` (equipo estrategia) estaba apagado y sin marcas (fila viva leída el 17-nov: activo=false, pertinente_en='{}').
--   Se enciende SOLO como crítico de las piezas: `carrusel:critica`, `kit:critica`, `post:critica`, `video:critica`. Después de los aportes y antes de que la dirección
--   integre, confronta lo propuesto con los hechos y el plan (código `mesa/critica.ts` + `planificador.ts` paso 5b, #1130). No aporta como miembro en esos tipos:
--   la tarjeta NO lleva la marca sola del tipo (observación de CC7: una tarjeta con `<tipo>` y `<tipo>:critica` a la vez rompería el rol).
--   La gran idea (`concepto:critica`) va en la migración 202611172210, que se aplica DESPUÉS de que CC1 suba el tope de `concepto_mesa`.
--   Idempotente. La mesa congela el directorio al abrir: las piezas en vuelo siguen con el directorio con el que abrieron.
--   NO APLICADA: se aplica después del 🟢 de CC7, de publicar #1130 y del GO de Lenovo al paso; CC7 verifica en vivo.
--   Reversa: supabase/reversas/202611172120_oficina_directorio_critica_en_las_piezas_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio
   SET activo = true,
       pertinente_en = ARRAY['carrusel:critica', 'kit:critica', 'post:critica', 'video:critica']::text[],
       especialidad = 'estrategia: la crítica de la mesa. Después de que el equipo aporta y antes de que la dirección integre, confronta lo propuesto con los hechos (la ficha de la oferta, el manual, el brief) y con el plan: qué choca con un hecho, qué choca con el plan, qué falta probar y qué está bien sostenido. No reescribe, no propone, no vota ni aprueba: la dirección decide',
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'social-media-strategist'
   AND (activo IS DISTINCT FROM true
        OR pertinente_en IS DISTINCT FROM ARRAY['carrusel:critica', 'kit:critica', 'post:critica', 'video:critica']::text[]);

DO $$
DECLARE i int; d int;
BEGIN
  SELECT count(*) INTO i FROM public.oficina_directorio WHERE agente = 'social-media-strategist' AND activo AND rol = 'miembro'
    AND 'carrusel:critica' = ANY(pertinente_en) AND 'kit:critica' = ANY(pertinente_en) AND 'post:critica' = ANY(pertinente_en) AND 'video:critica' = ANY(pertinente_en);
  -- ninguna tarjeta activa critica y aporta en el mismo tipo (CC7)
  SELECT count(*) INTO d FROM public.oficina_directorio t, unnest(t.pertinente_en) p
   WHERE t.activo AND p LIKE '%:critica' AND split_part(p, ':', 1) = ANY(t.pertinente_en);
  IF i <> 1 THEN RAISE EXCEPTION 'social-media-strategist debía quedar activo como miembro con carrusel/kit/post/video:critica (filas: %)', i; END IF;
  IF d <> 0 THEN RAISE EXCEPTION 'una tarjeta activa critica y aporta en el mismo tipo (filas: %)', d; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
