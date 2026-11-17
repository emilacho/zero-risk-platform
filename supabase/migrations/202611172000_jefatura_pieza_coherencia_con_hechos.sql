-- 17-nov · GO de Lenovo (DIAGNOSTICO-CC6-coherencia-con-los-hechos §4 c) · COHERENCIA CON LOS HECHOS en la pieza · CC4.
--   El revisor de fondo de la política `pieza` comprueba que el mensaje sea coherente con los hechos del negocio (qué es nuevo, dónde, desde cuándo)
--   contra el documento «Hechos del negocio» que le manda la oficina (`src/lib/oficina/hechos-del-negocio.ts`) o, si no hay bloque, contra el manual y el plan.
--   Un desacuerdo de hechos sale como ficha que BLOQUEA y abre su «que» con el rótulo «hechos del negocio:», que la vuelta a la mesa y la bandeja leen por dato.
--   Es DATO (la indicación de la política), no código: se apaga o se reescribe con un UPDATE. Genérica: sin nombres de clientes ni sedes.
--   Aditiva e idempotente: solo agrega la frase si aún no está. ORDEN: después de 202610131000 (la política existe). NO APLICADA: se aplica en la publicación.
--   Reversa: supabase/reversas/202611172000_jefatura_pieza_coherencia_con_hechos_REVERSA.sql
BEGIN;

UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = indicacion_fondo || ' ' || $h$Coherencia con los hechos: comprueba que el mensaje sea coherente con los hechos del negocio (qué se presenta como nuevo, dónde y desde cuándo) contra el documento «Hechos del negocio» o, si dice que no hay bloque, contra el manual y el plan. Lo que existe desde antes no se anuncia como llegada ni como novedad, y la sede o la zona que importan son las correctas. Si el mensaje contradice un hecho, pon una ficha de gravedad "bloquea" cuyo «que» empiece exactamente por «hechos del negocio:», di qué hecho contradice y propón la corrección. Si un hecho no se puede comprobar, dilo en una ficha "sugerencia" sin ese rótulo.$h$
 WHERE artifact_type = 'pieza'
   AND indicacion_fondo IS NOT NULL
   AND indicacion_fondo NOT LIKE '%Coherencia con los hechos:%';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.jefatura_grading_policies WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Coherencia con los hechos:%';
  IF n <> 1 THEN RAISE EXCEPTION 'la política pieza debía quedar con la vara de coherencia con los hechos y hay % filas', n; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
