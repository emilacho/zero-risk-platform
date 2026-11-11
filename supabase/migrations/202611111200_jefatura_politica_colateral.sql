-- JEFATURA · política «colateral» (11-nov · colaterales 2d parte 4 · opción 1 de Lenovo 02:15Z · líneas 1-3 de CC7 y 1-7 de CC6).
--   Un jefe (editor_en_jefe, voz y hechos) JUZGA uno por uno los retoques mínimos que la secretaria propuso por una edición del dueño: veredicto aprueba | rechaza con razón.
--   El código ata cada veredicto por id (lo sin veredicto nunca se aprueba). Sin corrección, sin GPT, sin voto: la jefatura no reescribe.
--   No-circularidad: el manual (cimiento) no es destino de esta revisión; el revisor no es productor.
--   Qué hace: INSERTA UNA fila nueva `colateral` en `jefatura_grading_policies`, APAGADA (is_active = false). No toca las demás filas, ni `jefatura_config`, ni permisos.
--   Encenderla es un GO aparte (is_active + `jefatura_config.tipos_activos`): mientras tanto nada la usa.
--   GUARDA: se detiene si la fila `colateral` ya existe. REVERSA: supabase/reversas/202611111200_jefatura_politica_colateral_REVERSA.sql (borra SOLO esa fila y solo si no tiene revisiones).
BEGIN;

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jefatura_grading_policies WHERE artifact_type = 'colateral') THEN
    RAISE EXCEPTION 'la fila colateral ya existe en jefatura_grading_policies: revisar a mano antes de aplicar';
  END IF;
END
$guarda$;

INSERT INTO public.jefatura_grading_policies
  (artifact_type, artifact_class, correction_enabled, judgment_enabled, canon_grader, counterweight, max_cycles, fidelity_threshold, vote_config, notes, is_active,
   revisor_fondo, revisor_ciego, revisor_ciego_modelo_env, contra_que, productores, esquema_correccion, huecos_pregunta, indicacion_fondo, chequeos_previos, tope_revision_usd, tope_paso_usd, destino_cierre, reentrega)
VALUES
  ('colateral', 'revision', false, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura · colateral (2d 11-nov) · un jefe juzga cada retoque colateral contra la edición del dueño; veredicto atado por id; sin reescritura · NACE INACTIVA', false,
   'editor_en_jefe', false, NULL,
   $cq${"documentos":[{"clave":"edicion_del_dueno","titulo":"La edición del dueño","funcion":"lo que el dueño ya decidió: cada retoque debe serle fiel"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"content-creator"}]$pr$::jsonb,
   NULL,
   $hp${"que_es":"los retoques colaterales de una edición del dueño","uso":"que los documentos que dependen de la edición queden alineados sin cambiar su voz ni sus hechos"}$hp$::jsonb,
   'Juzgas cada retoque: fiel a la edición del dueño, sin cambiar voz ni hechos.',
   ARRAY[]::text[], 0.30,
   $tp${"revision_fondo":0.25}$tp$::jsonb,
   'siguiente_paso', 'ninguna');

-- comprobaciones: la fila nació apagada, no vota y la no-circularidad se cumple (el revisor no es productor)
DO $chk$
DECLARE f record;
BEGIN
  SELECT is_active, judgment_enabled, revisor_fondo, productores INTO f FROM public.jefatura_grading_policies WHERE artifact_type = 'colateral';
  IF f.is_active THEN RAISE EXCEPTION 'la fila colateral tenía que nacer apagada'; END IF;
  IF f.judgment_enabled THEN RAISE EXCEPTION 'una revisión nunca vota'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(f.productores) p WHERE p->>'agente' = f.revisor_fondo) THEN
    RAISE EXCEPTION 'el revisor de fondo (%) figura entre los productores: no-circularidad rota', f.revisor_fondo;
  END IF;
END
$chk$;

COMMIT;
