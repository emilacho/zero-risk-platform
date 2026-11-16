-- REVERSA de 202611162330 · vuelve el CHECK de los pasos registrados al de 202610271900 (sin «dueno»).
-- Se niega si ya hay turnos «dueno» (borrarlos perdería la espera de un encargo): primero se cierran esos encargos.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_turnos WHERE tipo = 'dueno') THEN
    RAISE EXCEPTION '202611162330 REVERSA: hay turnos «dueno»; cerrar esos encargos antes';
  END IF;
END $$;

ALTER TABLE public.oficina_turnos DROP CONSTRAINT IF EXISTS oficina_turnos_tipo_valido;
ALTER TABLE public.oficina_turnos ADD CONSTRAINT oficina_turnos_tipo_valido CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material'));

COMMIT;
