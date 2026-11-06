-- 06-nov · LAS PREGUNTAS AL DUEÑO SALEN DEL CEREBRO (firma de Emilio 09:15/09:17 local vía Lenovo · ADR-021 D6 · diseño de Cerebro) · CC1
-- Una pregunta pendiente NO es canon del cliente: es estado del trabajo. Vive aquí, en la plataforma, para todas las oficinas.
-- Al cerebro solo entra la RESPUESTA o el supuesto que el dueño ASUME (por POST /api/brain/alimentar/dueno); su ficha queda anotada en `ficha_ref`.
-- Absorbe `finanzas_preguntas` (0 filas, nadie la escribe) y reemplaza `cerebro_dueno_preguntas` (la migra CC-CEREBRO conservando el MISMO id).
-- `ficha_ref` es un uuid SIN llave foránea: la plataforma no nombra tablas del cerebro.
-- ADITIVA: tabla nueva, no toca ninguna fila existente. 🔴 Tabla nueva = GRANT + RLS en la misma migración (sin permisos PostgREST no la ve).
-- REVERSA: supabase/reversas/202611061200_dueno_preguntas_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.dueno_preguntas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sede_clave             text,
  tema                   text NOT NULL CHECK (char_length(tema) BETWEEN 1 AND 80),
  tema_norm              text NOT NULL,
  pregunta               text NOT NULL CHECK (char_length(pregunta) BETWEEN 1 AND 600),
  supuesto               text CHECK (supuesto IS NULL OR char_length(supuesto) BETWEEN 1 AND 2000),
  canal                  text NOT NULL,
  oficina                text NOT NULL,
  agente                 text NOT NULL,
  workflow_id            text,
  workflow_execution_id  text,
  estado                 text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','respondida','asumida','descartada','vencida','obsoleta')),
  respuesta              text CHECK (respuesta IS NULL OR char_length(respuesta) BETWEEN 1 AND 2000),
  decidido_por           text,
  decidido_en            timestamptz,
  motivo                 text CHECK (motivo IS NULL OR char_length(motivo) BETWEEN 1 AND 300),
  ficha_ref              uuid,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dueno_preguntas_respondida CHECK (estado <> 'respondida' OR (respuesta IS NOT NULL AND decidido_en IS NOT NULL)),
  CONSTRAINT dueno_preguntas_asumida    CHECK (estado <> 'asumida'    OR (supuesto  IS NOT NULL AND decidido_en IS NOT NULL)),
  CONSTRAINT dueno_preguntas_con_motivo CHECK (estado NOT IN ('descartada','obsoleta') OR motivo IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS dueno_preguntas_por_cliente ON public.dueno_preguntas (client_id, estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS dueno_preguntas_por_corrida ON public.dueno_preguntas (workflow_id, workflow_execution_id) WHERE workflow_id IS NOT NULL;

ALTER TABLE public.dueno_preguntas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dueno_preguntas FROM anon, authenticated;
DROP POLICY IF EXISTS dueno_preguntas_service ON public.dueno_preguntas;
CREATE POLICY dueno_preguntas_service ON public.dueno_preguntas FOR ALL TO service_role USING (true) WITH CHECK (true);
-- nada se borra: el servidor inserta, lee y cambia el estado
GRANT SELECT, INSERT, UPDATE ON public.dueno_preguntas TO service_role;
COMMENT ON TABLE public.dueno_preguntas IS 'Preguntas de cualquier oficina al dueño (estado del trabajo, no canon). Al cerebro solo entra la respuesta o el supuesto asumido; ficha_ref anota su ficha.';
COMMIT;
NOTIFY pgrst, 'reload schema';
