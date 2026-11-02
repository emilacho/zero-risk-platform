-- 02-nov · BORRAR PENICHE, OPCIÓN A · firma de Emilio traída por Lenovo · CC#1 · US$ 0.
--   Se borra todo menos los importes con su fecha. Se respeta la firma del 02-sep: `brain_embed_costs` NO se toca (solo tiene importes y conteos, sin texto del negocio) y por eso la ficha sobrevive, sin datos.
--   En el libro quedan importes, tokens, modelo, empleado y fechas; se vacían los textos. Sus montos siguen sumando en Dinero.
--   Respaldo previo fuera del sistema: raw/estado/respaldo-peniche-2026-11-02/. IRREVERSIBLE salvo reimportar ese respaldo: no hay reversa en SQL.
--   Cada conteo se comprueba antes de escribir, y si algo no calza, nada se aplica.
BEGIN;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agent_invocations x WHERE x.client_id IN ('e388a370-910f-4ee7-9a48-4a79393b8cb4', '53b05ecb-670a-4411-8a94-427e8dea6d2b') OR (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 87 THEN RAISE EXCEPTION 'agent_invocations: esperaba 87 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.agents_log x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 98 THEN RAISE EXCEPTION 'agents_log: esperaba 98 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.costs x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 6 THEN RAISE EXCEPTION 'costs: esperaba 6 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.cowork_messages x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 4 THEN RAISE EXCEPTION 'cowork_messages: esperaba 4 filas y hay %', n; END IF;
  SELECT count(*) INTO n FROM public.ingress_quarantine x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 1 THEN RAISE EXCEPTION 'ingress_quarantine: esperaba 1 fila y hay %', n; END IF;
END $$;

UPDATE public.agent_invocations x
SET command = NULL, task_id = NULL, journey_id = NULL, error_message = NULL, metadata = NULL, system_prompt = NULL, input_summary = NULL, output_summary = NULL
WHERE x.client_id IN ('e388a370-910f-4ee7-9a48-4a79393b8cb4', '53b05ecb-670a-4411-8a94-427e8dea6d2b') OR (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');

UPDATE public.costs x SET description = 'Trabajo de un cliente archivado' WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');

DELETE FROM public.agents_log x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
DELETE FROM public.cowork_messages x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
DELETE FROM public.ingress_quarantine x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');

UPDATE public.clients
SET name = 'ARCHIVADA 2026-11-02 · ficha sin datos (e388a370)', slug = 'archivada-e388a370', website_url = NULL, industry = NULL, market = NULL, domain = NULL, country = NULL, language = NULL,
    brand_voice = NULL, config = '{}'::jsonb, logo_url = NULL, brand_colors = NULL, brand_fonts = NULL, report_url = NULL,
    archived_reason = 'Datos borrados por decisión del dueño el 2026-11-02. Solo quedan importes con su fecha.'
WHERE id = 'e388a370-910f-4ee7-9a48-4a79393b8cb4' AND status = 'churned';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agent_invocations x WHERE x::text ILIKE '%peniche%';
  IF n <> 0 THEN RAISE EXCEPTION 'quedó texto en agent_invocations: %', n; END IF;
  SELECT count(*) INTO n FROM public.clients x WHERE x::text ILIKE '%peniche%';
  IF n <> 0 THEN RAISE EXCEPTION 'quedó texto en clients: %', n; END IF;
  SELECT count(*) INTO n FROM public.costs x WHERE (x::text ILIKE '%peniche%' OR x::text ILIKE '%e388a370-910f-4ee7-9a48-4a79393b8cb4%' OR x::text ILIKE '%53b05ecb-670a-4411-8a94-427e8dea6d2b%');
  IF n <> 0 THEN RAISE EXCEPTION 'quedó texto en costs: %', n; END IF;
END $$;

COMMIT;
