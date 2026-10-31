-- 31-oct · MESA DE CREATIVOS en el paso CALENDARIO (diseño DISENO-CC1-mesa-de-creativos-calendario v2 · revisión CC#3 v2).
--   1) `cadena_mesas_calendario`: una fila por (campaña, tanda, versión del calendario), con su propio plazo (45 min). NO es una corrida: el vigía de las corridas no la toca.
--   2) la plantilla `calendario_mesa` de la oficina (un solo paso `mesa`, tope US$ 1,50) · se siembra ACTIVA: la palanca por cliente es `cadena_config.mesa_de_creativos` (vacía = apagada).
--   3) el directorio vivo: el estratega DIRIGE el calendario y el director creativo sigue dirigiendo carruseles y kits (por eso se quita el índice «una sola dirección activa»);
--      el director creativo entra al calendario como miembro (`calendario:miembro`) y los tres miembros de siempre suman `calendario`.
-- Nada corre: la palanca no se enciende aquí (ver 202610311610). Reversa: supabase/reversas/202610311600_oficina_mesa_de_creativos_calendario_REVERSA.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.cadena_mesas_calendario (
  id                        bigserial    PRIMARY KEY,
  campana_id                uuid         NOT NULL REFERENCES public.cadena_campanas(id),
  tanda                     integer      NOT NULL,
  version                   integer      NOT NULL,
  estado                    text         NOT NULL DEFAULT 'abierta',
  encargo_id                uuid,
  texto                     text,
  costo_usd                 numeric(10,4),
  motivo                    text,
  plazo_en                  timestamptz  NOT NULL,
  ideas_que_sacaron_filas   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  seco                      boolean      NOT NULL DEFAULT false,
  creada_en                 timestamptz  NOT NULL DEFAULT now(),
  terminada_en              timestamptz,
  CONSTRAINT cadena_mesas_calendario_estado_valido CHECK (estado IN ('abierta', 'lista', 'sin_mesa')),
  CONSTRAINT cadena_mesas_calendario_tanda_valida CHECK (tanda BETWEEN 1 AND 12 AND version >= 1),
  CONSTRAINT cadena_mesas_calendario_una_por_tanda UNIQUE (campana_id, tanda, version)
);
CREATE INDEX IF NOT EXISTS cadena_mesas_calendario_abiertas ON public.cadena_mesas_calendario (plazo_en) WHERE estado = 'abierta';
ALTER TABLE public.cadena_mesas_calendario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_mesas_calendario FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cadena_mesas_calendario TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_mesas_calendario_id_seq TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.cadena_mesas_calendario'::regclass AND polname = 'cadena_mesas_calendario_service') THEN
    CREATE POLICY cadena_mesas_calendario_service ON public.cadena_mesas_calendario FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- el directorio: una dirección POR TIPO de pieza (el código decide cuál dirige cuál: `direccionDe(directorio, tipo)`)
DROP INDEX IF EXISTS public.oficina_directorio_una_direccion;
INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en) VALUES
  ('social-media-strategist', 'direccion', 'dirección del calendario: da el marco de la tanda (huecos por semana, red, formato, pilar, sede y fechas), convoca al equipo creativo e integra una idea elegida por hueco',
    ARRAY['marco de la tanda y fases', 'ritmo y series entre semanas', 'decidir qué idea se usa y cuál se descarta', 'citar cada aporte usado o descartado'],
    ARRAY['plan y estrategia vigente', 'huecos de la tanda', 'aportes del equipo'], ARRAY['una idea elegida por hueco (tema, gancho, idea visual) con sus citas'], ARRAY['calendario'])
ON CONFLICT (agente) DO NOTHING;
UPDATE public.oficina_directorio SET pertinente_en = ARRAY['calendario:miembro'], actualizado_en = now() WHERE agente = 'creative-director-mesa' AND NOT ('calendario:miembro' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'calendario'), actualizado_en = now() WHERE agente IN ('content-creator', 'design-visual-storyteller', 'marketing_instagram_curator') AND NOT ('calendario' = ANY(pertinente_en));

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'calendario_mesa', 'calendario_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":1.5,"max_rondas":1,"mesa":true}$lim$::jsonb,
  1, 1.50, true
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE d int; m int; p int;
BEGIN
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE activo AND rol = 'direccion';
  SELECT count(*) INTO m FROM public.oficina_directorio WHERE activo AND 'calendario' = ANY(pertinente_en) AND rol = 'miembro';
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'calendario_mesa' AND tope_encargo_usd = 1.50 AND activo;
  IF d <> 2 THEN RAISE EXCEPTION 'se esperaban 2 direcciones activas (creative-director-mesa y social-media-strategist) y hay %', d; END IF;
  IF m <> 3 THEN RAISE EXCEPTION 'se esperaban 3 miembros del calendario y hay %', m; END IF;
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla calendario_mesa'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
