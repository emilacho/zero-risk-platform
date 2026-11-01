-- REVERSA de 202611011700 · apaga la mesa de análisis que se encendió SOLO para el cliente de práctica.
-- Deja la palanca exactamente como la dejó 202611011500: {"encendida": false, "clientes": []}.
-- Se NIEGA si el valor vivo no es exactamente el que dejó la migración (alguien cambió la lista o la encendió para otro): eso se decide a mano.
-- Las corridas que ya pasaron NO se deshacen aquí (informes archivados, plan, revisión de la jefatura: ver PRESUPUESTO §6 «revertir lo que deja la corrida»).

DO $$
DECLARE
  v_cliente constant text := '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  v_actual jsonb;
BEGIN
  SELECT valor INTO v_actual FROM public.cadena_config WHERE clave = 'mesa_de_analisis';
  IF v_actual IS NULL THEN
    RAISE EXCEPTION 'mesa_de_analisis: no existe la palanca · nada que revertir';
  END IF;
  IF v_actual ->> 'encendida' = 'false' AND COALESCE(jsonb_array_length(v_actual -> 'clientes'), 0) = 0 THEN
    RAISE NOTICE 'mesa_de_analisis: ya estaba apagada · nada que hacer';
    RETURN;
  END IF;
  IF NOT (v_actual ->> 'encendida' = 'true' AND v_actual -> 'clientes' = to_jsonb(ARRAY[v_cliente])) THEN
    RAISE EXCEPTION 'mesa_de_analisis: el valor vivo (%) no es el que dejó 202611011700 · se decide a mano, no se pisa', v_actual::text;
  END IF;
  UPDATE public.cadena_config
     SET valor = '{"encendida": false, "clientes": []}'::jsonb
   WHERE clave = 'mesa_de_analisis';
  RAISE NOTICE 'mesa_de_analisis: APAGADA (reversa de 202611011700)';
END $$;
