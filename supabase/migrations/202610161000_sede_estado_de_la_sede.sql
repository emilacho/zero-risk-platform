-- ESTADO DE LA SEDE (por abrir / abierta) · CC-CEREBRO · 2026-10-16 (encargo «historial de Loyverse + mapa de ítems + Guayaquil» · firma de Emilio: «Guayaquil aún no abre al público»).
-- 🔴 SOLO AMPLÍA una lista cerrada (CHECK de `campo`): ninguna fila existente cambia. Idempotente (se quita y se vuelve a poner con el mismo nombre). Una sola transacción.
-- El portero lee `estado_de_la_sede` de la ficha de la sede: «por abrir» = no se vigila competencia ni posición por sede; al marcarla abierta (fila más nueva) entra sola.
-- REVERSA: `supabase/reversas/202610161000_sede_estado_de_la_sede_REVERSA.sql` (se niega si ya hay filas con el valor nuevo).
BEGIN;
ALTER TABLE public.client_sede_datos DROP CONSTRAINT IF EXISTS client_sede_datos_campo_check;
ALTER TABLE public.client_sede_datos ADD CONSTRAINT client_sede_datos_campo_check CHECK (campo IN ('direccion','horario','canal_pedido','tipo_de_atencion','estado_de_la_sede'));
COMMIT;
NOTIFY pgrst, 'reload schema';
