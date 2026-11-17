-- REVERSA de 202611172000 · quita SOLO la vara de coherencia con los hechos de la indicación de fondo de la política `pieza` (el mismo texto exacto que agregó la migración: lo demás se conserva).
BEGIN;
UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = replace(indicacion_fondo, ' ' || $h$Coherencia con los hechos: comprueba que el mensaje sea coherente con los hechos del negocio (qué se presenta como nuevo, dónde y desde cuándo) contra el documento «Hechos del negocio» o, si dice que no hay bloque, contra el manual y el plan. Lo que existe desde antes no se anuncia como llegada ni como novedad, y la sede o la zona que importan son las correctas. Si el mensaje contradice un hecho, pon una ficha de gravedad "bloquea" cuyo «que» empiece exactamente por «hechos del negocio:», di qué hecho contradice y propón la corrección. Si un hecho no se puede comprobar, dilo en una ficha "sugerencia" sin ese rótulo.$h$, '')
 WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Coherencia con los hechos:%';
COMMIT;
NOTIFY pgrst, 'reload schema';
