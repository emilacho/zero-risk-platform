-- 06-nov · DALE de Emilio 09:29 local («sí a todo» · «súbele 30») vía Lenovo · CC1
-- El cupo de gasto de Náufrago sube de US$ 30 a US$ 60 por cada 24 h (`clients.config.spend_cap_usd`). Solo esa clave de ese cliente; el resto de la ficha no cambia.
-- Se aplica con respaldo de la ficha, lectura de vuelta, n8n en 0/0 y ninguna corrida viva. CC7 certifica antes de aplicar.
-- REVERSA: `supabase/reversas/202611061300_cupo_naufrago_60_REVERSA.sql` (vuelve a US$ 30).
update public.clients set config = jsonb_set(coalesce(config, '{}'::jsonb), '{spend_cap_usd}', '60'::jsonb)
  where id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
