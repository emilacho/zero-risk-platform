-- OFICINA FINANCIERA · F8 «la oficina conversa» · CC#1 · 2026-10-14 · PROPUESTA · NO APLICADA · se aplica solo tras SÍ de CC#3, con respaldo y CERO corridas en vuelo
-- Diseño: raw/tasks/2026-10-14-DISENO-CC1-oficina-financiera-v2.md (rev. 9) §6b · Orden: raw/tasks/2026-10-14-ENCARGO-LENOVO-CC1-construir-F8.md
-- 🔴 3 tablas NUEVAS y nada más (`finanzas_encargos`, `finanzas_turnos`, `finanzas_artefactos`): almacén PROPIO de la conversación financiera; no toca la oficina de creativos ni sus tablas, ni ninguna tabla existente.
-- 🔴 DEPENDE de 202610141800 (F1): referencia a `finanzas_tableros` y al interruptor `finanzas_config.conversa`, que nace 'apagado'. Con él apagado la ruta devuelve 409 antes de leer o escribir.
-- 🔴 IDENTIFICADORES uuid (gen_random_uuid): ninguna secuencia. `anon` y `authenticated`: SIN permiso ni política. `client_id` es TEXTO sin llave hacia tablas viejas.
-- 🔴 AGNÓSTICA: ningún rubro, ciudad, cliente ni producto en columnas ni en datos.
-- 🔴 IDEMPOTENTE: IF NOT EXISTS y bloques DO. Una sola conversación ABIERTA por cliente (índice único parcial).
-- REVERSA: `supabase/reversas/202610141900_finanzas_conversa_apagada_REVERSA.sql` (se niega a borrar si hay encargos).

BEGIN;

CREATE TABLE IF NOT EXISTS public.finanzas_encargos (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        text         NOT NULL,
  estado           text         NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_curso', 'cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido')),
  -- el estado puro del motor de la oficina (pasos hechos, artefactos con versión, gasto)
  estado_del_motor jsonb        NOT NULL DEFAULT '{}'::jsonb,
  gasto_usd        numeric(10,4) NOT NULL DEFAULT 0 CHECK (gasto_usd >= 0),
  slack_canal      text,
  slack_ts         text,
  -- marca de agua de la lectura del hilo (ts de Slack): solo se lee lo posterior
  leido_hasta      text,
  tablero_id       uuid         REFERENCES public.finanzas_tableros (id) ON DELETE SET NULL,
  dry_run          boolean      NOT NULL,
  semilla          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  creado_en        timestamptz  NOT NULL DEFAULT now(),
  actualizado_en   timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finanzas_encargos_uno_abierto_por_cliente
  ON public.finanzas_encargos (client_id) WHERE estado IN ('abierto', 'en_curso');

CREATE TABLE IF NOT EXISTS public.finanzas_turnos (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  encargo_id  uuid         NOT NULL REFERENCES public.finanzas_encargos (id) ON DELETE CASCADE,
  n           integer      NOT NULL CHECK (n > 0),
  paso        text         NOT NULL,
  agente      text,
  ronda       integer      NOT NULL DEFAULT 1 CHECK (ronda IN (1, 2)),
  estado      text         NOT NULL CHECK (estado IN ('hecho', 'fallo')),
  costo_usd   numeric(10,4) NOT NULL DEFAULT 0 CHECK (costo_usd >= 0),
  salida      jsonb,
  error       text,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (encargo_id, n)
);

CREATE TABLE IF NOT EXISTS public.finanzas_artefactos (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  encargo_id  uuid         NOT NULL REFERENCES public.finanzas_encargos (id) ON DELETE CASCADE,
  tipo        text         NOT NULL,
  version     integer      NOT NULL DEFAULT 1 CHECK (version > 0),
  contenido   jsonb        NOT NULL,
  sha256      text         NOT NULL,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (encargo_id, tipo, version)
);

REVOKE ALL ON public.finanzas_encargos, public.finanzas_turnos, public.finanzas_artefactos FROM anon, authenticated;
ALTER TABLE public.finanzas_encargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzas_artefactos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_encargos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_turnos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finanzas_artefactos TO service_role;

DO $finanzas_conversa_politicas$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finanzas_encargos', 'finanzas_turnos', 'finanzas_artefactos']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$finanzas_conversa_politicas$;

COMMIT;

NOTIFY pgrst, 'reload schema';
