-- 31-oct · PALANCA de la mesa de creativos del calendario · ENCENDIDA solo para Náufrago (orden de Lenovo 13:45Z, firma de Emilio «que se construya todo»); APAGADA para el resto hasta probar.
-- `cadena_config.mesa_de_creativos = { "clientes": [client_id…] }`: sin la clave, o sin el cliente en la lista, la cadena es la de siempre. Por la PAUSA DE PRUEBAS no corre nada hasta el «dale» de Emilio.
-- Reversa: supabase/reversas/202610311610_cadena_mesa_de_creativos_palanca_REVERSA.sql
INSERT INTO public.cadena_config (clave, valor) VALUES ('mesa_de_creativos', '{"clientes":["0a2ffbd4-957c-4315-a37f-b9e4fbbbb312"]}'::jsonb)
ON CONFLICT (clave) DO NOTHING;
