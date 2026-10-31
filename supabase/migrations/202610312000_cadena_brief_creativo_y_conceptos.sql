-- 31-oct · OFICINA DE MARKETING · T1 (CC#1) · el nuevo orden de la cadena (diseño DISENO-CC1-nuevo-orden-de-la-cadena v5 §3–§7 · plan v2 T1) · PROPUESTA · NO APLICADA (se aplica en T9, publicación única)
--   1) `cadena_brief_creativo`: UN brief creativo por campaña y versión (contrato brief_creativo.v1): lo escribe la mesa `brief_mesa`, lo valida código (`leerBriefCreativo`), estados borrador|validada|devuelta|descartada.
--   2) `cadena_conceptos`: el concepto con su banco de ideas (contrato concepto.v1), una fila por campaña y versión; su propio plazo (`plazo_en`, 90 min) y la aprobación de Emilio (tarjeta de concepto).
--   3) `cadena_calendario_filas` + `fase` (a qué fase del plan pertenece la fila) + `idea_ref` (la idea del banco que realiza; NULL = sin idea, la hoja lo declara).
--   4) `cadena_validaciones.objeto` admite `brief_creativo` y `concepto`.
--   5) plazo `aprobacion_concepto`: recordatorio 24 h, alerta 72 h, y NO vence solo (`seguir_esperando`: el reloj se rearma cada 72 h; la decisión es de Emilio, nunca del tiempo).
--   6) `cadena_config`: `planeacion = {redactor}` (el redactor del plan es dato · F2), `max_fases` (tope de fases del plan · F3) y la PALANCA `nuevo_orden = {clientes: []}` (vacía = la cadena de hoy, byte a byte).
-- Nada corre: la palanca nace VACÍA. Reversa: supabase/reversas/202610312000_cadena_brief_creativo_y_conceptos_REVERSA.sql
-- Nota: la migración 202610311600 (CC#2) es independiente; ésta no toca `cadena_mesas_calendario` ni `calendario_mesa`.
BEGIN;

-- ───────────────────────── 1 · el brief creativo de la campaña
CREATE TABLE IF NOT EXISTS public.cadena_brief_creativo (
  id                bigserial    PRIMARY KEY,
  campana_id        uuid         NOT NULL REFERENCES public.cadena_campanas(id),
  version           integer      NOT NULL,
  estado            text         NOT NULL DEFAULT 'borrador',
  texto_md          text,
  leido             jsonb,
  devolucion_texto  text,
  motivo            text,
  costo_usd         numeric(10,4),
  encargo_id        uuid,
  seco              boolean      NOT NULL DEFAULT false,
  creada_en         timestamptz  NOT NULL DEFAULT now(),
  actualizada_en    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT cadena_brief_creativo_estado_valido CHECK (estado IN ('borrador','validada','devuelta','descartada')),
  CONSTRAINT cadena_brief_creativo_version_valida CHECK (version >= 1),
  CONSTRAINT cadena_brief_creativo_version UNIQUE (campana_id, version)
);
COMMENT ON TABLE public.cadena_brief_creativo IS 'CADENA · UN brief creativo por campaña (brief_creativo.v1): insight, UN mensaje, objetivo por red, tono, obligatorios, faltantes declarados. Lo valida código; `devuelta` pide UNA vez más.';

-- ───────────────────────── 2 · el concepto con su banco de ideas
CREATE TABLE IF NOT EXISTS public.cadena_conceptos (
  id                bigserial    PRIMARY KEY,
  campana_id        uuid         NOT NULL REFERENCES public.cadena_campanas(id),
  version           integer      NOT NULL,
  estado            text         NOT NULL DEFAULT 'abierta',
  aprobacion        text,
  texto_md          text,
  leido             jsonb,
  brief_devuelto    text,
  motivo            text,
  costo_usd         numeric(10,4),
  plazo_en          timestamptz,
  encargo_id        uuid,
  hitl_id           text,
  nota_de_emilio    text,
  apunta_a          text,
  decidido_en       timestamptz,
  seco              boolean      NOT NULL DEFAULT false,
  creada_en         timestamptz  NOT NULL DEFAULT now(),
  actualizada_en    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT cadena_conceptos_estado_valido CHECK (estado IN ('abierta','lista','sin_mesa','brief_devuelto')),
  CONSTRAINT cadena_conceptos_aprobacion_valida CHECK (aprobacion IS NULL OR aprobacion IN ('pendiente','aprobado','cambios')),
  CONSTRAINT cadena_conceptos_apunta_a_valido CHECK (apunta_a IS NULL OR apunta_a IN ('concepto','brief')),
  CONSTRAINT cadena_conceptos_version_valida CHECK (version >= 1),
  CONSTRAINT cadena_conceptos_version UNIQUE (campana_id, version)
);
CREATE INDEX IF NOT EXISTS cadena_conceptos_abiertos ON public.cadena_conceptos (plazo_en) WHERE estado = 'abierta';
COMMENT ON TABLE public.cadena_conceptos IS 'CADENA · el concepto de la campaña (concepto.v1): gran idea, capítulos por fase y banco de ideas. Plazo propio de la mesa (`plazo_en`); la aprobación de Emilio no vence sola (plazo aprobacion_concepto · seguir_esperando).';

-- ───────────────────────── 3 · la fila conoce su fase y su idea
ALTER TABLE public.cadena_calendario_filas ADD COLUMN IF NOT EXISTS fase text;
ALTER TABLE public.cadena_calendario_filas ADD COLUMN IF NOT EXISTS idea_ref text;
COMMENT ON COLUMN public.cadena_calendario_filas.fase IS 'la fase del plan a la que pertenece la fila (clave de `estrategia.fases`)';
COMMENT ON COLUMN public.cadena_calendario_filas.idea_ref IS 'la idea del banco del concepto que la fila realiza (`C<fase>-I<nn>`); NULL = sin idea (la hoja lo declara, no lo inventa)';

-- ───────────────────────── 4 · las validaciones del brief creativo y del concepto
ALTER TABLE public.cadena_validaciones DROP CONSTRAINT IF EXISTS cadena_validaciones_objeto_valido;
ALTER TABLE public.cadena_validaciones ADD CONSTRAINT cadena_validaciones_objeto_valido CHECK (objeto IN ('estrategia','calendario','brief','brief_creativo','concepto'));

-- ───────────────────────── 5 · el plazo de la aprobación del concepto (NO vence solo)
INSERT INTO public.cadena_plazos (tipo, recordatorio_horas, alerta_horas, vence_horas, vence_regla, accion_al_vencer, descripcion) VALUES
  ('aprobacion_concepto', 24, 72, NULL, 'seguir_esperando', 'seguir_esperando', 'La tarjeta de concepto espera la decisión de Emilio (aprobar / pedir cambios). Recordatorio a las 24 h, alerta a las 72 h y el reloj se REARMA cada 72 h: nunca se aprueba sola ni vence sola; nada se produce sin su firma.')
ON CONFLICT (tipo) DO NOTHING;

-- ───────────────────────── 6 · configuración: redactor del plan (dato), tope de fases y la palanca (VACÍA)
INSERT INTO public.cadena_config (clave, valor) VALUES
  ('planeacion',  '{"redactor":"jefe-marketing"}'::jsonb),
  ('max_fases',   '4'::jsonb),
  ('nuevo_orden', '{"clientes":[]}'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ───────────────────────── permisos y seguridad por fila (CREATE TABLE no alcanza)
DO $t1$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cadena_brief_creativo','cadena_conceptos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = format('public.%I', t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$t1$;
REVOKE ALL ON SEQUENCE public.cadena_brief_creativo_id_seq, public.cadena_conceptos_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_brief_creativo_id_seq, public.cadena_conceptos_id_seq TO service_role;

-- ───────────────────────── comprobación: lo sembrado está y la palanca nace vacía
DO $t1c$
DECLARE p int; c int; k int;
BEGIN
  SELECT count(*) INTO p FROM public.cadena_plazos WHERE tipo = 'aprobacion_concepto' AND accion_al_vencer = 'seguir_esperando';
  SELECT count(*) INTO c FROM public.cadena_config WHERE clave IN ('planeacion','max_fases','nuevo_orden');
  SELECT jsonb_array_length(COALESCE(valor->'clientes', '[]'::jsonb)) INTO k FROM public.cadena_config WHERE clave = 'nuevo_orden';
  IF p <> 1 THEN RAISE EXCEPTION 'falta el plazo aprobacion_concepto'; END IF;
  IF c <> 3 THEN RAISE EXCEPTION 'faltan claves de cadena_config (planeacion, max_fases, nuevo_orden): hay %', c; END IF;
  IF k <> 0 THEN RAISE EXCEPTION 'la palanca nuevo_orden debe nacer VACÍA y tiene % cliente(s)', k; END IF;
END
$t1c$;

COMMIT;

-- COMPROBACIÓN POSTERIOR AL APLICAR (debe dar 0 filas):
--   select c.relname from pg_class c where c.relname in ('cadena_brief_creativo','cadena_conceptos') and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'));
-- 🔴 una tabla nueva no la ve PostgREST hasta recargar su catálogo
NOTIFY pgrst, 'reload schema';
