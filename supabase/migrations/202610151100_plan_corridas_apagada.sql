-- PLAN v3 · V13 · `plan_corridas` · CC#2 · 2026-10-15 · PROPUESTA · NO APLICADA · se aplica con respaldo y SIN corridas en vuelo (quien tenga escritura; CC#3 mide)
-- Diseño: raw/tasks/2026-10-14-DISENO-CC1-plan-v3.md §17.1 (S2) + el menor de CC#3 (vence_en + barrido a `fallida`). Encargo: ENCARGO-LENOVO-CC2-plan-v3-V12-V13.
-- 🔴 UNA tabla NUEVA y nada más: el ESTADO de la corrida del plan (se crea en el primer pre-vuelo; `plan_datos` es de CC#1 y va aparte).
-- 🔴 UNA corrida activa por cliente: índice único parcial sobre (client_id) donde estado IN ('esperando','corriendo') (mismo molde que `finanzas_encargos`).
-- 🔴 `espera_desde` se escribe UNA vez (la ruta usa INSERT … ON CONFLICT DO NOTHING); `vence_en` es el plazo del estado vivo: lo vencido lo pasa a `vencida` (esperando) o `fallida` (corriendo) el barrido.
-- 🔴 `anon` y `authenticated`: SIN permiso ni política. `client_id` es TEXTO sin llave hacia tablas viejas. AGNÓSTICA: ningún rubro, ciudad ni cliente. IDEMPOTENTE.
-- REVERSA: `supabase/reversas/202610151100_plan_corridas_apagada_REVERSA.sql` (se niega a borrar si hay filas).
BEGIN;

CREATE TABLE IF NOT EXISTS public.plan_corridas (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      text          NOT NULL,
  corrida        text          NOT NULL CHECK (length(corrida) BETWEEN 1 AND 120),
  estado         text          NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'corriendo', 'hecha', 'vencida', 'fallida')),
  espera_desde   timestamptz   NOT NULL DEFAULT now(),
  vence_en       timestamptz   NOT NULL,
  intentos       integer       NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  motivo         text,
  dry_run        boolean       NOT NULL,
  creado_en      timestamptz   NOT NULL DEFAULT now(),
  actualizado_en timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (client_id, corrida)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_corridas_una_activa_por_cliente
  ON public.plan_corridas (client_id) WHERE estado IN ('esperando', 'corriendo');
CREATE INDEX IF NOT EXISTS plan_corridas_vence_en_vivas
  ON public.plan_corridas (vence_en) WHERE estado IN ('esperando', 'corriendo');

REVOKE ALL ON public.plan_corridas FROM anon, authenticated;
ALTER TABLE public.plan_corridas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_corridas TO service_role;

DO $plan_corridas_politicas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_corridas'::regclass AND polname = 'plan_corridas_service') THEN
    CREATE POLICY plan_corridas_service ON public.plan_corridas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$plan_corridas_politicas$;

COMMIT;

NOTIFY pgrst, 'reload schema';
