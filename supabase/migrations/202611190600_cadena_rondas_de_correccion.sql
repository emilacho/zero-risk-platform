-- 202611190600 · CADENA · grupo C · las rondas de corrección (GO de Lenovo 19-nov 04:29Z · firma de Emilio, ADENDA 17:22Z) · CC3
-- ADITIVA. Dos cosas:
--   1 · la fila puede quedar `descartada_por_bloqueo` (siguió bloqueada tras la última ronda de corrección): se suma al CHECK, sin quitar ningún estado.
--   2 · tabla nueva `cadena_estrategia_rondas`: las pasadas BLOQUEADAS de la estrategia se guardan aparte de `cadena_estrategias`
--       (casi todos los lectores toman la última estrategia sin mirar su estado: una ronda guardada allí sería «la última» para ellos).
-- No toca filas existentes ni otra tabla. Reversa: supabase/reversas/202611190600_cadena_rondas_de_correccion_REVERSA.sql
BEGIN;

ALTER TABLE public.cadena_calendario_filas DROP CONSTRAINT IF EXISTS cadena_filas_estado_valido;
ALTER TABLE public.cadena_calendario_filas ADD CONSTRAINT cadena_filas_estado_valido CHECK (estado IN (
  'esquema','propuesta','validada','en_investigacion','lista_para_brief','briefeada','en_oficina','aprobada','cancelada',
  'espera_video','vencida_sin_brazo','perdio_su_fecha','descartada_sin_fuente','descartada_por_bloqueo'));

CREATE TABLE IF NOT EXISTS public.cadena_estrategia_rondas (
  id          bigserial   PRIMARY KEY,
  campana_id  uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  version     integer     NOT NULL,
  ronda       integer     NOT NULL,
  contenido   jsonb       NOT NULL,
  bloqueos    integer     NOT NULL,
  fichas      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  seco        boolean     NOT NULL DEFAULT false,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_estrategia_rondas_ronda_valida CHECK (ronda >= 0),
  CONSTRAINT cadena_estrategia_rondas_bloqueos_validos CHECK (bloqueos >= 0),
  CONSTRAINT cadena_estrategia_rondas_unica UNIQUE (campana_id, version, ronda)
);

-- permisos iguales a las demás tablas de la cadena: solo service_role
ALTER TABLE public.cadena_estrategia_rondas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_estrategia_rondas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadena_estrategia_rondas TO service_role;
DROP POLICY IF EXISTS cadena_estrategia_rondas_service ON public.cadena_estrategia_rondas;
CREATE POLICY cadena_estrategia_rondas_service ON public.cadena_estrategia_rondas FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON SEQUENCE public.cadena_estrategia_rondas_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_estrategia_rondas_id_seq TO service_role;

COMMENT ON TABLE public.cadena_estrategia_rondas IS 'CADENA · grupo C · las pasadas bloqueadas de la estrategia (0 = primera; 1… = rondas de corrección). Tras la última, la de menos bloqueos (si empatan, la última) entra a cadena_estrategias como validada.';

COMMIT;

-- COMPROBACIÓN POSTERIOR (debe dar 0 filas): la tabla nueva sin RLS o visible para anon/authenticated
--   select c.relname from pg_class c where c.relname = 'cadena_estrategia_rondas' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'));

-- una tabla nueva no la ve PostgREST hasta recargar su catálogo
NOTIFY pgrst, 'reload schema';
