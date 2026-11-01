-- 01-nov · DESPUÉS DE T9 · LOS 6 EQUIPOS DEL DEPARTAMENTO DE MARKETING EN EL DIRECTORIO DE LA OFICINA · CC#1 · US$ 0.
--   Fuente: SEÑAL T9 (Lenovo → CC1: «reflejar los 6 EQUIPOS en oficina_directorio») + MAPA 01-nov «ESTRUCTURA FINAL: 6 EQUIPOS» (firma de Emilio 01-nov 00:11Z):
--   Dirección · Estrategia (incluye la mesa de análisis) · Creativo (gran idea + piezas y video) ACTIVOS · Web y búsqueda · Medios y Performance · Relaciones en 2.ª etapa.
--   Las mesas (brief, concepto, piezas, video) son SESIONES, no equipos: el equipo es una AGRUPACIÓN (a qué equipo pertenece cada tarjeta); NO cambia quién se sienta en qué mesa
--   (`pertinente_en`, `rol` e `indicacion` quedan como están). Nada se enciende.
--   · `oficina_equipos`: los 6 equipos como DATO (clave estable que ya usa el tablero · nombre de agencia real · etapa · bloqueo · orden).
--   · `oficina_directorio.equipo`: el equipo de cada tarjeta. NULL = proveedor fuera del departamento (el portero es del cerebro).
--   Aditiva e idempotente. `oficina_*` es de CC2: migración aditiva avisada en el papel. ORDEN: después de 202611011310 (directorio con 14 filas).
--   Reversa: supabase/reversas/202611011400_oficina_equipos_6_equipos_en_directorio_REVERSA.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.oficina_equipos (
  clave          text PRIMARY KEY CHECK (clave IN ('direccion', 'estrategia', 'creativo', 'web', 'medios', 'relaciones')),
  nombre         text NOT NULL,
  sistema        text NOT NULL,
  descripcion    text NOT NULL,
  etapa          text NOT NULL CHECK (etapa IN ('activo', 'segunda_etapa')),
  bloqueo        text,
  orden          smallint NOT NULL UNIQUE,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.oficina_equipos IS 'Los 6 equipos del departamento de marketing (MAPA 01-nov · firma 01-nov 00:11Z). Las mesas son sesiones dentro de un equipo, no equipos.';

INSERT INTO public.oficina_equipos (clave, nombre, sistema, descripcion, etapa, bloqueo, orden) VALUES
  ('direccion',  'Dirección',            'jefatura de marketing',                        'Dirige el departamento: revisa, corrige y juzga lo que sale de los equipos; aprueba, devuelve y marca promesas', 'activo', NULL, 1),
  ('estrategia', 'Estrategia',           'mesa de análisis · plan · brief · calendario', 'Investiga antes del plan (mesa de análisis) y escribe el plan de 90 días, el brief de campaña y el calendario', 'activo', NULL, 2),
  ('creativo',   'Creativo',             'mesa de creativos · mesa de piezas y video',   'La gran idea de la campaña y cada pieza del calendario: texto, láminas, imágenes y video', 'activo', NULL, 3),
  ('web',        'Web y búsqueda',       'landings · CRO · SEO · GEO/AEO',               'Que la web del cliente convierta y que lo encuentren en buscadores y en las respuestas de las IA', 'segunda_etapa', 'se activa con firma; los revisores de landing trabajan ya cuando hay landing', 4),
  ('medios',     'Medios y Performance', 'pauta · email · medición y optimización',      'Anuncios pagados, correos a la base propia y la medición de lo publicado', 'segunda_etapa', 'espera las métricas de Meta', 5),
  ('relaciones', 'Relaciones',           'comunidad · reputación · PR · influencers',    'La conversación con la gente: reseñas, comunidad, prensa ganada y creadores', 'segunda_etapa', 'se activa con firma', 6)
ON CONFLICT (clave) DO NOTHING;

-- permisos y seguridad por fila (CREATE TABLE no alcanza: sin esto PostgREST no la ve) · mismo patrón que 202610312001
ALTER TABLE public.oficina_equipos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oficina_equipos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_equipos TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'oficina_equipos' AND policyname = 'oficina_equipos_service') THEN
    CREATE POLICY oficina_equipos_service ON public.oficina_equipos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.oficina_directorio ADD COLUMN IF NOT EXISTS equipo text REFERENCES public.oficina_equipos(clave);
COMMENT ON COLUMN public.oficina_directorio.equipo IS 'Equipo del departamento al que pertenece la tarjeta (oficina_equipos.clave). NULL = proveedor fuera del departamento (el portero es del cerebro).';

-- a qué equipo pertenece cada tarjeta de hoy (14 filas tras T9). Solo se llena lo vacío: una asignación posterior a mano no se pisa.
UPDATE public.oficina_directorio SET equipo = 'estrategia', actualizado_en = now()
  WHERE agente = 'campaign-brief-agent' AND equipo IS NULL;
UPDATE public.oficina_directorio SET equipo = 'creativo', actualizado_en = now()
  WHERE agente IN (
    'creative-director-mesa', 'content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'video-editor', 'whimsy-injector', 'tiktok-strategist',
    'carousel-designer', 'design-image-prompt-engineer', 'inclusive-visuals-specialist', 'marketing_short_video_editing_coach', 'marketing_video_optimization_specialist'
  ) AND equipo IS NULL;
-- el portero (rol 'portero') es del cerebro: proveedor fuera del departamento, queda sin equipo a propósito.

DO $$
DECLARE e int; sin_equipo int; sin_equipo_no_portero int; estr int; crea int;
BEGIN
  SELECT count(*) INTO e FROM public.oficina_equipos;
  IF e <> 6 THEN RAISE EXCEPTION 'debían existir 6 equipos (hay %)', e; END IF;
  SELECT count(*) INTO sin_equipo_no_portero FROM public.oficina_directorio WHERE equipo IS NULL AND rol <> 'portero';
  IF sin_equipo_no_portero <> 0 THEN RAISE EXCEPTION 'hay % tarjetas del departamento sin equipo (solo el portero puede quedar sin equipo)', sin_equipo_no_portero; END IF;
  SELECT count(*) INTO sin_equipo FROM public.oficina_directorio WHERE equipo IS NULL;
  IF sin_equipo <> 1 THEN RAISE EXCEPTION 'solo el portero debía quedar sin equipo (sin equipo: %)', sin_equipo; END IF;
  SELECT count(*) INTO estr FROM public.oficina_directorio WHERE equipo = 'estrategia';
  SELECT count(*) INTO crea FROM public.oficina_directorio WHERE equipo = 'creativo';
  IF estr <> 1 OR crea <> 12 THEN RAISE EXCEPTION 'reparto inesperado: estrategia % (esperado 1) · creativo % (esperado 12)', estr, crea; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
