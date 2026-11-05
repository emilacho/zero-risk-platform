-- 05-nov · GO de Lenovo tras el doble chequeo (E4): cuántas veces el barrido extendió una corrida porque seguía viva en n8n. Aditiva: aplicar ANTES de publicar el código, que ya la lee.
ALTER TABLE public.plan_corridas ADD COLUMN IF NOT EXISTS prorrogas integer NOT NULL DEFAULT 0;
