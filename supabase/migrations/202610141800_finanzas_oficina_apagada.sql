-- OFICINA FINANCIERA · F1 · CC#1 · 2026-10-14 · PROPUESTA · NO APLICADA · se aplica en producción solo tras SÍ de CC#3, con respaldo y CERO corridas en vuelo
-- Diseño: raw/tasks/2026-10-14-DISENO-CC1-oficina-financiera-v2.md (rev. 8) §4–§5 y §9b · Orden: raw/tasks/2026-10-14-ENCARGO-LENOVO-CC1-construir-oficina-financiera-F0-F7.md
-- 🔴 8 tablas NUEVAS y nada más: no toca ni altera ninguna tabla existente (ni `agents`, ni `settings`, ni el cimiento, ni la jefatura).
-- 🔴 NACE APAGADA: `finanzas_config.estado = 'apagada'` (las rutas devuelven 409), `preguntas_slack = 'apagado'`, `conversa = 'apagado'`. NADIE la usa todavía.
-- 🔴 IDENTIFICADORES uuid (gen_random_uuid): ninguna secuencia; por eso NO hay permisos de secuencias que conceder ni que revocar. `anon` y `authenticated`: SIN ningún permiso ni política (R4 de CC#3).
-- 🔴 AGNÓSTICA: los catálogos (eventos, canales) son filas genéricas con fuente; ningún rubro, ciudad, cliente ni producto. `finanzas_referencias` y `finanzas_canales_por_rubro` nacen VACÍAS: la oficina las llena con fuente y fecha («supuesto») y nunca inventa un número.
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS, ON CONFLICT DO NOTHING y bloques DO. `client_id` es TEXTO sin llave hacia tablas viejas (igual que la oficina creativa y la jefatura).
-- 🔴 una tabla nueva sin permisos no la ve PostgREST: GRANT + RLS + NOTIFY incluidos.
-- ORDEN AL PUBLICAR: (1) respaldo y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) comprobar que las rutas /api/finanzas/* devuelven 409 → (5) NOTIFY (ya incluido).
-- REVERSA: `supabase/reversas/202610141800_finanzas_oficina_apagada_REVERSA.sql` (se niega a borrar si hay tableros, preguntas, referencias o pesos por rubro).

BEGIN;

-- ───────────────────────── 1 · el interruptor (una sola fila)
CREATE TABLE IF NOT EXISTS public.finanzas_config (
  id               integer      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estado           text         NOT NULL DEFAULT 'apagada' CHECK (estado IN ('apagada', 'ensayo', 'encendida')),
  -- clientes que entran en ensayo (texto: sin llave hacia tablas viejas)
  clientes_ensayo  text[]       NOT NULL DEFAULT '{}'::text[],
  -- canal de preguntas a Emilio (§9b): «borrador» escribe la fila y NO llama a Slack
  preguntas_slack  text         NOT NULL DEFAULT 'apagado' CHECK (preguntas_slack IN ('apagado', 'borrador', 'envia')),
  -- la oficina conversa por Slack (§6b, F8): no se usa hasta F8
  conversa         text         NOT NULL DEFAULT 'apagado' CHECK (conversa IN ('apagado', 'ensayo', 'enciende')),
  actualizado_en   timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO public.finanzas_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ───────────────────────── 2 · catálogos (DATOS, no código): eventos y canales
CREATE TABLE IF NOT EXISTS public.finanzas_eventos (
  clave          text         PRIMARY KEY,
  nombre         text         NOT NULL,
  -- el evento de MÁS volumen al que se cae si el presupuesto no alcanza para aprender (otra clave de esta tabla)
  evento_alterno text,
  orden          integer      NOT NULL DEFAULT 0,
  activo         boolean      NOT NULL DEFAULT true,
  creado_en      timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO public.finanzas_eventos (clave, nombre, evento_alterno, orden) VALUES
  ('mensaje',        'Mensaje iniciado',            NULL,           10),
  ('formulario',     'Formulario o lead',           'mensaje',      20),
  ('reserva',        'Reserva',                     'mensaje',      30),
  ('llamada',        'Llamada',                     'mensaje',      40),
  ('compra_web',     'Compra en la web',            'carrito',      50),
  ('carrito',        'Añadir al carrito',           NULL,           51),
  ('visita_tienda',  'Visita a la tienda',          'mensaje',      60),
  ('cita_demo',      'Cita o demostración',         'formulario',   70)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.finanzas_canales (
  clave                    text         PRIMARY KEY,
  nombre                   text         NOT NULL,
  eventos_nativos          text[]       NOT NULL DEFAULT '{}'::text[],
  -- piso diario por campaña (null = el canal no pauta o no se conoce)
  piso_diario              numeric(12,2),
  piso_nota                text,
  condicion_de_activacion  text,
  fuente                   text         NOT NULL,
  -- true = cifra de guía de terceros: «verificar en la plataforma»
  verificar                boolean      NOT NULL DEFAULT true,
  activo                   boolean      NOT NULL DEFAULT true,
  creado_en                timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO public.finanzas_canales (clave, nombre, eventos_nativos, piso_diario, piso_nota, condicion_de_activacion, fuente, verificar) VALUES
  ('meta_ig',          'Meta + Instagram',                          ARRAY['mensaje','formulario','compra_web','visita_tienda'], 1,    'de 1 a 5 por conjunto según el objetivo y la configuración; ≈ 50 eventos por semana para salir del aprendizaje (típicamente)', NULL, 'guías de terceros (tryvizup, savemyleads, lseo); verificar en la plataforma', true),
  ('busqueda_pagada',  'Búsqueda pagada',                           ARRAY['llamada','formulario','compra_web'],                 NULL, '≈ 30 conversiones en 30 días; presupuesto diario ≈ 10× el costo objetivo', 'ficha local verificada + volumen en el planificador de palabras + costo por resultado de Meta ya medido', 'guías de terceros (searchenginejournal); verificar en la plataforma', true),
  ('busqueda_local',   'Búsqueda local gratuita (ficha de negocio)', ARRAY['llamada','mensaje','visita_tienda'],                NULL, 'sin pauta: se completa y se verifica la ficha ANTES de pagar búsqueda', NULL, 'criterio de la oficina (paid-media-ppc-strategist)', false),
  ('video_largo',      'Video de descubrimiento',                   ARRAY['visita_tienda','formulario'],                        NULL, 'por campaña; verificar', NULL, 'sin fuente confiable todavía', true),
  ('video_corto',      'Video corto',                               ARRAY['mensaje','compra_web'],                              50,   'campaña > 50 por día y grupo de anuncios > 20 por día (oficial)', NULL, 'TikTok for Business, página de presupuesto (julio 2026)', false),
  ('profesional_b2b',  'Red profesional (B2B)',                     ARRAY['formulario','cita_demo'],                            NULL, 'por campaña; verificar', NULL, 'sin fuente confiable todavía', true),
  ('base_propia',      'Correo o mensajes a la base propia',        ARRAY['mensaje','compra_web'],                              0,    'casi sin costo de medios; exige una base mínima propia', 'base propia con consentimiento', 'criterio de la oficina', false),
  ('apps_y_mercados',  'Apps de reparto y mercados',                ARRAY['compra_web'],                                        NULL, 'comisión y promociones del propio canal', 'solo si el rubro vende ahí', 'criterio de la oficina', true),
  ('influencers',      'Influencers',                               ARRAY['mensaje','compra_web'],                              NULL, 'pago fijo por pieza; se prueba chico', 'después de medir el costo por resultado propio', 'criterio de la oficina', true)
ON CONFLICT (clave) DO NOTHING;

-- ───────────────────────── 3 · referencias y pesos por rubro (nacen VACÍAS)
CREATE TABLE IF NOT EXISTS public.finanzas_referencias (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  rubro         text         NOT NULL,
  pais          text         NOT NULL,
  canal         text         NOT NULL REFERENCES public.finanzas_canales (clave),
  evento        text         NOT NULL REFERENCES public.finanzas_eventos (clave),
  parametro     text         NOT NULL DEFAULT 'costo_por_resultado',
  minimo        numeric(14,4) NOT NULL CHECK (minimo > 0),
  maximo        numeric(14,4) NOT NULL,
  base          numeric(14,4),
  moneda        text         NOT NULL,
  tipo          text         NOT NULL CHECK (tipo IN ('dato', 'supuesto')),
  fuente        text         NOT NULL CHECK (length(fuente) > 0),
  fecha         date         NOT NULL,
  vigente_hasta date         NOT NULL,
  creado_en     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT finanzas_referencias_rango CHECK (maximo >= minimo AND (base IS NULL OR (base >= minimo AND base <= maximo))),
  CONSTRAINT finanzas_referencias_vigencia CHECK (vigente_hasta >= fecha)
);
CREATE INDEX IF NOT EXISTS finanzas_referencias_busqueda ON public.finanzas_referencias (rubro, pais, canal, evento, vigente_hasta);

CREATE TABLE IF NOT EXISTS public.finanzas_canales_por_rubro (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  rubro       text         NOT NULL,
  pais        text         NOT NULL,
  canal       text         NOT NULL REFERENCES public.finanzas_canales (clave),
  peso        numeric(5,4) NOT NULL CHECK (peso >= 0 AND peso <= 1),
  tipo        text         NOT NULL CHECK (tipo IN ('dato', 'supuesto')),
  fuente      text         NOT NULL CHECK (length(fuente) > 0),
  fecha       date         NOT NULL,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (rubro, pais, canal)
);

-- ───────────────────────── 4 · el tablero (versionado, con huella) y la traza de cada cifra
CREATE TABLE IF NOT EXISTS public.finanzas_tableros (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             text         NOT NULL,
  version               integer      NOT NULL CHECK (version >= 1),
  vigente               boolean      NOT NULL DEFAULT false,
  estado                text         NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'firmado', 'sin_firma', 'reemplazado')),
  entrada               jsonb        NOT NULL DEFAULT '{}'::jsonb,
  bloque                jsonb        NOT NULL DEFAULT '{}'::jsonb,
  supuestos             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  huella                text,
  firmado_por           text,
  firmado_en            timestamptz,
  workflow_execution_id text,
  dry_run               boolean      NOT NULL DEFAULT true,
  creado_en             timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (client_id, version),
  -- un tablero firmado lleva huella y fecha
  CONSTRAINT finanzas_tableros_firma CHECK (estado <> 'firmado' OR (huella IS NOT NULL AND firmado_en IS NOT NULL AND firmado_por IS NOT NULL))
);
-- a lo sumo UN tablero vigente por cliente
CREATE UNIQUE INDEX IF NOT EXISTS finanzas_tableros_un_vigente ON public.finanzas_tableros (client_id) WHERE vigente;

CREATE TABLE IF NOT EXISTS public.finanzas_numeros (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tablero_id  uuid         NOT NULL REFERENCES public.finanzas_tableros (id) ON DELETE CASCADE,
  clave       text         NOT NULL,
  valor       numeric(18,4),
  minimo      numeric(18,4),
  maximo      numeric(18,4),
  unidad      text,
  tipo        text         NOT NULL CHECK (tipo IN ('dato', 'supuesto', 'sin_base')),
  fuente      text         NOT NULL,
  fecha       date,
  formula     text,
  motivo      text,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tablero_id, clave),
  -- nunca una celda vacía: sin valor solo si es «sin_base» y con motivo
  CONSTRAINT finanzas_numeros_sin_celda_vacia CHECK (valor IS NOT NULL OR (tipo = 'sin_base' AND motivo IS NOT NULL AND length(motivo) > 0))
);

-- ───────────────────────── 5 · preguntas a Emilio (canal §9b): borrador → enviada → respondida | vencida | sin_necesidad
CREATE TABLE IF NOT EXISTS public.finanzas_preguntas (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                text         NOT NULL,
  clave                    text         NOT NULL,
  texto                    text         NOT NULL,
  recomendacion            text         NOT NULL,
  supuesto_si_no_responde  text         NOT NULL,
  estado                   text         NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'respondida', 'vencida', 'sin_necesidad')),
  mensaje_canal            text,
  mensaje_ts               text,
  respuesta_literal        text,
  respondida_en            timestamptz,
  creado_en                timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT finanzas_preguntas_respuesta CHECK (estado <> 'respondida' OR (respuesta_literal IS NOT NULL AND respondida_en IS NOT NULL))
);
-- una pregunta abierta por cliente y clave (no se repite)
CREATE UNIQUE INDEX IF NOT EXISTS finanzas_preguntas_una_abierta ON public.finanzas_preguntas (client_id, clave) WHERE estado IN ('borrador', 'enviada');

-- ───────────────────────── 6 · permisos y seguridad por fila: SOLO service_role; anon y authenticated, nada
ALTER TABLE public.finanzas_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_eventos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_canales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_referencias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_canales_por_rubro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_tableros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_numeros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_preguntas        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.finanzas_config, public.finanzas_eventos, public.finanzas_canales, public.finanzas_referencias, public.finanzas_canales_por_rubro,
              public.finanzas_tableros, public.finanzas_numeros, public.finanzas_preguntas FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_eventos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_canales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_referencias TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_canales_por_rubro TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_tableros TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_numeros TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_preguntas TO service_role;

DO $finanzas_politicas$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finanzas_config', 'finanzas_eventos', 'finanzas_canales', 'finanzas_referencias', 'finanzas_canales_por_rubro', 'finanzas_tableros', 'finanzas_numeros', 'finanzas_preguntas']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$finanzas_politicas$;

COMMIT;

-- PostgREST recarga su esquema (sin esto no ve las tablas nuevas)
NOTIFY pgrst, 'reload schema';
