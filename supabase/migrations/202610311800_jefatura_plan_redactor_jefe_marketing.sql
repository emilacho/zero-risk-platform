-- OFICINA DE MARKETING · T1 · F1 firmada por Emilio (31-oct): el PLAN lo redacta `jefe-marketing` y lo revisa a fondo `editor_en_jefe` (no-circularidad: quien produce no revisa).
--   Diseño: raw/tasks/2026-10-31-DISENO-CC1-estructura-completa-marketing.md §2 · plan de construcción v2 T1 (raw/tasks/2026-10-31-PLAN-CC1-construccion-oficina-marketing.md).
--   Qué cambia en la fila `plan` de `jefatura_grading_policies` (y SOLO en ella):
--     · productores: [{"donde":"*","agente":"campaign-brief-agent"}] → [{"donde":"*","agente":"jefe-marketing"}]  (el que corrige y decide es el que redactó)
--     · revisor_fondo: 'jefe-marketing' → 'editor_en_jefe'  (el jefe ya no se revisa a sí mismo)
--     · notes: se corrige el «NACE INACTIVA» (la fila está activa desde el 13-oct; la nota mentía)
--   NO toca topes, esquema, contra_que, chequeos_previos ni is_active. NO toca las demás filas.
--   GUARDA: solo aplica si la fila está EXACTAMENTE como la dejó 202610131000 (revisor jefe-marketing + productor campaign-brief-agent); si alguien la cambió, se detiene.
--   REVERSA: supabase/reversas/202610311800_jefatura_plan_redactor_jefe_marketing_REVERSA.sql (misma guarda al revés). Ensayada apply→leer→revert→leer en Postgres en memoria (pglite) antes de proponerla.
--   NO APLICADA: se aplica en la publicación única (T9) con 0 corridas vivas; hasta entonces el código sigue leyendo la fila vieja y nada cambia.
BEGIN;

DO $plan$
DECLARE f record;
BEGIN
  SELECT revisor_fondo, productores INTO f FROM public.jefatura_grading_policies WHERE artifact_type = 'plan';
  IF NOT FOUND THEN RAISE EXCEPTION 'no existe la fila plan de jefatura_grading_policies'; END IF;
  IF f.revisor_fondo IS DISTINCT FROM 'jefe-marketing' OR f.productores IS DISTINCT FROM '[{"donde":"*","agente":"campaign-brief-agent"}]'::jsonb THEN
    RAISE EXCEPTION 'la fila plan no está como la dejó 202610131000 (revisor_fondo=%, productores=%): revisar a mano antes de aplicar', f.revisor_fondo, f.productores;
  END IF;
END
$plan$;

UPDATE public.jefatura_grading_policies
   SET productores   = '[{"donde":"*","agente":"jefe-marketing"}]'::jsonb,
       revisor_fondo = 'editor_en_jefe',
       notes         = 'jefatura como oficina propia · plan · A→B→C (diseño v4 §5.1) · redacta jefe-marketing, revisa a fondo editor_en_jefe (F1 31-oct) · ACTIVA desde 2026-10-13',
       updated_at    = now()
 WHERE artifact_type = 'plan';

-- la invariante que el código también exige (`politicaDeFila`): el revisor de fondo no es productor
DO $chk$
DECLARE f record;
BEGIN
  SELECT revisor_fondo, productores INTO f FROM public.jefatura_grading_policies WHERE artifact_type = 'plan';
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(f.productores) p WHERE p->>'agente' = f.revisor_fondo) THEN
    RAISE EXCEPTION 'el revisor de fondo (%) figura entre los productores: no-circularidad rota', f.revisor_fondo;
  END IF;
END
$chk$;

COMMIT;
