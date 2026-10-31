-- 01-nov · FIRMA de Emilio «hoja sin reja · storyteller · YouTube» (CC#1) · DATO de la oficina (tablas `oficina_*`, dueño CC#2: aditiva, avisada en el papel) + `agents.model` de un agente.
--   2) `whimsy-injector` entra a la MESA DE PIEZAS (carrusel · kit · video) con la MISMA indicación que tiene en la gran idea (2008): aporta encanto solo si la marca lo admite
--      («si la marca pide sobriedad, lo dices y propones poco»; puede contestar «Sin aporte»). Esa es la condición firmada; no hay condición nueva de código.
--   3) `design-visual-storyteller`: modelo `claude-sonnet` → `claude-opus` (el CHECK `agents_model_check` lo admite) + CAPA LOCAL CORTA como indicación del directorio (dato).
--      La identidad (`identity_content`) NO se toca (protocolo 2026-05-16).
--   ORDEN: DESPUÉS de 202610312008 (whimsy y la columna `indicacion` existen) y de 202610312012. NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202611011300_firma_1nov_whimsy_en_piezas_y_storyteller_opus_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'carrusel'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('carrusel' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'kit'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('kit' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video'), actualizado_en = now()
  WHERE agente = 'whimsy-injector' AND NOT ('video' = ANY(pertinente_en));

UPDATE public.agents SET model = 'claude-opus', updated_at = now()
  WHERE name = 'design-visual-storyteller' AND model = 'claude-sonnet';

UPDATE public.oficina_directorio SET indicacion = array_prepend(
  $d$En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.$d$,
  indicacion), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller'
    AND NOT EXISTS (SELECT 1 FROM unnest(indicacion) i WHERE i LIKE 'En esta agencia tu trabajo es la dirección visual%');

DO $$
DECLARE w int; s int; d int;
BEGIN
  SELECT count(*) INTO w FROM public.oficina_directorio WHERE agente = 'whimsy-injector' AND activo AND pertinente_en @> ARRAY['concepto', 'carrusel', 'kit', 'video'];
  SELECT count(*) INTO s FROM public.agents WHERE name = 'design-visual-storyteller' AND model = 'claude-opus' AND is_active;
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'design-visual-storyteller' AND indicacion[1] LIKE 'En esta agencia tu trabajo es la dirección visual%';
  IF w <> 1 THEN RAISE EXCEPTION 'whimsy-injector debe estar en concepto, carrusel, kit y video'; END IF;
  IF s <> 1 THEN RAISE EXCEPTION 'design-visual-storyteller debe quedar en claude-opus y activo'; END IF;
  IF d <> 1 THEN RAISE EXCEPTION 'falta la capa local del storyteller en su indicación'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
