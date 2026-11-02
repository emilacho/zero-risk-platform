-- 02-nov · SEÑAL Lenovo 17:01Z · CC1 · qué dejó un pedido de cambios al manual. Si no cambió nada no se guarda versión, y lo que declaró el equipo solo puede quedar aquí.
-- Forma: { sin_cambios: boolean, protegidos: string[], tocados_validados: string[], declarado: string[] }. Nulo en los pedidos viejos.
BEGIN;
ALTER TABLE public.plan_cambios ADD COLUMN IF NOT EXISTS resultado jsonb;
COMMIT;
NOTIFY pgrst, 'reload schema';
