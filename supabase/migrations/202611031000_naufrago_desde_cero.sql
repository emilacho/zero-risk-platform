-- 03-nov · NÁUFRAGO DESDE CERO · decisión de Emilio traída por Lenovo · CC#1 · US$ 0.
--   Se borra lo producido para trabajar al cliente. Se quedan el cerebro con todo lo que recolectó (raspados, fotos, videos, páginas y sedes), la landing, la ficha limpia por campos, el tope de gasto y los importes.
--   Los conteos se escriben al generar este archivo: se regenera justo antes de aplicar. Si uno no calza, nada se aplica.
--   Respaldo previo fuera del sistema: raw/estado/respaldo-naufrago-2026-11-03/. IRREVERSIBLE salvo reimportar ese respaldo.
--   Falta: los 90 trozos copiados del cerebro, que decide Cerebro. La industria queda vacía para que la descubra el alta (trato de Emilio, 03-nov). eventos_de_emilio no entra: la tabla no deja borrar ni cambiar sus filas.
BEGIN;

CREATE TEMP TABLE _antes ON COMMIT DROP AS SELECT (SELECT coalesce(sum(cost_usd), 0) FROM public.agent_invocations WHERE client_id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') AS libro, (SELECT count(*) FROM public.agent_invocations WHERE client_id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') AS filas_libro, (SELECT count(*) FROM public.cerebro_fichas WHERE client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') AS fichas, (SELECT count(*) FROM public.client_brain_chunks WHERE client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') AS trozos;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.cadena_validaciones x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 174 THEN RAISE EXCEPTION 'cadena_validaciones: esperaba 174 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_esperas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 41 THEN RAISE EXCEPTION 'cadena_esperas: esperaba 41 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_corridas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 3 THEN RAISE EXCEPTION 'cadena_corridas: esperaba 3 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_estrategias x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 1 THEN RAISE EXCEPTION 'cadena_estrategias: esperaba 1 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_calendario_filas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 136 THEN RAISE EXCEPTION 'cadena_calendario_filas: esperaba 136 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_campanas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 1 THEN RAISE EXCEPTION 'cadena_campanas: esperaba 1 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_aprobaciones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 2 THEN RAISE EXCEPTION 'plan_aprobaciones: esperaba 2 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_corridas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 2 THEN RAISE EXCEPTION 'plan_corridas: esperaba 2 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_cambios x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.plan_nuevo_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.manual_id::text IN (SELECT m.id::text FROM public.client_brand_books m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 3 THEN RAISE EXCEPTION 'plan_cambios: esperaba 3 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.hitl_queue x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.output_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 9 THEN RAISE EXCEPTION 'hitl_queue: esperaba 9 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_fichas x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 35 THEN RAISE EXCEPTION 'jefatura_fichas: esperaba 35 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_pasos x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 16 THEN RAISE EXCEPTION 'jefatura_pasos: esperaba 16 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_revisiones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 4 THEN RAISE EXCEPTION 'jefatura_revisiones: esperaba 4 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_uso_de_fotos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 2 THEN RAISE EXCEPTION 'oficina_uso_de_fotos: esperaba 2 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_gastos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 63 THEN RAISE EXCEPTION 'oficina_gastos: esperaba 63 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_fichas x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 7 THEN RAISE EXCEPTION 'oficina_fichas: esperaba 7 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 14 THEN RAISE EXCEPTION 'oficina_artefactos: esperaba 14 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 16 THEN RAISE EXCEPTION 'oficina_turnos: esperaba 16 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 21 THEN RAISE EXCEPTION 'oficina_encargos: esperaba 21 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 9 THEN RAISE EXCEPTION 'finanzas_artefactos: esperaba 9 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 9 THEN RAISE EXCEPTION 'finanzas_turnos: esperaba 9 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 1 THEN RAISE EXCEPTION 'finanzas_encargos: esperaba 1 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_tableros x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 1 THEN RAISE EXCEPTION 'finanzas_tableros: esperaba 1 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.workflow_checkpoints x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 51 THEN RAISE EXCEPTION 'workflow_checkpoints: esperaba 51 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.sala_event_log x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 29 THEN RAISE EXCEPTION 'sala_event_log: esperaba 29 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.client_journey_state x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 1 THEN RAISE EXCEPTION 'client_journey_state: esperaba 1 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.client_historical_outputs x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 10 THEN RAISE EXCEPTION 'client_historical_outputs: esperaba 10 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.client_brand_books x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 2 THEN RAISE EXCEPTION 'client_brand_books: esperaba 2 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.client_icp_documents x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 5 THEN RAISE EXCEPTION 'client_icp_documents: esperaba 5 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.client_competitive_landscape x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 17 THEN RAISE EXCEPTION 'client_competitive_landscape: esperaba 17 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agent_invocation_textos x WHERE x.invocation_id::text IN (SELECT m.id::text FROM public.agent_invocations m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 24 THEN RAISE EXCEPTION 'agent_invocation_textos: esperaba 24 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agents_log x WHERE (x::text ~* 'n[aá]ufrago' OR x::text ILIKE '%0a2ffbd4-957c-4315-a37f-b9e4fbbbb312%');
  IF n <> 151 THEN RAISE EXCEPTION 'agents_log: esperaba 151 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agent_invocations x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 459 THEN RAISE EXCEPTION 'agent_invocations: esperaba 459 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agent_dispatches x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 27 THEN RAISE EXCEPTION 'agent_dispatches: esperaba 27 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agent_dispatch_reconciliations x WHERE x.cliente IN ('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 'naufrago', 'naufrago-ec');
  IF n <> 3 THEN RAISE EXCEPTION 'agent_dispatch_reconciliations: esperaba 3 filas y hay %', n; END IF;
END $$;

DELETE FROM public.cadena_validaciones x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.cadena_esperas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.cadena_corridas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.cadena_estrategias x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.cadena_calendario_filas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.cadena_campanas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.plan_aprobaciones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.plan_corridas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.plan_cambios x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.plan_nuevo_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.manual_id::text IN (SELECT m.id::text FROM public.client_brand_books m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.hitl_queue x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.output_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.jefatura_fichas x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.jefatura_pasos x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.jefatura_revisiones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.oficina_uso_de_fotos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.oficina_gastos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.oficina_fichas x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.oficina_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.oficina_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.oficina_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.finanzas_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.finanzas_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.finanzas_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.finanzas_tableros x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.workflow_checkpoints x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.sala_event_log x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.client_journey_state x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.client_historical_outputs x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.client_brand_books x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.client_icp_documents x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.client_competitive_landscape x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
DELETE FROM public.agent_invocation_textos x WHERE x.invocation_id::text IN (SELECT m.id::text FROM public.agent_invocations m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
DELETE FROM public.agents_log x WHERE (x::text ~* 'n[aá]ufrago' OR x::text ILIKE '%0a2ffbd4-957c-4315-a37f-b9e4fbbbb312%');

UPDATE public.agent_invocations x
SET session_id = 'vaciada', command = NULL, task_id = NULL, journey_id = NULL, error_message = NULL, metadata = NULL, system_prompt = NULL, input_summary = NULL, output_summary = NULL
WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
UPDATE public.agent_dispatches x SET metadata = '{}'::jsonb WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
UPDATE public.agent_dispatch_reconciliations x SET que = 'Trabajo de un cliente reiniciado', evidencia = '{}'::jsonb WHERE x.cliente IN ('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 'naufrago', 'naufrago-ec');

UPDATE public.clients
SET industry = NULL, market = NULL, brand_colors = NULL, brand_fonts = NULL, config = config - 'business_model' - 'moneda'
WHERE id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';

DO $$
DECLARE n int; a record;
BEGIN
  SELECT count(*) INTO n FROM public.cadena_validaciones x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_validaciones: %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_esperas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_esperas: %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_corridas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_corridas: %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_estrategias x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_estrategias: %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_calendario_filas x WHERE x.campana_id::text IN (SELECT m.id::text FROM public.cadena_campanas m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_calendario_filas: %', n; END IF;
  SELECT count(*) INTO n FROM public.cadena_campanas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en cadena_campanas: %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_aprobaciones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en plan_aprobaciones: %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_corridas x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en plan_corridas: %', n; END IF;
  SELECT count(*) INTO n FROM public.plan_cambios x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.plan_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.plan_nuevo_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') OR x.manual_id::text IN (SELECT m.id::text FROM public.client_brand_books m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en plan_cambios: %', n; END IF;
  SELECT count(*) INTO n FROM public.hitl_queue x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.output_id::text IN (SELECT m.id::text FROM public.client_historical_outputs m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en hitl_queue: %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_fichas x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en jefatura_fichas: %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_pasos x WHERE x.revision_id::text IN (SELECT m.id::text FROM public.jefatura_revisiones m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en jefatura_pasos: %', n; END IF;
  SELECT count(*) INTO n FROM public.jefatura_revisiones x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en jefatura_revisiones: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_uso_de_fotos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' OR x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_uso_de_fotos: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_gastos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_gastos: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_fichas x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_fichas: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_artefactos: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.oficina_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_turnos: %', n; END IF;
  SELECT count(*) INTO n FROM public.oficina_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en oficina_encargos: %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_artefactos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en finanzas_artefactos: %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_turnos x WHERE x.encargo_id::text IN (SELECT m.id::text FROM public.finanzas_encargos m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en finanzas_turnos: %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_encargos x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en finanzas_encargos: %', n; END IF;
  SELECT count(*) INTO n FROM public.finanzas_tableros x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en finanzas_tableros: %', n; END IF;
  SELECT count(*) INTO n FROM public.workflow_checkpoints x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en workflow_checkpoints: %', n; END IF;
  SELECT count(*) INTO n FROM public.sala_event_log x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en sala_event_log: %', n; END IF;
  SELECT count(*) INTO n FROM public.client_journey_state x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en client_journey_state: %', n; END IF;
  SELECT count(*) INTO n FROM public.client_historical_outputs x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en client_historical_outputs: %', n; END IF;
  SELECT count(*) INTO n FROM public.client_brand_books x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en client_brand_books: %', n; END IF;
  SELECT count(*) INTO n FROM public.client_icp_documents x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en client_icp_documents: %', n; END IF;
  SELECT count(*) INTO n FROM public.client_competitive_landscape x WHERE x.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en client_competitive_landscape: %', n; END IF;
  SELECT count(*) INTO n FROM public.agent_invocation_textos x WHERE x.invocation_id::text IN (SELECT m.id::text FROM public.agent_invocations m WHERE m.client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en agent_invocation_textos: %', n; END IF;
  SELECT count(*) INTO n FROM public.agents_log x WHERE (x::text ~* 'n[aá]ufrago' OR x::text ILIKE '%0a2ffbd4-957c-4315-a37f-b9e4fbbbb312%');
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron filas en agents_log: %', n; END IF;
  SELECT * INTO a FROM _antes;
  SELECT count(*) INTO n FROM public.agent_invocations WHERE client_id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' AND cost_usd IS NOT NULL;
  IF n <> a.filas_libro THEN RAISE EXCEPTION 'el libro perdió filas'; END IF;
  IF (SELECT coalesce(sum(cost_usd), 0) FROM public.agent_invocations WHERE client_id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') <> a.libro THEN RAISE EXCEPTION 'el libro cambió de importe'; END IF;
  IF (SELECT count(*) FROM public.cerebro_fichas WHERE client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') <> a.fichas THEN RAISE EXCEPTION 'cambiaron las fichas del cerebro'; END IF;
  IF (SELECT count(*) FROM public.client_brain_chunks WHERE client_id::text = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312') <> a.trozos THEN RAISE EXCEPTION 'cambiaron los trozos del cerebro'; END IF;
  SELECT count(*) INTO n FROM public.clients WHERE id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' AND config ? 'apify' AND config ? 'spend_cap_usd';
  IF n <> 1 THEN RAISE EXCEPTION 'la ficha perdió las cuentas o el tope'; END IF;
END $$;

COMMIT;
