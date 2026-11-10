-- JEFATURA · política «registro» (10-nov · A′ · GO Lenovo 13:42Z · 🟢 CC7 al plan por tramos · raw/tasks/2026-11-10-PLAN-CC2-a-CC7-LENOVO-revisor-de-registro-por-tramos.md).
--   Un revisor (editor_en_jefe, Sonnet) JUZGA el registro de un documento (tú, vos o usted, según el manual del cliente) y el creador corrige con reemplazos exactos; el código verifica lo exacto.
--   Qué hace: INSERTA UNA fila nueva `registro` en `jefatura_grading_policies`, APAGADA (is_active = false). No toca las demás filas, ni `jefatura_config`, ni permisos.
--   Encenderla es un GO aparte (is_active + `jefatura_config.tipos_activos`): mientras tanto nada la usa.
--   productores: el que corrige lo pone quien abre la revisión (el dueño del documento); la fila trae `content-creator` como valor de respaldo.
--   Permisos: la fila hereda los de la tabla (RLS activa). El hueco TRUNCATE de anon/authenticated en todas las tablas de `public` es el paso 4 del plan de cierre de CC3; no se adelanta aquí.
--   GUARDA: se detiene si la fila `registro` ya existe. REVERSA: supabase/reversas/202611101530_jefatura_politica_registro_REVERSA.sql (borra SOLO esa fila y solo si no tiene revisiones).
BEGIN;

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jefatura_grading_policies WHERE artifact_type = 'registro') THEN
    RAISE EXCEPTION 'la fila registro ya existe en jefatura_grading_policies: revisar a mano antes de aplicar';
  END IF;
END
$guarda$;

INSERT INTO public.jefatura_grading_policies
  (artifact_type, artifact_class, correction_enabled, judgment_enabled, canon_grader, counterweight, max_cycles, fidelity_threshold, vote_config, notes, is_active,
   revisor_fondo, revisor_ciego, revisor_ciego_modelo_env, contra_que, productores, esquema_correccion, huecos_pregunta, indicacion_fondo, chequeos_previos, tope_revision_usd, tope_paso_usd, destino_cierre, reentrega)
VALUES
  ('registro', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura · registro (A′ 10-nov) · el revisor juzga tú/vos/usted contra el manual; el creador corrige con reemplazos exactos; lo citado no se corrige · NACE INACTIVA', false,
   'editor_en_jefe', false, NULL,
   $cq${"documentos":[{"clave":"manual","titulo":"Sección de voz del manual","funcion":"fija el registro del cliente"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"content-creator"}]$pr$::jsonb,
   'reemplazos.v1',
   $hp${"que_es":"el registro de un documento","uso":"que el documento le hable al público como dice el manual del cliente"}$hp$::jsonb,
   'Revisas solo el registro.',
   ARRAY[]::text[], 0.80,
   $tp${"revision_fondo":0.3,"correccion":0.3}$tp$::jsonb,
   'siguiente_paso', 'completa');

-- comprobaciones: la fila nació apagada y la no-circularidad se cumple (el revisor no es productor)
DO $chk$
DECLARE f record;
BEGIN
  SELECT is_active, revisor_fondo, productores INTO f FROM public.jefatura_grading_policies WHERE artifact_type = 'registro';
  IF f.is_active THEN RAISE EXCEPTION 'la fila registro tenía que nacer apagada'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(f.productores) p WHERE p->>'agente' = f.revisor_fondo) THEN
    RAISE EXCEPTION 'el revisor de fondo (%) figura entre los productores: no-circularidad rota', f.revisor_fondo;
  END IF;
END
$chk$;

COMMIT;
