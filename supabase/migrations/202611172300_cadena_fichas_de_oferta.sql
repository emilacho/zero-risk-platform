-- CADENA · Sprint 4 · A entrega 2 · LAS FICHAS DE HECHOS POR OFERTA (las escribe el lector, una vez por campaña, antes del calendario) · CC3 · 17-nov
-- Una fila por campaña y versión (la primera que cierra gana · UNIQUE). Calcada de `cadena_estrategias`, con lo propio del lector:
--   contenido   = FichaDeOferta[] (ficha-de-oferta.ts) ya con los hechos del cerebro sumados (el cerebro manda)
--   pendientes  = lo que el lector no encontró en las fuentes (se dice, no se inventa)
--   descartados = cuántos datos vinieron sin fuente y NO entraron
-- La cadena lee la tabla aunque no exista (leer = «sin fichas»): esta migración puede aplicarse después de publicar el código.
-- Sin cambios a ninguna otra tabla. La `paso` de cadena_corridas es texto libre: 'fichas' no necesita permiso nuevo.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cadena_fichas_de_oferta (
  id                    bigserial   PRIMARY KEY,
  campana_id            uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  version               integer     NOT NULL,
  estado                text        NOT NULL DEFAULT 'validada',
  contenido             jsonb       NOT NULL,
  pendientes            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  descartados           integer     NOT NULL DEFAULT 0,
  agente                text,
  modelo                text,
  costo_usd             numeric(10,4),
  workflow_execution_id text,
  seco                  boolean     NOT NULL DEFAULT false,
  creada_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_fichas_de_oferta_estado_valido CHECK (estado IN ('validada')),
  CONSTRAINT cadena_fichas_de_oferta_contenido_lista CHECK (jsonb_typeof(contenido) = 'array'),
  CONSTRAINT cadena_fichas_de_oferta_pendientes_lista CHECK (jsonb_typeof(pendientes) = 'array'),
  CONSTRAINT cadena_fichas_de_oferta_descartados CHECK (descartados >= 0),
  CONSTRAINT cadena_fichas_de_oferta_version UNIQUE (campana_id, version)
);

-- permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza) · igual que las demás tablas de la cadena
ALTER TABLE public.cadena_fichas_de_oferta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_fichas_de_oferta FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadena_fichas_de_oferta TO service_role;
DO $fichas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.cadena_fichas_de_oferta'::regclass AND polname = 'cadena_fichas_de_oferta_service') THEN
    CREATE POLICY cadena_fichas_de_oferta_service ON public.cadena_fichas_de_oferta FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$fichas$;
REVOKE ALL ON SEQUENCE public.cadena_fichas_de_oferta_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_fichas_de_oferta_id_seq TO service_role;

COMMENT ON TABLE public.cadena_fichas_de_oferta IS 'CADENA · Sprint 4 · las fichas de hechos por oferta que escribió el lector (una vez por campaña). No es reja: sin fila, la hoja declara «sin fichas».';

COMMIT;
