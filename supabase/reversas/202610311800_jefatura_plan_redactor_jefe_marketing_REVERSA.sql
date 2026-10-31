-- REVERSA de 202610311800_jefatura_plan_redactor_jefe_marketing.sql: la fila `plan` vuelve a como la dejó 202610131000
--   (revisor_fondo jefe-marketing · productor campaign-brief-agent · la nota de entonces). Solo revierte si la fila está EXACTAMENTE como la dejó la migración; si no, se detiene.
BEGIN;

DO $plan$
DECLARE f record;
BEGIN
  SELECT revisor_fondo, productores INTO f FROM public.jefatura_grading_policies WHERE artifact_type = 'plan';
  IF NOT FOUND THEN RAISE EXCEPTION 'no existe la fila plan de jefatura_grading_policies'; END IF;
  IF f.revisor_fondo IS DISTINCT FROM 'editor_en_jefe' OR f.productores IS DISTINCT FROM '[{"donde":"*","agente":"jefe-marketing"}]'::jsonb THEN
    RAISE EXCEPTION 'la fila plan no está como la dejó 202610311800 (revisor_fondo=%, productores=%): no se revierte a ciegas', f.revisor_fondo, f.productores;
  END IF;
END
$plan$;

UPDATE public.jefatura_grading_policies
   SET productores   = '[{"donde":"*","agente":"campaign-brief-agent"}]'::jsonb,
       revisor_fondo = 'jefe-marketing',
       notes         = 'jefatura como oficina propia · plan · A→B→C (diseño v4 §5.1) · NACE INACTIVA',
       updated_at    = now()
 WHERE artifact_type = 'plan';

COMMIT;
