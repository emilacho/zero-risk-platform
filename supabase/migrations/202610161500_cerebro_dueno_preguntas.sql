-- PREGUNTAS PENDIENTES AL DUEÑO · CC-CEREBRO · 2026-10-16 (firma de Emilio vía el otro orquestador: «ninguna oficina vuelve a preguntar lo mismo»).
-- Tabla NUEVA y aditiva: el registro de lo que una oficina le preguntó al dueño y aún no responde, para que dos oficinas no pregunten lo mismo a la vez.
-- Las RESPUESTAS no van aquí: son fichas de `cerebro_fichas` (origen = dueno). La escribe y la lee solo el servidor (service_role) por /api/brain/alimentar/dueno.
-- Detrás de PORTERO_DUENO (apagado por omisión). 🔴 Tabla nueva = GRANT + RLS en la misma migración.
-- REVERSA: supabase/reversas/202610161500_cerebro_dueno_preguntas_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.cerebro_dueno_preguntas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sede_clave             text,
  tema                   text NOT NULL,
  tema_norm              text NOT NULL,
  pregunta               text NOT NULL,
  canal                  text NOT NULL,
  preguntado_por_oficina text NOT NULL,
  preguntado_por_agente  text NOT NULL,
  estado                 text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','respondida','vencida')),
  ficha_id               uuid REFERENCES public.cerebro_fichas(id),
  workflow_id            text,
  workflow_execution_id  text,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  respondida_en          timestamptz
);
CREATE INDEX IF NOT EXISTS cerebro_dueno_preguntas_por_cliente ON public.cerebro_dueno_preguntas (client_id, estado, creado_en DESC);
ALTER TABLE public.cerebro_dueno_preguntas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cerebro_dueno_preguntas_service ON public.cerebro_dueno_preguntas;
CREATE POLICY cerebro_dueno_preguntas_service ON public.cerebro_dueno_preguntas FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.cerebro_dueno_preguntas TO service_role;
COMMENT ON TABLE public.cerebro_dueno_preguntas IS 'Preguntas que una oficina le hizo al dueño y esperan respuesta (para que otra oficina no repita la pregunta). Las respuestas son fichas de cerebro_fichas con origen dueno.';
COMMIT;
NOTIFY pgrst, 'reload schema';
