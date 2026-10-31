-- 01-nov · ORDEN PASO A (CC#1): FIRMA de Emilio «hoja sin reja · storyteller · YouTube» punto 3 + FIRMA 5 punto 2 · DATO de la oficina (`oficina_directorio`, dueño CC#2: aditiva, avisada en el papel) + `agents.model` de un agente.
--   3) `design-visual-storyteller`: modelo `claude-sonnet` → `claude-opus` (el CHECK `agents_model_check` lo admite) + CAPA LOCAL CORTA como indicación del directorio (dato).
--      La identidad (`identity_content`) NO se toca (protocolo 2026-05-16).
--   FIRMA 5 punto 2 · `market_research_analyst` SOLO en la mesa de análisis: sale de la mesa de creativos (gran idea, carrusel, kit, video). Ground truth 01-nov: NO tiene fila en
--      `oficina_directorio` (2008 no lo siembra; CC3 leyó la base viva) y ningún código de la oficina lo sienta. Esta migración lo deja dicho con una guarda: si alguna vez tuviera fila,
--      le quita las marcas de creativos (queda sin mesas creativas, no se borra). Su alta en la mesa de análisis es del DISEÑO de CC1 (FIRMAS 1-6), no de aquí.
--   El punto 2 (whimsy en piezas) es de CC#2: 202610312013 (`si_whimsy`). NO se toca aquí.
--   ORDEN: DESPUÉS de 202610312008 (la columna `indicacion` existe) y de 202610312012. NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202611011300_firma_1nov_storyteller_opus_y_analista_fuera_de_creativos_REVERSA.sql
BEGIN;

UPDATE public.agents SET model = 'claude-opus', updated_at = now()
  WHERE name = 'design-visual-storyteller' AND model = 'claude-sonnet';

UPDATE public.oficina_directorio SET indicacion = array_prepend(
  $d$En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.$d$,
  indicacion), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller'
    AND NOT EXISTS (SELECT 1 FROM unnest(indicacion) i WHERE i LIKE 'En esta agencia tu trabajo es la dirección visual%');

-- FIRMA 5 punto 2: fuera de la mesa de creativos (hoy no tiene fila; la sentencia es defensiva e idempotente)
UPDATE public.oficina_directorio
   SET pertinente_en = COALESCE(ARRAY(SELECT p FROM unnest(pertinente_en) p WHERE split_part(p, ':', 1) NOT IN ('concepto', 'carrusel', 'kit', 'video')), ARRAY[]::text[]),
       actualizado_en = now()
 WHERE agente = 'market_research_analyst'
   AND EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE split_part(p, ':', 1) IN ('concepto', 'carrusel', 'kit', 'video'));

DO $$
DECLARE s int; d int; a int;
BEGIN
  SELECT count(*) INTO s FROM public.agents WHERE name = 'design-visual-storyteller' AND model = 'claude-opus' AND is_active;
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'design-visual-storyteller' AND indicacion[1] LIKE 'En esta agencia tu trabajo es la dirección visual%';
  SELECT count(*) INTO a FROM public.oficina_directorio WHERE agente = 'market_research_analyst' AND EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE split_part(p, ':', 1) IN ('concepto', 'carrusel', 'kit', 'video'));
  IF s <> 1 THEN RAISE EXCEPTION 'design-visual-storyteller debe quedar en claude-opus y activo'; END IF;
  IF d <> 1 THEN RAISE EXCEPTION 'falta la capa local del storyteller en su indicación'; END IF;
  IF a <> 0 THEN RAISE EXCEPTION 'market_research_analyst no puede tener marcas de la mesa de creativos (FIRMA 5 punto 2)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
