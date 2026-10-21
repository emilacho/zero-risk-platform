-- EL SEGUNDO CEREBRO DEL PRODUCTOR · notas del dueño + auto-revisiones · CC#1 · 2026-10-21 (firma de Emilio 12:57 sobre DISENO-CC1-retroalimentacion-del-dueno).
-- Dos tablas NUEVAS y aditivas (no tocan hitl_queue ni nada existente):
--   · notas_del_dueno: cada decisión (aprobar/rechazar) y cada comentario de Emilio sobre una pieza, como NOTA por cliente (o general). APPEND-ONLY: no se edita ni se borra.
--     No es una regla ni una orden: es lo que él dijo, con la pieza y la versión de evidencia.
--   · autorevisiones_del_productor: cada paso de auto-revisión del agente productor contra sus notas (qué notas vio, si algo chocó, qué cambió, cuánto costó). Alimenta el registro visible.
-- Las escribe y las lee solo el servidor (service_role). La jefatura y la segunda mirada GPT NUNCA leen estas tablas.
-- 🔴 Tabla nueva = GRANT + RLS en la misma migración (sin permisos PostgREST no la ve). Detrás de NOTAS_DEL_DUENO (apagado por omisión): sin el interruptor no se escribe ni se lee.
-- REVERSA: supabase/reversas/202610211500_notas_del_dueno_REVERSA.sql (se niega si ya hay filas).
BEGIN;
CREATE TABLE IF NOT EXISTS public.notas_del_dueno (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  alcance       text NOT NULL DEFAULT 'cliente' CHECK (alcance IN ('cliente','general')),
  tipo          text NOT NULL CHECK (tipo IN ('aprobada','rechazada','editada','comentario')),
  comentario    text CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 2000),
  hitl_id       uuid,
  output_id     uuid,
  pieza_titulo  text,
  pieza_version text,
  pieza_familia text,
  origen        text NOT NULL CHECK (origen IN ('slack','tablero','manual')),
  autor         text NOT NULL,
  clave_unica   text NOT NULL,
  creada_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notas_del_dueno_clave_unica UNIQUE (clave_unica),
  CONSTRAINT notas_del_dueno_comentario_si_comenta CHECK (tipo <> 'comentario' OR comentario IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS notas_del_dueno_por_cliente ON public.notas_del_dueno (client_id, creada_en DESC);
CREATE INDEX IF NOT EXISTS notas_del_dueno_por_pieza ON public.notas_del_dueno (hitl_id) WHERE hitl_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.autorevisiones_del_productor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  encargo_id    uuid,
  agente        text NOT NULL,
  notas_vistas  jsonb NOT NULL DEFAULT '[]'::jsonb,
  choco         boolean NOT NULL,
  cambios       jsonb NOT NULL DEFAULT '[]'::jsonb,
  costo_usd     numeric(10,6) NOT NULL DEFAULT 0,
  clave_unica   text NOT NULL,
  creada_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT autorevisiones_clave_unica UNIQUE (clave_unica)
);
CREATE INDEX IF NOT EXISTS autorevisiones_por_cliente ON public.autorevisiones_del_productor (client_id, creada_en DESC);

ALTER TABLE public.notas_del_dueno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autorevisiones_del_productor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notas_del_dueno_service ON public.notas_del_dueno;
CREATE POLICY notas_del_dueno_service ON public.notas_del_dueno FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS autorevisiones_service ON public.autorevisiones_del_productor;
CREATE POLICY autorevisiones_service ON public.autorevisiones_del_productor FOR ALL TO service_role USING (true) WITH CHECK (true);
-- append-only: el servidor inserta y lee; no actualiza ni borra
GRANT SELECT, INSERT ON public.notas_del_dueno TO service_role;
GRANT SELECT, INSERT ON public.autorevisiones_del_productor TO service_role;

COMMENT ON TABLE public.notas_del_dueno IS 'Notas del dueño: cada decisión y comentario de Emilio sobre una pieza, por cliente. Append-only. NO son reglas: las lee solo el agente productor en su auto-revisión; la jefatura y la segunda mirada GPT no las ven.';
COMMENT ON TABLE public.autorevisiones_del_productor IS 'Cada auto-revisión del agente productor contra las notas del dueño: notas vistas, si algo chocó, qué cambió y cuánto costó.';
COMMIT;
NOTIFY pgrst, 'reload schema';
