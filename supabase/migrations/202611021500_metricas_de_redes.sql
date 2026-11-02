-- 02-nov · ENCARGO Lenovo firmado por Emilio · métricas de redes listas para conectar · CC1
-- Contrato: raw/tasks/2026-11-02-CONTRATO-CC1-metricas-de-redes.md. Cuentas y publicaciones aparte de sus mediciones, para guardar la historia.
-- Los números no tienen valor por omisión: nulo es «sin dato», nunca cero. Por eso no se usan social_metrics ni social_schedules (DEFAULT 0 y schedule_id obligatorio).
BEGIN;

CREATE TABLE IF NOT EXISTS public.metricas_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  red text NOT NULL,
  cuenta_externa text NOT NULL,
  handle text,
  url text,
  acceso text NOT NULL DEFAULT 'publico' CHECK (acceso IN ('publico', 'api', 'sin_acceso')),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, red, cuenta_externa)
);

CREATE TABLE IF NOT EXISTS public.metricas_cuenta_mediciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.metricas_cuentas(id) ON DELETE CASCADE,
  dia date NOT NULL,
  fuente text NOT NULL CHECK (fuente IN ('publico', 'api')),
  seguidores bigint,
  siguiendo bigint,
  publicaciones bigint,
  alcance bigint,
  vistas bigint,
  interaccion bigint,
  visitas bigint,
  puntaje numeric,
  resenas bigint,
  extra jsonb,
  medido_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, dia, fuente)
);
CREATE INDEX IF NOT EXISTS metricas_cuenta_mediciones_dia ON public.metricas_cuenta_mediciones (cuenta_id, dia DESC);

CREATE TABLE IF NOT EXISTS public.metricas_publicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.metricas_cuentas(id) ON DELETE SET NULL,
  red text NOT NULL,
  post_externo text NOT NULL,
  url text,
  tipo text,
  publicado_en timestamptz,
  autor text,
  -- Instagram mezcla en la cuenta posts de otros que la etiquetan: nulo si no se sabe, y solo true suma
  es_propia boolean,
  -- el vínculo con la pieza del sistema: nace vacío, porque ninguna pieza se publica sola todavía
  hitl_id uuid,
  oficina_encargo_id uuid,
  agentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, red, post_externo)
);
CREATE INDEX IF NOT EXISTS metricas_publicaciones_cliente ON public.metricas_publicaciones (client_id, es_propia);

CREATE TABLE IF NOT EXISTS public.metricas_publicacion_mediciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL REFERENCES public.metricas_publicaciones(id) ON DELETE CASCADE,
  dia date NOT NULL,
  fuente text NOT NULL CHECK (fuente IN ('publico', 'api')),
  alcance bigint,
  vistas bigint,
  me_gusta bigint,
  comentarios bigint,
  guardados bigint,
  compartidos bigint,
  clics bigint,
  extra jsonb,
  medido_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publicacion_id, dia, fuente)
);
CREATE INDEX IF NOT EXISTS metricas_publicacion_mediciones_dia ON public.metricas_publicacion_mediciones (publicacion_id, dia DESC);

-- la última medición de cada post; el mismo día manda el acceso oficial sobre lo raspado
CREATE OR REPLACE VIEW public.metricas_publicacion_ultima WITH (security_invoker = true) AS
  SELECT DISTINCT ON (publicacion_id) publicacion_id, dia, fuente, alcance, vistas, me_gusta, comentarios, guardados, compartidos, clics, medido_en
  FROM public.metricas_publicacion_mediciones
  ORDER BY publicacion_id, dia DESC, (fuente = 'api') DESC;

ALTER TABLE public.metricas_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_cuenta_mediciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_publicacion_mediciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metricas_cuentas_service ON public.metricas_cuentas;
CREATE POLICY metricas_cuentas_service ON public.metricas_cuentas FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS metricas_cuenta_mediciones_service ON public.metricas_cuenta_mediciones;
CREATE POLICY metricas_cuenta_mediciones_service ON public.metricas_cuenta_mediciones FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS metricas_publicaciones_service ON public.metricas_publicaciones;
CREATE POLICY metricas_publicaciones_service ON public.metricas_publicaciones FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS metricas_publicacion_mediciones_service ON public.metricas_publicacion_mediciones;
CREATE POLICY metricas_publicacion_mediciones_service ON public.metricas_publicacion_mediciones FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.metricas_cuentas TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.metricas_cuenta_mediciones TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.metricas_publicaciones TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.metricas_publicacion_mediciones TO service_role;
GRANT SELECT ON public.metricas_publicacion_ultima TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
