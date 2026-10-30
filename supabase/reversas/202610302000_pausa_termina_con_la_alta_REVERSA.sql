-- REVERSA de 202610302000_pausa_termina_con_la_alta.sql · quita la condición de fin (las pausas siguen; solo se levantan con /reanudar).
BEGIN;
ALTER TABLE public.cerebro_portero_pausas DROP CONSTRAINT IF EXISTS cerebro_portero_pausas_termina_con_chk;
ALTER TABLE public.cerebro_portero_pausas DROP COLUMN IF EXISTS termina_con;
COMMIT;
NOTIFY pgrst, 'reload schema';
