-- PAUSA «HASTA QUE TERMINE LA ALTA» · CC-CEREBRO · 2026-10-30 (firma de Emilio: «debe funcionar estructuralmente así con el alta»).
-- Aditiva: una columna nullable. `termina_con = 'alta_terminada'` → la pausa la cierra sola el «listo» del despertar/completar de la alta. Sin valor = como siempre (solo se levanta con /reanudar).
BEGIN;
ALTER TABLE public.cerebro_portero_pausas ADD COLUMN IF NOT EXISTS termina_con text;
ALTER TABLE public.cerebro_portero_pausas DROP CONSTRAINT IF EXISTS cerebro_portero_pausas_termina_con_chk;
ALTER TABLE public.cerebro_portero_pausas ADD CONSTRAINT cerebro_portero_pausas_termina_con_chk CHECK (termina_con IS NULL OR termina_con = 'alta_terminada');
COMMENT ON COLUMN public.cerebro_portero_pausas.termina_con IS 'Condición de fin: alta_terminada = la cierra sola el listo/completar de la alta del cliente. Nulo = solo /reanudar.';
COMMIT;
NOTIFY pgrst, 'reload schema';
