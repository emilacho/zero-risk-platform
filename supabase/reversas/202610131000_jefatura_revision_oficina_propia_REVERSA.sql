-- REVERSA de 202610131000_jefatura_revision_oficina_propia.sql · J1 · CC#1 · 2026-10-13
-- 🔴 SE NIEGA a borrar si la jefatura llegó a usarse: hay revisiones, pasos o fichas, la llave dejó de estar apagada, o los renglones de política NO están como los sembró la migración (alguien los activó o los cambió).
-- Los renglones de julio (brand_book, icp, competitive, ad_creative, copy, email, landing) NO se tocan: esta reversa no hace ni un UPDATE ni un DELETE sobre ellos.
-- ORDEN: (1) respaldo y CERO corridas → (2) esta reversa → (3) `scripts/ops/jefatura-j1-antes-despues.mjs` (las 3 filas del cimiento idénticas).

BEGIN;

DO $reversa$
DECLARE
  n_rev bigint; n_pasos bigint; n_fichas bigint; n_activas bigint; n_cfg bigint;
BEGIN
  IF to_regclass('public.jefatura_revisiones') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.jefatura_revisiones' INTO n_rev;
    IF n_rev > 0 THEN RAISE EXCEPTION 'REVERSA RECHAZADA: hay % revisión(es) de la jefatura; no se borra historia', n_rev; END IF;
  END IF;
  IF to_regclass('public.jefatura_pasos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.jefatura_pasos' INTO n_pasos;
    IF n_pasos > 0 THEN RAISE EXCEPTION 'REVERSA RECHAZADA: hay % paso(s) registrados', n_pasos; END IF;
  END IF;
  IF to_regclass('public.jefatura_fichas') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.jefatura_fichas' INTO n_fichas;
    IF n_fichas > 0 THEN RAISE EXCEPTION 'REVERSA RECHAZADA: hay % ficha(s) registradas', n_fichas; END IF;
  END IF;
  IF to_regclass('public.jefatura_config') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.jefatura_config WHERE estado <> 'apagada' OR array_length(tipos_activos, 1) IS NOT NULL OR array_length(clientes_ensayo, 1) IS NOT NULL$q$ INTO n_cfg;
    IF n_cfg > 0 THEN RAISE EXCEPTION 'REVERSA RECHAZADA: la jefatura ya no está apagada o tiene tipos/clientes de ensayo'; END IF;
  END IF;
  SELECT count(*) INTO n_activas FROM public.jefatura_grading_policies WHERE artifact_class = 'revision' AND is_active = true;
  IF n_activas > 0 THEN RAISE EXCEPTION 'REVERSA RECHAZADA: hay % política(s) de revisión activas', n_activas; END IF;
END
$reversa$;

-- 1 · las 4 tablas nuevas (vacías, comprobado arriba)
DROP TABLE IF EXISTS public.jefatura_fichas;
DROP TABLE IF EXISTS public.jefatura_pasos;
DROP TABLE IF EXISTS public.jefatura_revisiones;
DROP TABLE IF EXISTS public.jefatura_config;

-- 2 · los 6 renglones de política que sembró la migración (solo los de clase `revision`)
DELETE FROM public.jefatura_grading_policies WHERE artifact_class = 'revision' AND artifact_type IN ('plan', 'estrategia', 'calendario', 'brief', 'pieza', 'manual') AND is_active = false;

-- 3 · CHECK nuevos y relajados → forma original de julio (solo si ya no queda ningún renglón de clase `revision`)
DO $checks$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jefatura_grading_policies WHERE artifact_class = 'revision') THEN
    RAISE EXCEPTION 'REVERSA RECHAZADA: quedan renglones de clase revision que no son los sembrados';
  END IF;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_revision_completa;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_revision_sin_voto;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_policies_tope_revision_valido;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_policies_reentrega_valida;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_policies_destino_cierre_valido;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grader_class_match;
  ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grader_class_match CHECK (
    (artifact_class = 'cimiento'  AND canon_grader = 'fidelity') OR
    (artifact_class = 'contenido' AND canon_grader = 'vote_3_of_n')
  ) NOT VALID;
  ALTER TABLE public.jefatura_grading_policies VALIDATE CONSTRAINT jefatura_grader_class_match;
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grading_policies_canon_grader_check;
  ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grading_policies_canon_grader_check CHECK (canon_grader IN ('fidelity', 'vote_3_of_n'));
  ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grading_policies_artifact_class_check;
  ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grading_policies_artifact_class_check CHECK (artifact_class IN ('cimiento', 'contenido'));
END
$checks$;

-- 4 · las columnas nuevas (vacías en los renglones de julio)
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS reentrega;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS destino_cierre;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS tope_paso_usd;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS tope_revision_usd;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS chequeos_previos;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS indicacion_fondo;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS huecos_pregunta;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS esquema_correccion;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS productores;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS contra_que;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS revisor_ciego_modelo_env;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS revisor_ciego;
ALTER TABLE public.jefatura_grading_policies DROP COLUMN IF EXISTS revisor_fondo;

COMMIT;
NOTIFY pgrst, 'reload schema';
