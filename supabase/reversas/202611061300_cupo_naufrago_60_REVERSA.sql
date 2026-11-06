-- REVERSA de 202611061300_cupo_naufrago_60.sql · vuelve el cupo de Náufrago a US$ 30 por 24 h (el valor de 202611051110). Solo esa clave.
update public.clients set config = jsonb_set(coalesce(config, '{}'::jsonb), '{spend_cap_usd}', '30'::jsonb)
  where id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
