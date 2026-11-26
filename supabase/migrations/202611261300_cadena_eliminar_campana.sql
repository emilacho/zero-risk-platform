-- 26-nov · GO Lenovo 11:57Z (diseño de Emilio) · «Eliminar» una campaña desde el tablero, en dos clics · CC4
-- Borra la campaña y TODO lo que cuelga de ella en UNA transacción: si algo falla (una tabla nueva con llave a estas), no se borra nada.
-- NO toca: el plan de marketing (lo comparten otras campañas), las partes del cliente (`client_historical_outputs`), el cerebro, `agent_invocations`
-- ni los archivos del almacenamiento. Solo `service_role` la puede llamar.
BEGIN;

CREATE OR REPLACE FUNCTION public.cadena_eliminar_campana(p_campana uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_enc uuid[];
  v_hitl uuid[];
  v_n integer;
  v_r jsonb := '{}'::jsonb;
BEGIN
  PERFORM 1 FROM public.cadena_campanas WHERE id = p_campana FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_campana');
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_enc FROM public.oficina_encargos WHERE campana_id = p_campana;
  -- las tarjetas de la bandeja de la campaña: las de sus encargos (por su columna o por la metadata de la pieza) y las de su gran idea
  SELECT coalesce(array_agg(DISTINCT h), '{}') INTO v_hitl FROM (
    SELECT hitl_queue_id AS h FROM public.oficina_encargos WHERE id = ANY (v_enc) AND hitl_queue_id IS NOT NULL
    UNION SELECT id FROM public.hitl_queue WHERE metadata->>'oficina_encargo_id' = ANY (v_enc::text[])
    UNION SELECT q.id FROM public.hitl_queue q JOIN public.cadena_conceptos k ON k.hitl_id = q.id::text WHERE k.campana_id = p_campana
  ) x;

  -- la oficina: primero lo que cuelga de cada encargo (cada hijo antes que su padre), después los encargos
  DELETE FROM public.oficina_mesa_aportes WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_mesa_aportes', v_n);
  DELETE FROM public.oficina_artefactos WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_artefactos', v_n);
  DELETE FROM public.oficina_fichas WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_fichas', v_n);
  DELETE FROM public.oficina_gastos WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_gastos', v_n);
  DELETE FROM public.oficina_uso_de_fotos WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_uso_de_fotos', v_n);
  -- los turnos van DESPUÉS de artefactos, fichas y gastos: esas tres los apuntan (`turno_id`, sin cascada)
  DELETE FROM public.oficina_turnos WHERE encargo_id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_turnos', v_n);
  DELETE FROM public.oficina_encargos WHERE id = ANY (v_enc); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('oficina_encargos', v_n);
  DELETE FROM public.hitl_queue WHERE id = ANY (v_hitl); GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('hitl_queue', v_n);

  -- la cadena: todas las tablas con llave a la campaña
  DELETE FROM public.cadena_validaciones WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_validaciones', v_n);
  DELETE FROM public.cadena_correcciones WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_correcciones', v_n);
  DELETE FROM public.cadena_calendario_filas WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_calendario_filas', v_n);
  DELETE FROM public.cadena_esperas WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_esperas', v_n);
  DELETE FROM public.cadena_corridas WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_corridas', v_n);
  DELETE FROM public.cadena_conceptos WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_conceptos', v_n);
  DELETE FROM public.cadena_brief_creativo WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_brief_creativo', v_n);
  DELETE FROM public.cadena_estrategia_rondas WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_estrategia_rondas', v_n);
  DELETE FROM public.cadena_estrategias WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_estrategias', v_n);
  DELETE FROM public.cadena_fichas_de_oferta WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_fichas_de_oferta', v_n);
  DELETE FROM public.cadena_pedidos_de_campana WHERE campana_id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_pedidos_de_campana', v_n);
  DELETE FROM public.cadena_campanas WHERE id = p_campana; GET DIAGNOSTICS v_n = ROW_COUNT; v_r := v_r || jsonb_build_object('cadena_campanas', v_n);

  RETURN jsonb_build_object('ok', true, 'campana_id', p_campana, 'borradas', v_r);
END;
$$;

REVOKE ALL ON FUNCTION public.cadena_eliminar_campana(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cadena_eliminar_campana(uuid) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
