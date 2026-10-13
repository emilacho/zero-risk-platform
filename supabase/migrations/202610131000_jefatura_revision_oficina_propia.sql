-- JEFATURA COMO OFICINA PROPIA · J1 · CC#1 · 2026-10-13 · PROPUESTA · NO APLICADA · se aplica en producción solo tras SÍ de CC#3, con respaldo y CERO corridas en vuelo
-- Diseño: raw/tasks/2026-10-13-LISTO-CC1-jefatura-diseno-v4.md §4 (tabla por tipo) y §13.2 (J1). Orden: raw/tasks/2026-10-13-ENCARGO-LENOVO-jefatura-construccion-J1-J5.md (todo APAGADO).
-- 🔴 ARCHIVO NUEVO: la migración de julio (`202607051200_jefatura_grading_policies.sql`) NO se edita (una prueba fija su texto). Esta la AMPLÍA solo con ALTER aditivos.
-- 🔴 ADITIVA: 4 tablas nuevas + columnas nuevas (nulas) en `jefatura_grading_policies` + 3 CHECK RELAJADOS (admiten más valores; los 7 renglones de julio siguen cumpliéndolos exactamente) + 6 renglones nuevos INACTIVOS.
--    NO toca ni borra nada de lo que ya existe: los renglones `brand_book`/`icp`/`competitive` (cimiento) y los de contenido quedan idénticos; `grade-cimiento` lee por `artifact_type` + `is_active = true` y no se entera.
-- 🔴 NADIE la usa todavía: ninguna ruta ni flujo nombra estas tablas (la ruta `/api/jefatura/revisiones` nace APAGADA: `jefatura_config.estado = 'apagada'` → 409).
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS, ON CONFLICT DO NOTHING y bloques DO para lo que no admite IF NOT EXISTS. `client_id` es TEXTO sin llave hacia tablas viejas (igual que la oficina).
-- 🔴 una tabla nueva sin permisos no la ve PostgREST: GRANT + RLS + NOTIFY incluidos.
-- ORDEN AL PUBLICAR: (1) respaldo confirmado y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) `scripts/ops/jefatura-j1-antes-despues.mjs` (las 3 filas del cimiento idénticas y `grade-cimiento` igual) → (5) NOTIFY (ya incluido al final).
-- REVERSA: `supabase/reversas/202610131000_jefatura_revision_oficina_propia_REVERSA.sql` (se niega a borrar si hay revisiones o filas añadidas por otros).

BEGIN;

-- ───────────────────────── 1 · jefatura_grading_policies: columnas NUEVAS (todas nulas por omisión; los renglones de julio no las llenan)
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS revisor_fondo text;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS revisor_ciego boolean;
-- el NOMBRE de la variable de entorno con el modelo del revisor ciego (nunca el valor)
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS revisor_ciego_modelo_env text;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS contra_que jsonb;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS productores jsonb;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS esquema_correccion text;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS huecos_pregunta jsonb;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS indicacion_fondo text;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS chequeos_previos text[];
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS tope_revision_usd numeric(10,2);
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS tope_paso_usd jsonb;
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS destino_cierre text;
-- `version_nueva` = el productor entrega un artefacto nuevo COMPLETO que reemplaza al anterior (solo el plan; diseño v4 §5.1)
ALTER TABLE public.jefatura_grading_policies ADD COLUMN IF NOT EXISTS reentrega text;

-- ───────────────────────── 2 · CHECK RELAJADOS y CHECK nuevos (cada uno solo si aún no está en su forma nueva → repetible)
DO $jefatura_checks$
DECLARE
  def text;
BEGIN
  -- 2a · artifact_class admite 'revision'
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_grading_policies_artifact_class_check';
  IF def IS NULL OR position('revision' IN def) = 0 THEN
    ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grading_policies_artifact_class_check;
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grading_policies_artifact_class_check CHECK (artifact_class IN ('cimiento', 'contenido', 'revision'));
  END IF;
  -- 2b · canon_grader admite 'par_fondo_y_ciego'
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_grading_policies_canon_grader_check';
  IF def IS NULL OR position('par_fondo_y_ciego' IN def) = 0 THEN
    ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grading_policies_canon_grader_check;
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grading_policies_canon_grader_check CHECK (canon_grader IN ('fidelity', 'vote_3_of_n', 'par_fondo_y_ciego'));
  END IF;
  -- 2c · la pareja clase↔grader acepta (revision, par_fondo_y_ciego); las dos de julio siguen idénticas
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_grader_class_match';
  IF def IS NULL OR position('par_fondo_y_ciego' IN def) = 0 THEN
    ALTER TABLE public.jefatura_grading_policies DROP CONSTRAINT IF EXISTS jefatura_grader_class_match;
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_grader_class_match CHECK (
      (artifact_class = 'cimiento'  AND canon_grader = 'fidelity') OR
      (artifact_class = 'contenido' AND canon_grader = 'vote_3_of_n') OR
      (artifact_class = 'revision'  AND canon_grader = 'par_fondo_y_ciego')
    );
  END IF;
  -- 2d · valores de las columnas nuevas
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_policies_destino_cierre_valido') THEN
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_policies_destino_cierre_valido CHECK (destino_cierre IS NULL OR destino_cierre IN ('bandeja', 'siguiente_paso'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_policies_reentrega_valida') THEN
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_policies_reentrega_valida CHECK (reentrega IS NULL OR reentrega IN ('ninguna', 'parcial', 'completa', 'version_nueva'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_policies_tope_revision_valido') THEN
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_policies_tope_revision_valido CHECK (tope_revision_usd IS NULL OR (tope_revision_usd > 0 AND tope_revision_usd <= 10));
  END IF;
  -- 2e · una política de revisión NUNCA vota (no-circularidad extendida) y, salvo `manual` (fila futura apagada), trae lo mínimo para operar
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_revision_sin_voto') THEN
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_revision_sin_voto CHECK (artifact_class <> 'revision' OR judgment_enabled = false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jefatura_grading_policies'::regclass AND conname = 'jefatura_revision_completa') THEN
    ALTER TABLE public.jefatura_grading_policies ADD CONSTRAINT jefatura_revision_completa CHECK (
      artifact_class <> 'revision' OR artifact_type = 'manual' OR
      (revisor_fondo IS NOT NULL AND reentrega IS NOT NULL AND destino_cierre IS NOT NULL AND tope_revision_usd IS NOT NULL AND productores IS NOT NULL)
    );
  END IF;
END
$jefatura_checks$;

-- ───────────────────────── 3 · la llave de la jefatura: UNA fila, apagada
CREATE TABLE IF NOT EXISTS public.jefatura_config (
  id               smallint    PRIMARY KEY DEFAULT 1,
  estado           text        NOT NULL DEFAULT 'apagada',
  tipos_activos    text[]      NOT NULL DEFAULT '{}',
  clientes_ensayo  text[]      NOT NULL DEFAULT '{}',
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jefatura_config_una_sola_fila CHECK (id = 1),
  CONSTRAINT jefatura_config_estado_valido CHECK (estado IN ('apagada', 'ensayo', 'encendida'))
);

-- ───────────────────────── 4 · las revisiones: una por (tipo, artefacto, versión, seco/real); el estado de la máquina vive aquí (n8n no guarda estado)
CREATE TABLE IF NOT EXISTS public.jefatura_revisiones (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text          NOT NULL,
  artifact_type     text          NOT NULL REFERENCES public.jefatura_grading_policies(artifact_type),
  artifact_id       text          NOT NULL,
  version           integer       NOT NULL DEFAULT 1,
  journey_id        text,
  estado            text          NOT NULL DEFAULT 'abierta',
  resultado         text,
  marcas            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  estado_del_motor  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  productores       jsonb         NOT NULL DEFAULT '[]'::jsonb,
  entrada           jsonb         NOT NULL DEFAULT '{}'::jsonb,
  devolver_a        jsonb,
  policy_snapshot   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  tope_usd          numeric(10,6) NOT NULL DEFAULT 10,
  gasto_usd         numeric(10,6) NOT NULL DEFAULT 0,
  dry_run           boolean       NOT NULL,
  prueba            boolean       NOT NULL DEFAULT false,
  creado_en         timestamptz   NOT NULL DEFAULT now(),
  cerrado_en        timestamptz,
  CONSTRAINT jefatura_revisiones_estado_valido    CHECK (estado IN ('abierta', 'en_paso', 'cerrada', 'cerrada_por_tope', 'fallida')),
  CONSTRAINT jefatura_revisiones_resultado_valido CHECK (resultado IS NULL OR resultado IN ('limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida')),
  CONSTRAINT jefatura_revisiones_tope_valido      CHECK (tope_usd > 0 AND tope_usd <= 10),
  CONSTRAINT jefatura_revisiones_gasto_valido     CHECK (gasto_usd >= 0),
  CONSTRAINT jefatura_revisiones_version_valida   CHECK (version >= 1)
);
-- 🔴 la idempotencia la da la base: la misma revisión (tipo + artefacto + versión, en seco o en real) no se abre dos veces
CREATE UNIQUE INDEX IF NOT EXISTS jefatura_revisiones_una_por_artefacto ON public.jefatura_revisiones (artifact_type, artifact_id, version, dry_run);
CREATE INDEX IF NOT EXISTS jefatura_revisiones_por_cliente ON public.jefatura_revisiones (client_id, estado, creado_en DESC);

-- ───────────────────────── 5 · los pasos (un paso = una ejecución corta); la traza M1 vive en `traza`; el gasto de GPT queda aquí (no pasa por agent_invocations)
CREATE TABLE IF NOT EXISTS public.jefatura_pasos (
  id                    bigserial     PRIMARY KEY,
  revision_id           uuid          NOT NULL REFERENCES public.jefatura_revisiones(id),
  n                     smallint      NOT NULL,
  paso                  text          NOT NULL,
  intento               smallint      NOT NULL DEFAULT 1,
  tipo                  text          NOT NULL,
  agente                text,
  estado                text          NOT NULL DEFAULT 'pendiente',
  workflow_id           text,
  workflow_execution_id text,
  dispatch_key          text,
  concepto              text          NOT NULL DEFAULT 'modelo',
  base                  text          NOT NULL DEFAULT 'usage',
  cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
  tokens_in             integer,
  tokens_out            integer,
  inicio                timestamptz,
  fin                   timestamptz,
  error                 text,
  traza                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT jefatura_pasos_estado_valido   CHECK (estado IN ('pendiente', 'corriendo', 'hecho', 'fallo', 'muerto')),
  CONSTRAINT jefatura_pasos_tipo_valido     CHECK (tipo IN ('codigo', 'agente', 'externo')),
  CONSTRAINT jefatura_pasos_concepto_valido CHECK (concepto IN ('modelo', 'revisor_externo', 'portero')),
  CONSTRAINT jefatura_pasos_base_valida     CHECK (base IN ('usage', 'estimado')),
  CONSTRAINT jefatura_pasos_costo_valido    CHECK (cost_usd >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS jefatura_pasos_uno_por_n ON public.jefatura_pasos (revision_id, n);
-- 🔴 un reintento del mismo paso encuentra su renglón y no abre otro turno de pago (guarda G2 del diseño)
CREATE UNIQUE INDEX IF NOT EXISTS jefatura_pasos_uno_por_paso_e_intento ON public.jefatura_pasos (revision_id, paso, intento);
CREATE UNIQUE INDEX IF NOT EXISTS jefatura_pasos_una_llave ON public.jefatura_pasos (dispatch_key) WHERE dispatch_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jefatura_pasos_vivos ON public.jefatura_pasos (estado, inicio) WHERE estado IN ('pendiente', 'corriendo');

-- ───────────────────────── 6 · las fichas (qué · dónde · contra qué · gravedad · propuesta)
CREATE TABLE IF NOT EXISTS public.jefatura_fichas (
  revision_id        uuid        NOT NULL REFERENCES public.jefatura_revisiones(id),
  ficha_id           text        NOT NULL,
  paso_id            bigint      REFERENCES public.jefatura_pasos(id),
  origen             text        NOT NULL,
  donde              text        NOT NULL,
  gravedad           text        NOT NULL,
  que                text,
  contra_que         text,
  propuesta          text,
  estado             text        NOT NULL DEFAULT 'abierta',
  razon              text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revision_id, ficha_id),
  CONSTRAINT jefatura_fichas_origen_valido   CHECK (origen IN ('chequeo', 'jefe', 'externa')),
  CONSTRAINT jefatura_fichas_gravedad_valida CHECK (gravedad IN ('bloquea', 'sugerencia')),
  CONSTRAINT jefatura_fichas_estado_valido   CHECK (estado IN ('abierta', 'tomada', 'no_tomada'))
);

-- ───────────────────────── 7 · siembras: la jefatura APAGADA y 6 renglones de política INACTIVOS (el segundo interruptor es `jefatura_config.tipos_activos`)
INSERT INTO public.jefatura_config (id, estado, tipos_activos, clientes_ensayo) VALUES (1, 'apagada', '{}', '{}') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.jefatura_grading_policies
  (artifact_type, artifact_class, correction_enabled, judgment_enabled, canon_grader, counterweight, max_cycles, fidelity_threshold, vote_config, notes, is_active,
   revisor_fondo, revisor_ciego, revisor_ciego_modelo_env, contra_que, productores, esquema_correccion, huecos_pregunta, indicacion_fondo, chequeos_previos, tope_revision_usd, tope_paso_usd, destino_cierre, reentrega)
VALUES
  -- PLAN · F16+F20: jefe → el redactor corrige (B) → GPT ciego sobre B → el redactor decide (C, final); sin otra vuelta de revisión
  ('plan', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · plan · A→B→C (diseño v4 §5.1) · NACE INACTIVA', false,
   'jefe-marketing', true, 'JEFATURA_REVISOR_MODEL',
   $cq${"documentos":[{"clave":"manual","titulo":"Manual de marca vigente","funcion":"manda si dos documentos se contradicen"},{"clave":"ficha","titulo":"Ficha del cliente","funcion":"hechos del negocio"},{"clave":"hechos_del_dueno","titulo":"Lo que dijo el dueño","funcion":"correcciones del dueño; mandan sobre la investigación"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"campaign-brief-agent"}]$pr$::jsonb,
   'plan_texto_y_resolucion.v1',
   $hp${"que_es":"el plan de campaña de 90 días","uso":"guiar toda la producción de la campaña"}$hp$::jsonb,
   'Estás revisando el plan de 90 días contra {documentos}.',
   ARRAY['revisarPlan'], 5.00,
   $tp${"revision_fondo":0.2,"correccion":2.0,"segunda_mirada":0.5,"decision":2.0}$tp$::jsonb,
   'siguiente_paso', 'version_nueva'),
  -- ESTRATEGIA · el objeto entero, una vez
  ('estrategia', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · estrategia · NACE INACTIVA', false,
   'jefe-marketing', true, 'JEFATURA_REVISOR_MODEL',
   $cq${"documentos":[{"clave":"manual","titulo":"Manual de marca vigente","funcion":"manda si dos documentos se contradicen"},{"clave":"plan","titulo":"Plan vigente","funcion":"la estrategia sale de él"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"social-media-strategist"}]$pr$::jsonb,
   'resolucion_objeto.v1',
   $hp${"que_es":"la estrategia de contenido","uso":"ordenar el calendario de la campaña"}$hp$::jsonb,
   'Estás revisando la estrategia contra {documentos}.',
   ARRAY['validarEstrategia'], 2.50,
   $tp${"revision_fondo":0.2,"correccion":0.6,"segunda_mirada":0.5,"decision":0.6}$tp$::jsonb,
   'siguiente_paso', 'completa'),
  -- CALENDARIO · por fila o tanda
  ('calendario', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · calendario · NACE INACTIVA', false,
   'jefe-marketing', true, 'JEFATURA_REVISOR_MODEL',
   $cq${"documentos":[{"clave":"manual","titulo":"Manual de marca vigente","funcion":"manda si dos documentos se contradicen"},{"clave":"plan","titulo":"Plan vigente","funcion":"el calendario sale de él"},{"clave":"estrategia","titulo":"Estrategia validada","funcion":"ordena los temas"},{"clave":"fechas","titulo":"Fechas verificadas","funcion":"fechas y feriados ya comprobados"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"social-media-strategist"}]$pr$::jsonb,
   'resolucion_parcial.v1',
   $hp${"que_es":"el calendario de publicación","uso":"programar las piezas de la campaña"}$hp$::jsonb,
   'Estás revisando el calendario contra {documentos}.',
   ARRAY['validarTodo'], 2.50,
   $tp${"revision_fondo":0.2,"correccion":0.6,"segunda_mirada":0.5,"decision":0.6}$tp$::jsonb,
   'siguiente_paso', 'parcial'),
  -- BRIEF · solo marca (F17): sin corrección ni decisión; el parte entero es UNA revisión
  ('brief', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · brief (solo marca) · NACE INACTIVA', false,
   'jefe-marketing', true, 'JEFATURA_REVISOR_MODEL',
   $cq${"documentos":[{"clave":"manual","titulo":"Manual de marca vigente","funcion":"manda si dos documentos se contradicen"},{"clave":"plan","titulo":"Plan vigente","funcion":"el brief sale de él"},{"clave":"calendario","titulo":"Filas del calendario","funcion":"las filas que originaron cada brief"}]}$cq$::jsonb,
   $pr$[{"donde":"*","agente":"campaign-brief-agent"}]$pr$::jsonb,
   NULL,
   $hp${"que_es":"el parte de briefs","uso":"encargar las piezas de la campaña"}$hp$::jsonb,
   'Estás revisando el parte de briefs contra {documentos}.',
   ARRAY['chequeos_del_brief'], 1.00,
   $tp${"revision_fondo":0.2,"segunda_mirada":0.5}$tp$::jsonb,
   'siguiente_paso', 'ninguna'),
  -- PIEZA · por `donde`; termina SIEMPRE en la bandeja
  ('pieza', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · pieza · reemplaza revision_jefe…decide de las plantillas de la oficina · NACE INACTIVA', false,
   'jefe-marketing', true, 'JEFATURA_REVISOR_MODEL',
   $cq${"documentos":[{"clave":"manual","titulo":"Manual de marca vigente","funcion":"manda si dos documentos se contradicen"},{"clave":"plan","titulo":"Plan vigente","funcion":"la pieza sale de él"},{"clave":"brief","titulo":"Brief de la pieza","funcion":"guía, no regla"},{"clave":"material_portero","titulo":"Material del portero","funcion":"lo que el cerebro entregó para esta pieza"},{"clave":"visual_direction","titulo":"Dirección visual","funcion":"la imagen que se decidió"}]}$cq$::jsonb,
   $pr$[{"donde":"texto","agente":"content-creator"},{"donde":"imagen","agente":"marketing_instagram_curator"}]$pr$::jsonb,
   'resolucion.v1',
   $hp${"que_es":"una pieza","uso":"publicar en la red del cliente"}$hp$::jsonb,
   $ind$No repartes trabajo ni asignas tareas a otros. Revisas una sola vez. Entregas fichas con qué, dónde, contra qué, gravedad y propuesta. No reescribes la pieza: señalas y propones. La imagen también es parte de la pieza: revísala contra el manual y el brief.$ind$,
   ARRAY['chequeos','chequeos_2'], 1.50,
   $tp${"revision_fondo":0.2,"correccion":0.2,"segunda_mirada":0.5,"decision":0.2}$tp$::jsonb,
   'bandeja', 'parcial'),
  -- MANUAL · fila FUTURA y apagada: el manual no lo juzga `jefe-marketing` (no-circularidad); sin revisor de fondo
  ('manual', 'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,
   'jefatura como oficina propia · manual · fila futura APAGADA (no-circularidad: el manual no lo juzga jefe-marketing)', false,
   NULL, false, NULL, NULL, '[]'::jsonb, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ninguna')
ON CONFLICT (artifact_type) DO NOTHING;

-- ───────────────────────── 8 · permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
ALTER TABLE public.jefatura_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jefatura_revisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jefatura_pasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jefatura_fichas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jefatura_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jefatura_revisiones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jefatura_pasos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jefatura_fichas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jefatura_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jefatura_revisiones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jefatura_pasos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jefatura_fichas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.jefatura_pasos_id_seq TO service_role;

DO $jefatura$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.jefatura_config'::regclass AND polname = 'jefatura_config_service') THEN
    CREATE POLICY jefatura_config_service ON public.jefatura_config FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.jefatura_revisiones'::regclass AND polname = 'jefatura_revisiones_service') THEN
    CREATE POLICY jefatura_revisiones_service ON public.jefatura_revisiones FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.jefatura_pasos'::regclass AND polname = 'jefatura_pasos_service') THEN
    CREATE POLICY jefatura_pasos_service ON public.jefatura_pasos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.jefatura_fichas'::regclass AND polname = 'jefatura_fichas_service') THEN
    CREATE POLICY jefatura_fichas_service ON public.jefatura_fichas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$jefatura$;

COMMENT ON TABLE public.jefatura_config IS 'JEFATURA (oficina propia) · la llave: apagada · ensayo · encendida. Una sola fila; nace APAGADA. Segundo interruptor: tipos_activos.';
COMMENT ON TABLE public.jefatura_revisiones IS 'JEFATURA (oficina propia) · una revisión por (tipo, artefacto, versión, seco/real); guarda el estado de la máquina para reanudar.';
COMMENT ON TABLE public.jefatura_pasos IS 'JEFATURA (oficina propia) · un paso por renglón con su traza M1 y su costo; el gasto de GPT vive aquí (concepto revisor_externo).';
COMMENT ON TABLE public.jefatura_fichas IS 'JEFATURA (oficina propia) · fichas (qué · dónde · contra qué · gravedad · propuesta) con origen chequeo | jefe | externa.';

COMMIT;
-- 🔴 una tabla nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
