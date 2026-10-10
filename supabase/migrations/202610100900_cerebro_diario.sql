-- EL PORTERO DIARIO DEL CEREBRO · CC#2 · 2026-10-10 · P1 · PROPUESTA (NO APLICADA) · espera la firma de Emilio/Lenovo.
-- 🔴 SOLO ADITIVA: 4 tablas NUEVAS y VACÍAS. No toca ni borra ninguna fila ni ninguna columna existente (ni `cerebro_fichas`, ni `client_brain_chunks`).
-- 🔴 Quién las usa: SOLO las rutas `/api/brain/diario/*` (llave de servicio). Hasta que alguien encienda el flujo «mantenimiento diario» (inactivo), nadie las lee ni las escribe.
-- 🔴 La lección del proyecto: CREATE TABLE no alcanza. Cada tabla lleva en la MISMA migración RLS + REVOKE a anon/authenticated + GRANT a service_role + política de servicio.
-- 🔴 IDEMPOTENTE (IF NOT EXISTS / bloques DO). Una sola transacción. Sin disparadores. `client_id` es TEXTO (sin llaves foráneas hacia tablas viejas: igual que `cerebro_fichas`).
-- REVERSA: `supabase/reversas/202610100900_cerebro_diario_REVERSA.sql` (las tablas nuevas están vacías hasta la primera corrida real).

BEGIN;

-- ───────────────────────── 1 · cerebro_vigilancia · lo ÚLTIMO que se vio de cada fuente propia (huella + líneas comparables), una fila vigente por (cliente, fuente, ref)
CREATE TABLE IF NOT EXISTS public.cerebro_vigilancia (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        text        NOT NULL,
  fuente           text        NOT NULL,
  ref              text        NOT NULL,
  huella           text        NOT NULL,
  contenido        jsonb       NOT NULL,
  observado_en     timestamptz NOT NULL,
  reconfirmado_en  timestamptz,
  apify_raw_id     text,
  version_de       uuid        REFERENCES public.cerebro_vigilancia(id),
  retirada_en      timestamptz,
  motivo_retirada  text,
  propiedad        text        NOT NULL DEFAULT 'propia',
  provenance_tag   jsonb,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  prueba           boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_vigilancia_fuente_valida CHECK (fuente IN ('sitio','instagram','mapas','reparto','resenas','comentarios')),
  CONSTRAINT cerebro_vigilancia_propiedad_valida CHECK (propiedad IN ('propia','ajena','incierta')),
  CONSTRAINT cerebro_vigilancia_no_version_de_si_misma CHECK (version_de IS NULL OR version_de <> id)
);
-- solo UNA versión viva por (cliente, fuente, ref): una segunda corrida no puede duplicar lo vigente
CREATE UNIQUE INDEX IF NOT EXISTS cerebro_vigilancia_una_viva ON public.cerebro_vigilancia (client_id, fuente, ref) WHERE retirada_en IS NULL;
CREATE INDEX IF NOT EXISTS cerebro_vigilancia_por_cliente ON public.cerebro_vigilancia (client_id, observado_en DESC);

-- ───────────────────────── 2 · cerebro_diario_corridas · el rastro de cada corrida del día (una por cliente y día)
CREATE TABLE IF NOT EXISTS public.cerebro_diario_corridas (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              text        NOT NULL,
  dia                    date        NOT NULL,
  estado                 text        NOT NULL,
  resumen                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  gasto_usd              numeric(14,6) NOT NULL DEFAULT 0,
  workflow_id            text,
  workflow_execution_id  text,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  prueba                 boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_diario_corridas_estado_valido CHECK (estado IN ('hecha','con_errores')),
  CONSTRAINT cerebro_diario_corridas_una_por_dia UNIQUE (client_id, dia)
);

-- ───────────────────────── 3 · cerebro_avisos · piezas en curso con datos viejos (SE CREA, pero NADIE la escribe hasta que exista `output_id` en la cola de revisión · D-5)
CREATE TABLE IF NOT EXISTS public.cerebro_avisos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text        NOT NULL,
  output_id   uuid        NOT NULL,
  dato        text        NOT NULL,
  clase       text        NOT NULL,
  motivo      text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  visto_en    timestamptz,
  prueba      boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_avisos_clase_valida CHECK (clase IN ('precio','horario'))
);
CREATE INDEX IF NOT EXISTS cerebro_avisos_por_cliente ON public.cerebro_avisos (client_id, creado_en DESC);

-- ───────────────────────── 4 · cerebro_oportunidades · material relevante como DATO para la cadena (nunca publica)
CREATE TABLE IF NOT EXISTS public.cerebro_oportunidades (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text        NOT NULL,
  clase       text        NOT NULL,
  titulo      text        NOT NULL,
  dato        text        NOT NULL,
  cita        text,
  fuente      text        NOT NULL,
  vence_en    timestamptz,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  prueba      boolean     NOT NULL DEFAULT false,
  CONSTRAINT cerebro_oportunidades_clase_valida CHECK (clase IN ('precio_cambio','horario_cambio','texto_nuevo','senal_de_resenas','senal_de_comentarios'))
);
CREATE UNIQUE INDEX IF NOT EXISTS cerebro_oportunidades_sin_repetir ON public.cerebro_oportunidades (client_id, clase, fuente, dato);
CREATE INDEX IF NOT EXISTS cerebro_oportunidades_por_cliente ON public.cerebro_oportunidades (client_id, creada_en DESC);

-- ───────────────────────── permisos y seguridad por fila (en la MISMA migración)
ALTER TABLE public.cerebro_vigilancia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_diario_corridas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_avisos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_oportunidades    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cerebro_vigilancia, public.cerebro_diario_corridas, public.cerebro_avisos, public.cerebro_oportunidades FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_vigilancia, public.cerebro_diario_corridas, public.cerebro_avisos, public.cerebro_oportunidades TO service_role;
DO $diario$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cerebro_vigilancia','cerebro_diario_corridas','cerebro_avisos','cerebro_oportunidades'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$diario$;

COMMENT ON TABLE public.cerebro_vigilancia      IS 'CEREBRO · portero diario · lo último visto de cada fuente PROPIA (huella + líneas). Solo la tocan las rutas /api/brain/diario/*. Ver docs/DISENO-2026-10-10-portero-diario.md';
COMMENT ON TABLE public.cerebro_diario_corridas IS 'CEREBRO · portero diario · una fila por cliente y día: qué se hizo y cuánto costó. Es el candado de idempotencia (una corrida por día).';
COMMENT ON TABLE public.cerebro_avisos          IS 'CEREBRO · portero diario · piezas en curso con datos viejos. NADIE la escribe hasta que exista output_id en la cola de revisión (D-5).';
COMMENT ON TABLE public.cerebro_oportunidades   IS 'CEREBRO · portero diario · material relevante como DATO para la cadena (señales agregadas de reseñas, sin nombre ni texto citable). Nunca publica.';

NOTIFY pgrst, 'reload schema';
COMMIT;
