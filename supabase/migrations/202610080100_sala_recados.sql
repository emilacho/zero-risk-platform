-- RECADOS DE LA SALA · PASO 1 · CC#1 · 2026-10-08 · PROPUESTA · NO APLICADA · pide la firma de Emilio (ver ORDENES-VIGENTES relevo 17 y raw/tasks/2026-10-08-DISENO-CC3-recados-de-la-sala.md §2.1 y §5).
-- 🔴 SOLO ADITIVA: 2 tablas NUEVAS (la de destinos, sembrada con su estado REAL del inventario; la de recados, VACÍA). No toca ni borra nada de lo que ya existe. Sin disparadores ni funciones.
-- 🔴 NADIE las usa todavía: solo la puerta `POST /api/sala/recados` (y su almacén) las nombran; una prueba permanente lo vigila. El reparto y la retoma son los pasos 3 y 4 del diseño.
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS, ON CONFLICT DO NOTHING y bloques DO para lo que no admite IF NOT EXISTS. `client_id` es TEXTO sin llave hacia tablas viejas (igual que las del cerebro). Una sola transacción.
-- 🔴 NO existe un destino de persona para Emilio: los recados van a herramientas y agentes. `dueno` nace APAGADO (activo = false).
-- ORDEN AL PUBLICAR: (1) respaldo confirmado y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) NOTIFY (ya incluido al final) → (5) la puerta ya publicada empieza a poder abrir recados (nadie la llama todavía).
-- REVERSA: `supabase/reversas/202610080100_sala_recados_REVERSA.sql` (se niega a borrar si hay recados o destinos añadidos).

BEGIN;

-- ───────────────────────── 1 · los destinos: quién puede conseguir qué (una fila nueva = un destino nuevo, sin programar)
CREATE TABLE IF NOT EXISTS public.sala_destinos_de_recado (
  destino           text        PRIMARY KEY,
  tipo              text        NOT NULL,
  flujo_que_reparte text,
  plazo_minutos     integer     NOT NULL,
  estado_del_brazo  text        NOT NULL,
  activo            boolean     NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sala_destinos_tipo_valido   CHECK (tipo IN ('herramienta','agente','persona')),
  CONSTRAINT sala_destinos_estado_valido CHECK (estado_del_brazo IN ('opera','por_configurar','no_existe')),
  CONSTRAINT sala_destinos_plazo_valido  CHECK (plazo_minutos > 0)
);

-- ───────────────────────── 2 · los recados: el número es el id; nunca dos abiertos iguales
CREATE TABLE IF NOT EXISTS public.sala_recados (
  id                   bigserial   PRIMARY KEY,
  client_id            text        NOT NULL,
  clave_de_agrupacion  text        NOT NULL,
  que_falta            text        NOT NULL,
  para_el_trabajo      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  bloquea              boolean     NOT NULL DEFAULT false,
  pedido_original      jsonb,
  destino              text        NOT NULL REFERENCES public.sala_destinos_de_recado(destino),
  razon_del_destino    text,
  estado               text        NOT NULL DEFAULT 'abierto',
  plazo_en             timestamptz,
  avisado_en           timestamptz,
  retomado_en          timestamptz,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  cerrado_en           timestamptz,
  ficha_ids            text[],
  motivo_de_cierre     text,
  prueba               boolean     NOT NULL DEFAULT false,
  CONSTRAINT sala_recados_estado_valido CHECK (estado IN ('abierto','repartido','cumplido','no_conseguido'))
);
-- 🔴 la garantía de «nunca dos abiertos iguales» la da la base, no el código: un cliente + una clave (+ prueba) a lo más UN recado abierto o repartido
CREATE UNIQUE INDEX IF NOT EXISTS sala_recados_un_abierto_por_clave ON public.sala_recados (client_id, clave_de_agrupacion, prueba) WHERE estado IN ('abierto','repartido');
CREATE INDEX IF NOT EXISTS sala_recados_por_cliente ON public.sala_recados (client_id, estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS sala_recados_por_vencer ON public.sala_recados (plazo_en) WHERE estado IN ('abierto','repartido');

-- ───────────────────────── 3 · los destinos de hoy, con su estado REAL (inventario de CC#3, 2026-10-08: raw/evidencia/2026-10-08-CC3-recados-inventario/INVENTARIO.md)
-- opera: apify (sitio, fotos, redes, Maps, anuncios), imagen (generación; dormida pero funciona), etiquetar (describe fotos; hoy a mano) · por configurar: video, audio, correo, dataforseo · no existe: loyverse
-- `dueno` (persona) nace APAGADO: se enciende solo si Emilio lo decide para datos no operativos. Plazos en MINUTOS.
INSERT INTO public.sala_destinos_de_recado (destino, tipo, flujo_que_reparte, plazo_minutos, estado_del_brazo, activo) VALUES
  ('apify',      'herramienta', NULL, 30, 'opera',          true),
  ('imagen',     'herramienta', NULL, 15, 'opera',          true),
  ('etiquetar',  'herramienta', NULL, 15, 'opera',          true),
  ('video',      'herramienta', NULL, 60, 'por_configurar', true),
  ('audio',      'herramienta', NULL, 60, 'por_configurar', true),
  ('correo',     'herramienta', NULL, 15, 'por_configurar', true),
  ('dataforseo', 'herramienta', NULL, 30, 'por_configurar', true),
  ('loyverse',   'herramienta', NULL, 15, 'no_existe',      true),
  ('dueno',      'persona',     NULL, 60, 'opera',          false)
ON CONFLICT (destino) DO NOTHING;

-- ───────────────────────── 4 · permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
ALTER TABLE public.sala_destinos_de_recado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sala_recados            ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sala_destinos_de_recado FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sala_recados            FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sala_destinos_de_recado TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sala_recados            TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sala_recados_id_seq TO service_role;
DO $recados$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.sala_destinos_de_recado'::regclass AND polname = 'sala_destinos_de_recado_service') THEN
    CREATE POLICY sala_destinos_de_recado_service ON public.sala_destinos_de_recado FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.sala_recados'::regclass AND polname = 'sala_recados_service') THEN
    CREATE POLICY sala_recados_service ON public.sala_recados FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$recados$;

COMMENT ON TABLE public.sala_destinos_de_recado IS 'SALA · a quién se le puede pedir un faltante (herramientas, agentes; `dueno` apagado). Una fila nueva = un destino nuevo. Solo la puerta /api/sala/recados la toca.';
COMMENT ON TABLE public.sala_recados IS 'SALA · recados con número: qué le falta a un trabajo, a quién se pidió, en cuánto vence y cómo terminó (cumplido / no_conseguido). Nunca dos abiertos iguales (índice único parcial). Solo la puerta /api/sala/recados la toca.';

COMMIT;

-- 🔴 una tabla nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
