-- PASO 2 DEL CEREBRO · CC#1 · 2026-10-06 · PROPUESTA (NO APLICADA) · firma CONDICIONAL de Emilio del 2026-10-06 + compuerta de CC#3.
-- 🔴 SOLO ADITIVA: 2 tablas NUEVAS y VACÍAS + 4 columnas ANULABLES sin valor por defecto en `client_social_images`. No toca ni borra ninguna fila ni ninguna columna existente.
-- 🔴 NADIE las lee ni las escribe todavía (ni productores, ni flujos, ni el alta): las usarán los pasos 3 y siguientes del cerebro. Una prueba permanente lo vigila.
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS y bloques DO para lo que no admite IF NOT EXISTS. Sin disparadores. Sin llaves foráneas hacia tablas viejas (`client_id` es TEXTO: «prueba-portero» no es un uuid ni existe en `clients`).
-- 🔴 `archivo_bytes` es el TAMAÑO del archivo en bytes (un número, bigint): el CONTENIDO del archivo NO se guarda en estas tablas (el respaldo semanal `/api/admin/db-backup` vuelca todas las tablas como INSERT de texto). Los archivos irán a un almacén privado (paso 5+), con su enlace en `archivo_enlace`.
-- 🔴 Una sola transacción: o entra todo o no entra nada.
-- ORDEN AL PUBLICAR: (1) respaldo confirmado y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) NOTIFY (ya incluido al final) → (5) verificación: las 16 fotos intactas.
-- REVERSA: `202610060100_cerebro_paso_2_REVERSA.sql` (deja el esquema idéntico a antes; las tablas y columnas nuevas están vacías).

BEGIN;

-- ───────────────────────── 1 · cerebro_ingresos · lo que LLEGÓ (el original entero primero)
CREATE TABLE IF NOT EXISTS public.cerebro_ingresos (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              text        NOT NULL,
  origen                 text        NOT NULL,
  fuente_ref             text,
  es_completa            boolean     NOT NULL DEFAULT false,
  huella                 text        NOT NULL,
  material               text,
  archivo_nombre         text,
  archivo_tipo           text,
  archivo_enlace         text,
  archivo_bytes          bigint,
  segmentos_n            integer,
  segmentos_bloqueados   jsonb,
  estado                 text        NOT NULL DEFAULT 'recibido',
  cobertura              numeric,
  motivo                 text,
  workflow_id            text,
  workflow_execution_id  text,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  prueba                 boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_ingresos_origen_valido CHECK (origen IN ('dueno','su_fuente','plataforma','tercero')),
  CONSTRAINT cerebro_ingresos_estado_valido CHECK (estado IN ('recibido','fichado','parcial','fallido','bloqueado_por_seguridad')),
  CONSTRAINT cerebro_ingresos_cobertura_valida CHECK (cobertura IS NULL OR (cobertura >= 0 AND cobertura <= 1))
);
CREATE INDEX IF NOT EXISTS cerebro_ingresos_por_cliente ON public.cerebro_ingresos (client_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS cerebro_ingresos_por_fuente  ON public.cerebro_ingresos (client_id, fuente_ref) WHERE fuente_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS cerebro_ingresos_de_prueba   ON public.cerebro_ingresos (prueba) WHERE prueba;

-- ───────────────────────── 2 · cerebro_fichas · cada cosa completa, con su texto copiado y sus firmas
CREATE TABLE IF NOT EXISTS public.cerebro_fichas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          text        NOT NULL,
  ingreso_id         uuid        NOT NULL REFERENCES public.cerebro_ingresos(id),
  ref                text        NOT NULL,
  clase              text,
  titulo             text,
  que_es             text,
  contenido          text,
  archivo_nombre     text,
  archivo_tipo       text,
  archivo_enlace     text,
  archivo_bytes      bigint,
  firmas             text[],
  origen             text        NOT NULL,
  fecha_fuente       timestamptz,
  reconfirmado_en    timestamptz,
  plazo              text,
  vigente_hasta      timestamptz,
  version_de         uuid        REFERENCES public.cerebro_fichas(id),
  retirada_en        timestamptz,
  motivo_retirada    text,
  huella             text,
  producto           text[],
  sede               text,
  propiedad          text,
  porque             text,
  descartada         boolean     NOT NULL DEFAULT false,
  motivo_descarte    text,
  juzgado_por        text,
  residual           boolean     NOT NULL DEFAULT false,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  provenance_tag     jsonb,
  prueba             boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_fichas_origen_valido     CHECK (origen IN ('dueno','su_fuente','plataforma','tercero')),
  CONSTRAINT cerebro_fichas_propiedad_valida  CHECK (propiedad IS NULL OR propiedad IN ('propia','ajena','incierta')),
  CONSTRAINT cerebro_fichas_juzgado_por_valido CHECK (juzgado_por IS NULL OR juzgado_por IN ('modelo','sistema','regla')),
  CONSTRAINT cerebro_fichas_no_version_de_si_misma CHECK (version_de IS NULL OR version_de <> id)
);
CREATE INDEX IF NOT EXISTS cerebro_fichas_por_cliente ON public.cerebro_fichas (client_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS cerebro_fichas_por_ref     ON public.cerebro_fichas (client_id, ref);
CREATE INDEX IF NOT EXISTS cerebro_fichas_por_ingreso ON public.cerebro_fichas (ingreso_id);
CREATE INDEX IF NOT EXISTS cerebro_fichas_de_prueba   ON public.cerebro_fichas (prueba) WHERE prueba;

-- ───────────────────────── 3 · permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
-- Supabase da por defecto TODOS los privilegios a anon y authenticated en tablas nuevas: se QUITAN. Solo la llave de servicio del servidor (service_role) las toca.
ALTER TABLE public.cerebro_ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_fichas   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cerebro_ingresos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cerebro_fichas   FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_ingresos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_fichas   TO service_role;
DO $cerebro$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.cerebro_ingresos'::regclass AND polname = 'cerebro_ingresos_service') THEN
    CREATE POLICY cerebro_ingresos_service ON public.cerebro_ingresos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.cerebro_fichas'::regclass AND polname = 'cerebro_fichas_service') THEN
    CREATE POLICY cerebro_fichas_service ON public.cerebro_fichas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$cerebro$;

-- ───────────────────────── 4 · 4 columnas en client_social_images (ANULABLES, sin valor por defecto: lo viejo queda tal cual)
-- NO se toca `producto` (ya existe): estas guardan lo que la foto MUESTRA según el etiquetador (paso 4), aparte de lo que dijo el texto de la publicación.
ALTER TABLE public.client_social_images
  ADD COLUMN IF NOT EXISTS que_muestra      text,
  ADD COLUMN IF NOT EXISTS producto_visto   text[],
  ADD COLUMN IF NOT EXISTS etiquetada_en    timestamptz,
  ADD COLUMN IF NOT EXISTS etiqueta_modelo  text;

COMMENT ON TABLE  public.cerebro_ingresos IS 'CEREBRO · lo que LLEGÓ (original entero) · solo lo escribe y lo lee el portero del cerebro (paso 3+). Ver docs/MAPA-2026-10-06-tablas-del-cerebro.md';
COMMENT ON TABLE  public.cerebro_fichas   IS 'CEREBRO · cada cosa completa fichada (texto copiado, firmas por segmento) · solo la escribe y la lee el portero del cerebro (paso 3+). Ver docs/MAPA-2026-10-06-tablas-del-cerebro.md';
COMMENT ON COLUMN public.client_social_images.que_muestra     IS 'Lo que la foto MUESTRA, según el etiquetador del cerebro (paso 4). Aparte de `producto` (lo que dijo el texto). Nadie más la escribe ni la lee.';
COMMENT ON COLUMN public.client_social_images.producto_visto  IS 'Producto(s) que se VEN en la foto (vacío si ninguno). No pisa `producto`.';

COMMENT ON COLUMN public.cerebro_ingresos.archivo_bytes IS 'TAMAÑO del archivo en bytes (número). El contenido NO vive en esta tabla.';
COMMENT ON COLUMN public.cerebro_fichas.archivo_bytes   IS 'TAMAÑO del archivo en bytes (número). El contenido NO vive en esta tabla.';

COMMIT;

-- 🔴 una tabla o columna nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
