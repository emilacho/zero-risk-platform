-- REVERSA de 202611011300 · whimsy vuelve solo a la gran idea; el storyteller vuelve a claude-sonnet y pierde su capa local. No toca lo de 2008 ni 2012.
BEGIN;
UPDATE public.oficina_directorio SET pertinente_en = array_remove(array_remove(array_remove(pertinente_en, 'carrusel'), 'kit'), 'video'), actualizado_en = now() WHERE agente = 'whimsy-injector';
UPDATE public.agents SET model = 'claude-sonnet', updated_at = now() WHERE name = 'design-visual-storyteller' AND model = 'claude-opus';
UPDATE public.oficina_directorio SET indicacion = array_remove(indicacion,
  $d$En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.$d$), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller';
COMMIT;
NOTIFY pgrst, 'reload schema';
