-- 16-nov · Sprint 1 · calidad de piezas · mejora 4 «ingeniero de prompts» (GO Lenovo, firma de Emilio 19:46) · CC4 · `oficina_directorio` es DATO.
--   `design-image-prompt-engineer` deja de APORTAR antes de la integración (`carrusel:si_imagen_generada`, `kit:si_imagen_generada`: su texto no llegaba a ningún paso)
--   y pasa a su turno propio DESPUÉS de que la dirección integra (`carrusel:redacta_prompts`, `kit:redacta_prompts`): traduce el concepto de cada imagen a generar a la
--   instrucción exacta del modelo, y ESA instrucción es la que recibe el brazo de imagen (código `mesa/prompts.ts` + `planificador.ts` paso 8).
--   Sin esta migración el código no cambia nada (no hay tarjeta con la marca nueva: la mesa trabaja como hoy). Idempotente. La mesa congela el directorio al abrir:
--   las piezas en vuelo siguen con el directorio con el que abrieron.
--   NO APLICADA: se aplica después de la certificación de CC6 (GO 20:05) y de publicar el código.
--   Reversa: supabase/reversas/202611161930_oficina_directorio_ingeniero_de_prompts_despues_de_integrar_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio
   SET pertinente_en = ARRAY['carrusel:redacta_prompts', 'kit:redacta_prompts']::text[],
       especialidad = 'ingeniería de prompts: después de que la dirección integra la pieza, traduce el concepto de cada imagen a generar a la instrucción exacta para el modelo de imagen (en inglés: escena, lugar, composición, luz, lente y estilo de la marca, sin texto dentro de la imagen)',
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'design-image-prompt-engineer'
   AND pertinente_en IS DISTINCT FROM ARRAY['carrusel:redacta_prompts', 'kit:redacta_prompts']::text[];

DO $$
DECLARE i int; v int;
BEGIN
  SELECT count(*) INTO i FROM public.oficina_directorio WHERE agente = 'design-image-prompt-engineer' AND activo AND rol = 'miembro'
    AND 'carrusel:redacta_prompts' = ANY(pertinente_en) AND 'kit:redacta_prompts' = ANY(pertinente_en);
  SELECT count(*) INTO v FROM public.oficina_directorio WHERE agente = 'design-image-prompt-engineer'
    AND ('carrusel:si_imagen_generada' = ANY(pertinente_en) OR 'kit:si_imagen_generada' = ANY(pertinente_en));
  IF i <> 1 THEN RAISE EXCEPTION 'design-image-prompt-engineer debía quedar activo como miembro con carrusel:redacta_prompts y kit:redacta_prompts (filas: %)', i; END IF;
  IF v <> 0 THEN RAISE EXCEPTION 'design-image-prompt-engineer no debe seguir aportando antes de la integración (filas: %)', v; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
