-- calendar_booking_attempts · una fila por INTENTO de reserva contra Cal.com.
--
-- POR QUÉ HACE FALTA (medido 2026-09-03 · `raw/findings/2026-09-03-CC1-el-409-de-Calcom-
-- y-el-aviso-falso.md`) · Emilio preguntó «¿desde cuándo llega 409?» y la respuesta fue
-- «no se puede fechar»:
--   · `calendar_bookings` guarda SÓLO los éxitos (16 filas · la última del 29-ago)
--   · las corridas del motor se podan a los ~7 días
--   · el motivo del rechazo se devolvía al que llamó y se descartaba
-- Resultado · de un rechazo no quedaba rastro en ninguna parte, y la pregunta no tenía
-- forma de contestarse. Con esta tabla se contesta con una consulta.
--
-- LO QUE ESTA TABLA HABRÍA CONTESTADO · «el primer 409 fue el <fecha>», «la proporción
-- 400/409 es X/Y», «este cliente lleva N rechazos seguidos».
--
-- Mismo patrón que `agent_callback_attempts` (Track P) · escritura de mejor esfuerzo:
-- si esta migración NO está aplicada, el insert falla, se registra en consola y la
-- reserva sigue su curso igual. NADA depende de esta tabla para funcionar.
--
-- Migración de UN archivo (R10). Para aplicar (§144 · paso aparte) ·
--   psql ... < 202609031500_calendar_booking_attempts.sql
-- NO usar `db push` (riesgo de deriva).
--
-- §148 honesto · APLICADA en producción el 2026-09-03 (Emilio firmó la publicación).
-- Verificado contra la base viva: 13 columnas · 4 índices · RLS encendida · lectura y
-- escritura del rol de servicio por PostgREST devolviendo 200. El bloque de PERMISOS
-- del final se agregó DESPUÉS del primer aplique, porque sin él la tabla quedaba
-- creada y muda (403 · 42501): ver su comentario.

-- ─── PRE-CHECK ──────────────────────────────────────────────────────
-- Se niega a correr si la tabla ya existe con otra forma · canon es ESTE esquema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calendar_booking_attempts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'calendar_booking_attempts'
        AND column_name IN (
          'id', 'client_id', 'contact_email', 'requested_start', 'attempt_number',
          'outcome', 'upstream_status', 'upstream_code', 'upstream_message',
          'rescatado', 'provider_booking_id', 'attempted_at'
        )
      GROUP BY table_schema, table_name
      HAVING COUNT(DISTINCT column_name) = 12
    ) THEN
      RAISE EXCEPTION 'calendar_booking_attempts existe con OTRA forma · deriva · revisión §144';
    END IF;
    RAISE NOTICE 'calendar_booking_attempts ya está con la forma canónica · el CREATE de abajo no hace nada';
  END IF;
END $$;

-- ─── TABLA ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_booking_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cliente del alta · nulo cuando el llamador no lo mandó (C7 · pasa hoy).
  client_id           uuid,
  contact_email       text NOT NULL,
  -- El horario que se PIDIÓ en este intento · no el que quedó reservado.
  requested_start     timestamptz NOT NULL,
  -- 1 = el pedido original · 2 = el intento tras buscar el próximo hueco libre.
  attempt_number      integer NOT NULL,
  -- 'reservado' | 'rechazado' | 'error_de_red' · el idioma del negocio, no el del proveedor.
  outcome             text NOT NULL,
  -- Código HTTP de Cal.com · 0 cuando la llamada ni salió. Ésta es la columna que
  -- contesta «¿desde cuándo 409?».
  upstream_status     integer NOT NULL,
  -- Etiqueta del proveedor · p.ej. 'ConflictException' (409) · antes venía como 400.
  upstream_code       text,
  -- La frase del proveedor. Es la que probó que 400 y 409 son la MISMA condición:
  -- "User either already has booking at this time or is not available".
  upstream_message    text,
  -- true cuando este intento existe porque el anterior fue rechazado.
  rescatado           boolean NOT NULL DEFAULT false,
  -- Identificador de la reserva cuando salió bien · empata con calendar_bookings.
  provider_booking_id text,
  attempted_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.calendar_booking_attempts IS
  'Un intento de reserva por fila (Cal.com) · incluye los RECHAZOS, que antes no dejaban rastro. Escritura de mejor esfuerzo desde /api/calendar/book · nada depende de esta tabla para reservar.';

-- ─── ÍNDICES ────────────────────────────────────────────────────────
-- Las consultas que motivaron la tabla · «¿desde cuándo este código?» y
-- «¿qué pasó con este cliente?».

CREATE INDEX IF NOT EXISTS idx_calendar_attempts_status_fecha
  ON public.calendar_booking_attempts (upstream_status, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_attempts_cliente
  ON public.calendar_booking_attempts (client_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_attempts_fecha
  ON public.calendar_booking_attempts (attempted_at DESC);

-- ─── PERMISOS ───────────────────────────────────────────────────────
-- MEDIDO AL APLICAR (2026-09-03) · sin esto la tabla queda creada y **muda**: la
-- ruta escribe con el rol de servicio a través de PostgREST y recibía
--   403 · 42501 · "permission denied for table calendar_booking_attempts"
-- Los privilegios por defecto de este proyecto sólo dan REFERENCES/TRIGGER/TRUNCATE
-- a los roles de la API · las tablas hermanas (`calendar_bookings`,
-- `agent_callback_attempts`) tienen el DML concedido explícitamente.
--
-- Se concede SÓLO al rol de servicio (menos privilegio que las hermanas, que además
-- se lo dan a anon/authenticated): esta tabla la escribe el servidor y nadie más.
-- Con RLS encendida y sin políticas, anon/authenticated quedan denegados aunque
-- alguien les conceda DML por error más adelante.

ALTER TABLE public.calendar_booking_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_booking_attempts FROM PUBLIC;
REVOKE ALL ON public.calendar_booking_attempts FROM anon;
REVOKE ALL ON public.calendar_booking_attempts FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_booking_attempts TO service_role;
