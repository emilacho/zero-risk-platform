-- APRENDER DE EMILIO · ETAPA 1: el evento crudo e inmutable · CC#2 · 2026-10-29
-- Todo lo que Emilio hace sobre una pieza (dashboard y Slack) queda aquí tal cual, sin interpretar: decisión, comentario literal, láminas marcadas, foto del contexto.
-- Las etapas siguientes (desmenuzar, encapsular, consolidar, consultar) LEEN de aquí; esta tabla nunca se corrige: si algo cambia, se agrega otro evento.
-- Tabla nueva = GRANT + RLS en la misma migración. Sin FK a clients a propósito: borrar un cliente de práctica no debe borrar lo que Emilio dijo.
-- INMUTABLE: un disparador impide UPDATE y DELETE (también al service_role); el servidor solo inserta y lee.
-- REVERSA: supabase/reversas/202610291900_eventos_de_emilio_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.eventos_de_emilio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocurrio_en    timestamptz NOT NULL DEFAULT now(),
  canal         text NOT NULL CHECK (canal IN ('dashboard','slack')),
  accion        text NOT NULL CHECK (accion IN ('aprobar','rechazar','pedir_cambios','editar','comentar','abrir_rechazo')),
  autor         text NOT NULL,
  client_id     uuid,
  hitl_id       uuid,
  output_id     uuid,
  encargo_id    uuid,
  brief_id      text,
  familia       text,
  pieza_titulo  text,
  laminas       integer[] NOT NULL DEFAULT '{}',
  especialidades text[] NOT NULL DEFAULT '{}',
  comentario    text,
  decision      text,
  resultado     jsonb NOT NULL DEFAULT '{}'::jsonb,
  contexto      jsonb NOT NULL DEFAULT '{}'::jsonb,
  crudo         jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave_unica   text NOT NULL,
  CONSTRAINT eventos_de_emilio_clave_unica UNIQUE (clave_unica)
);
CREATE INDEX IF NOT EXISTS eventos_de_emilio_por_cliente ON public.eventos_de_emilio (client_id, ocurrio_en DESC);
CREATE INDEX IF NOT EXISTS eventos_de_emilio_por_pieza ON public.eventos_de_emilio (hitl_id) WHERE hitl_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eventos_de_emilio_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'eventos_de_emilio es inmutable: agrega otro evento en vez de corregir este';
END $$;
DROP TRIGGER IF EXISTS eventos_de_emilio_sin_cambios ON public.eventos_de_emilio;
CREATE TRIGGER eventos_de_emilio_sin_cambios BEFORE UPDATE OR DELETE ON public.eventos_de_emilio FOR EACH ROW EXECUTE FUNCTION public.eventos_de_emilio_inmutable();
DROP TRIGGER IF EXISTS eventos_de_emilio_sin_vaciar ON public.eventos_de_emilio;
CREATE TRIGGER eventos_de_emilio_sin_vaciar BEFORE TRUNCATE ON public.eventos_de_emilio FOR EACH STATEMENT EXECUTE FUNCTION public.eventos_de_emilio_inmutable();

ALTER TABLE public.eventos_de_emilio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_de_emilio_service ON public.eventos_de_emilio;
CREATE POLICY eventos_de_emilio_service ON public.eventos_de_emilio FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.eventos_de_emilio TO service_role;

COMMENT ON TABLE public.eventos_de_emilio IS 'Etapa 1 de aprender de Emilio: cada acción suya sobre una pieza (dashboard y Slack), cruda e inmutable. La jefatura y la segunda mirada GPT no la leen.';
COMMIT;
NOTIFY pgrst, 'reload schema';
