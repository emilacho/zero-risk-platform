-- 01-nov · ENCARGO Lenovo firmado por Emilio · observabilidad, punto 1 · CC1
-- El texto COMPLETO de lo que se le pidió a cada empleado y de lo que devolvió. Va aparte porque el libro de costos no se borra y estos textos sí: se purgan a los 30 días.
BEGIN;
CREATE TABLE IF NOT EXISTS public.agent_invocation_textos (
  invocation_id uuid PRIMARY KEY REFERENCES public.agent_invocations(id) ON DELETE CASCADE,
  entrada text,
  salida text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_invocation_textos_creado_en ON public.agent_invocation_textos (creado_en);
ALTER TABLE public.agent_invocation_textos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_invocation_textos_service ON public.agent_invocation_textos;
CREATE POLICY agent_invocation_textos_service ON public.agent_invocation_textos FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON public.agent_invocation_textos TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
