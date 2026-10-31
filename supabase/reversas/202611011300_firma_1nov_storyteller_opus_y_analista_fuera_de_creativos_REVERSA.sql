-- REVERSA de 202611011300 · el storyteller vuelve a claude-sonnet y pierde su capa local. La sentencia defensiva sobre market_research_analyst no se revierte:
-- hoy no tiene fila (ground truth 01-nov) y, si la tuviera, volver a sentarlo en la mesa de creativos contradice la FIRMA 5 punto 2.
BEGIN;
UPDATE public.agents SET model = 'claude-sonnet', updated_at = now() WHERE name = 'design-visual-storyteller' AND model = 'claude-opus';
UPDATE public.oficina_directorio SET indicacion = array_remove(indicacion,
  $d$En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.$d$), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller';
COMMIT;
NOTIFY pgrst, 'reload schema';
