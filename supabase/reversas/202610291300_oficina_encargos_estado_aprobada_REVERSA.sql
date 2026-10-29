-- REVERSA de `oficina_encargos_estado_valido` + 'aprobada' · CC#2 · 2026-10-29 · deja la restricción IDÉNTICA a antes (5 estados).
-- 🔴 SE NIEGA A ROMPER DATOS: si algún encargo ya está 'aprobada', ABORTA y no toca nada. Primero devolverlos a 'cerrado'.
-- 🔴 NO va en `supabase/migrations/`. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_encargos WHERE estado = 'aprobada';
  IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % encargo(s) en estado aprobada. Devolverlos a cerrado antes.', n; END IF;
END
$guarda$;
ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_estado_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_estado_valido
  CHECK (estado IN ('abierto', 'en_paso', 'cerrado', 'cerrado_por_tope', 'fallido'));
COMMIT;
