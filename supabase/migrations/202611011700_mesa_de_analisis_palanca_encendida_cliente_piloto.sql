-- 202611011700 · MESA DE ANÁLISIS · enciende la palanca SOLO para el cliente de práctica (corrida corta del plan · FIRMA de Emilio 01-nov punto 5).
-- SE APLICA ÚNICAMENTE CON EL «DALE» DE EMILIO (PRESUPUESTO-CC1-corrida-corta-del-plan.md §6). Hasta entonces vive en el repositorio, no en la base.
--
-- Qué hace: cadena_config.mesa_de_analisis pasa de {"encendida": false, "clientes": []} a {"encendida": true, "clientes": ["<cliente de práctica>"]}.
-- Guardas (se NIEGA, no pisa):
--   · la fila debe existir (la creó 202611011500);
--   · si ya está encendida para OTRO cliente (o para más de uno) no la toca: alguien la encendió a mano y eso se decide a mano;
--   · si ya está encendida exactamente para este cliente, no hace nada (idempotente);
--   · el cliente debe existir en public.clients con status 'onboarding' o 'active' (el piloto está en onboarding · prevuelo CC3 01-nov); paused/churned se niegan.
-- Reversa: 202611011700_..._REVERSA.sql (vuelve a apagada SOLO si el valor es exactamente el que deja esta migración).

DO $$
DECLARE
  v_cliente constant text := '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  v_actual jsonb;
  v_clientes jsonb;
BEGIN
  SELECT valor INTO v_actual FROM public.cadena_config WHERE clave = 'mesa_de_analisis';
  IF v_actual IS NULL THEN
    RAISE EXCEPTION 'mesa_de_analisis: no existe la palanca (aplica antes 202611011500) · no se enciende';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_cliente::uuid AND status IN ('onboarding', 'active')) THEN
    RAISE EXCEPTION 'mesa_de_analisis: el cliente de práctica % no existe o su status no es onboarding/active · no se enciende', v_cliente;
  END IF;
  v_clientes := COALESCE(v_actual -> 'clientes', '[]'::jsonb);
  IF v_actual ->> 'encendida' = 'true' AND v_clientes = to_jsonb(ARRAY[v_cliente]) THEN
    RAISE NOTICE 'mesa_de_analisis: ya estaba encendida solo para el cliente de práctica · nada que hacer';
    RETURN;
  END IF;
  IF v_actual ->> 'encendida' = 'true' OR jsonb_array_length(v_clientes) > 0 THEN
    RAISE EXCEPTION 'mesa_de_analisis: la palanca ya está encendida o tiene clientes (%) · se decide a mano, no se pisa', v_actual::text;
  END IF;
  UPDATE public.cadena_config
     SET valor = jsonb_build_object('encendida', true, 'clientes', to_jsonb(ARRAY[v_cliente]))
   WHERE clave = 'mesa_de_analisis';
  RAISE NOTICE 'mesa_de_analisis: ENCENDIDA solo para el cliente de práctica';
END $$;
