-- 10-nov · TOPE DEL ENCARGO HASTA US$ 20 · «dale» de Emilio («subela a 20»), GO de Lenovo ~09:00Z, ADENDA 2 (~09:03Z) · CC3
-- Solo cambia el MÁXIMO que la base acepta para `oficina_encargos.tope_usd`: de (0, 10] a (0, 20].
-- No toca ningún tope vivo: ninguna fila, ninguna plantilla ni ningún valor por omisión cambia. Poner la mesa en 20 (y volver a 5) lo hace CC2 aparte.
-- Repetible: quita la regla vieja si está y pone la nueva con el mismo nombre, en una sola transacción.
-- REVERSA: `supabase/reversas/202611100900_oficina_encargos_tope_20_REVERSA.sql`.

begin;
alter table public.oficina_encargos drop constraint if exists oficina_encargos_tope_valido;
alter table public.oficina_encargos add constraint oficina_encargos_tope_valido check (tope_usd > 0 and tope_usd <= 20);
commit;
