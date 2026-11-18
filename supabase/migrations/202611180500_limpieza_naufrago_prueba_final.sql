-- 202611180500 · LIMPIEZA DE NÁUFRAGO ANTES DE LA PRUEBA FINAL (datos, no estructura)
-- GO-LENOVO-a-CC3-CC6-CC7-limpieza-y-arranque-de-la-prueba (modo jefe · «dale» de Emilio 18-nov: «borrar lo posterior al plan de Náufrago, con respaldo previo»).
-- Lista: INVENTARIO-CC7-limpieza-naufrago (ADENDA 3, lista final) + HALLAZGO-CC3-a-CC7-CC6-LENOVO (5 correcciones: el reel y el plan).
--
-- SE BORRA (solo Náufrago `0a2ffbd4…`):
--   · la campaña `28de888e` y todas sus hijas (incluida la estrategia). Camino (B) de Lenovo (RESPUESTA-LENOVO reabrir-y-cotizacion, 04:21Z): la corrida
--     abre una campaña NUEVA con `abrir` y el mismo plan. Condición cumplida: el reel no se rompe sin ella (RESPUESTA-CC3 el-reel-no-se-rompe-sin-su-campana).
--   · las salidas posteriores al plan: los 5 `campaign_piece` y 2 de los 3 `campaign_brief_pack` (`27a1febc`, `ce085548`).
--   · la oficina (19 encargos y sus hijas), las 4 revisiones de `jefatura` de tipo `pieza`, 8 filas de la bandeja (gran idea y piezas),
--     4 avisos de la campaña, `estudio_piezas`, `autorevisiones_del_productor`, `workflow_checkpoints`;
--   · `sala_event_log`: 82 filas en 25 streams enteros (BRIEF de la campaña y PIEZAS de las partes borradas · ADENDA 4 de CC7). Quedan 35.
--   · las llaves de Náufrago en 3 libretas de `cadena_config`.
-- SE QUEDA: el manual, el plan (con su bandeja, sus eventos, su espera y sus 4 revisiones de `jefatura`), `finanzas_*`, todo el cerebro,
--   la configuración, la bitácora de gasto y la web. Y el REEL `2ed549cc` (esperando a Emilio), con todo lo que necesita para seguir:
--   su encargo y sus hijas, su parte `009abba3`, sus 11 imágenes de `agent_image_generations`.
--
-- Candados: cada borrado comprueba que borró EXACTAMENTE las filas contadas el 18-nov (solo SELECT). Si un número no coincide, la migración
-- entera se deshace (una sola transacción) y hay que volver a contar. Al final se comprueba lo que se queda.
-- Respaldo previo: `raw/backups/2026-11-18-limpieza-naufrago/` (una tabla por archivo, con las mismas condiciones de este archivo).
-- Vuelta atrás: el guion de restauración re-inserta desde ese respaldo, de la raíz a las hojas (no es un archivo SQL: los datos viven en el respaldo).
-- Disparadores (pg_trigger, 18-nov): solo de `updated_at` (UPDATE) y el de `eventos_de_emilio` (inmutable: por eso no se toca). Borrar no tiene efectos laterales.
-- `eventos_de_emilio` SE QUEDA entero (18): es la bitácora de las decisiones de Emilio y la base no deja borrarla.
-- Los archivos del almacenamiento NO se borran aquí (se borran por la API de almacenamiento, con su propio respaldo y conteo).

begin;

set local lock_timeout = '10s';

do $limpieza$
declare
  c   constant uuid := '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';  -- Náufrago
  ct  constant text := '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';  -- el mismo, en las tablas que lo guardan como texto
  camp constant uuid := '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'; -- la campaña (se borra al final, después de sus hijas · camino B)
  reel constant uuid := '2ed549cc-f452-4261-b334-3b35a6dd5a4d'; -- el reel que espera a Emilio (se queda)
  parte_reel constant uuid := '009abba3-0da4-4d7e-9329-5f3bfe34ce36';
  plan_de_camp text;
  n int;
begin
  plan_de_camp := (select plan_id::text from public.cadena_campanas where id = camp);
  -- ── 0 · lo que se queda, ANTES (si esto no cuadra, nada se toca)
  if (select count(*) from public.clients where id = c) <> 1 then raise exception 'candado: no está la ficha de Náufrago'; end if;
  if (select estado from public.cadena_campanas where id = camp and client_id = ct) is distinct from 'pausada' then raise exception 'candado: la campaña % no está pausada', camp; end if;
  if (select count(*) from public.oficina_encargos where id = reel and client_id = ct and estado = 'en_paso') <> 1 then raise exception 'candado: el reel no está en_paso'; end if;
  if (select count(*) from public.client_historical_outputs where id = parte_reel and client_id = c and output_type = 'campaign_brief_pack') <> 1 then raise exception 'candado: falta el parte del reel'; end if;
  if (select count(*) from public.client_historical_outputs where client_id = c and output_type = 'campaign_plan_90d' and status = 'approved') <> 1 then raise exception 'candado: el plan aprobado no está'; end if;

  -- ── 1 · jefatura: solo las revisiones de PIEZA (las 4 del plan se quedan)
  delete from public.jefatura_fichas where revision_id in (select id from public.jefatura_revisiones where client_id = ct and artifact_type = 'pieza');
  get diagnostics n = row_count; if n <> 31 then raise exception 'candado jefatura_fichas: % (esperaba 31)', n; end if;
  delete from public.jefatura_pasos where revision_id in (select id from public.jefatura_revisiones where client_id = ct and artifact_type = 'pieza');
  get diagnostics n = row_count; if n <> 18 then raise exception 'candado jefatura_pasos: % (esperaba 18)', n; end if;
  delete from public.jefatura_revisiones where client_id = ct and artifact_type = 'pieza';
  get diagnostics n = row_count; if n <> 4 then raise exception 'candado jefatura_revisiones: % (esperaba 4)', n; end if;

  -- ── 2 · la oficina: todos los encargos de Náufrago MENOS el reel (hojas → raíz)
  create temp table _enc on commit drop as select id from public.oficina_encargos where client_id = ct and id <> reel;
  if (select count(*) from _enc) <> 19 then raise exception 'candado oficina_encargos a borrar: % (esperaba 19)', (select count(*) from _enc); end if;
  delete from public.oficina_artefactos where encargo_id in (select id from _enc);
  get diagnostics n = row_count; if n <> 69 then raise exception 'candado oficina_artefactos: % (esperaba 69)', n; end if;
  delete from public.oficina_fichas where encargo_id in (select id from _enc);
  get diagnostics n = row_count; if n <> 25 then raise exception 'candado oficina_fichas: % (esperaba 25)', n; end if;
  delete from public.oficina_gastos where encargo_id in (select id from _enc);
  get diagnostics n = row_count; if n <> 157 then raise exception 'candado oficina_gastos: % (esperaba 157)', n; end if;
  delete from public.oficina_uso_de_fotos where encargo_id in (select id from _enc) or client_id = ct;
  get diagnostics n = row_count; if n <> 0 then raise exception 'candado oficina_uso_de_fotos: % (esperaba 0)', n; end if;
  delete from public.oficina_mesa_aportes where encargo_id in (select id from _enc);
  get diagnostics n = row_count; if n <> 229 then raise exception 'candado oficina_mesa_aportes: % (esperaba 229)', n; end if;
  delete from public.oficina_turnos where encargo_id in (select id from _enc);
  get diagnostics n = row_count; if n <> 213 then raise exception 'candado oficina_turnos: % (esperaba 213)', n; end if;
  delete from public.oficina_encargos where id in (select id from _enc);
  get diagnostics n = row_count; if n <> 19 then raise exception 'candado oficina_encargos: % (esperaba 19)', n; end if;

  -- ── 3 · las hijas de la campaña `28de888e` (la campaña se queda, vacía: camino A)
  delete from public.cadena_filas_elegidas where campana_id = camp;
  get diagnostics n = row_count; if n <> 2 then raise exception 'candado cadena_filas_elegidas: % (esperaba 2)', n; end if;
  delete from public.cadena_validaciones where campana_id = camp;
  get diagnostics n = row_count; if n <> 79 then raise exception 'candado cadena_validaciones: % (esperaba 79)', n; end if;
  delete from public.cadena_esperas where campana_id = camp;
  get diagnostics n = row_count; if n <> 22 then raise exception 'candado cadena_esperas: % (esperaba 22)', n; end if;
  delete from public.cadena_corridas where campana_id = camp;
  get diagnostics n = row_count; if n <> 5 then raise exception 'candado cadena_corridas: % (esperaba 5)', n; end if;
  delete from public.cadena_calendario_filas where campana_id = camp;
  get diagnostics n = row_count; if n <> 112 then raise exception 'candado cadena_calendario_filas: % (esperaba 112)', n; end if;
  delete from public.cadena_brief_creativo where campana_id = camp;
  get diagnostics n = row_count; if n <> 4 then raise exception 'candado cadena_brief_creativo: % (esperaba 4)', n; end if;
  delete from public.cadena_conceptos where campana_id = camp;
  get diagnostics n = row_count; if n <> 4 then raise exception 'candado cadena_conceptos: % (esperaba 4)', n; end if;
  delete from public.cadena_estrategias where campana_id = camp;
  get diagnostics n = row_count; if n <> 1 then raise exception 'candado cadena_estrategias: % (esperaba 1)', n; end if;
  delete from public.cadena_fichas_de_oferta where campana_id = camp;
  get diagnostics n = row_count; if n <> 0 then raise exception 'candado cadena_fichas_de_oferta: % (esperaba 0)', n; end if;
  delete from public.cadena_correcciones where campana_id = camp;
  get diagnostics n = row_count; if n <> 0 then raise exception 'candado cadena_correcciones: % (esperaba 0)', n; end if;

  -- ── 4 · la bandeja, los eventos y los avisos de la CAMPAÑA (lo del manual y el plan se queda)
  delete from public.hitl_queue where client_id = c and type in ('concepto_review', 'content_piece_review');
  get diagnostics n = row_count; if n <> 8 then raise exception 'candado hitl_queue: % (esperaba 8)', n; end if;
  -- `eventos_de_emilio` NO se toca: es la bitácora inmutable de las decisiones de Emilio (disparador `eventos_de_emilio_inmutable`
  -- rechaza DELETE/UPDATE/TRUNCATE). Sus 3 eventos de la campaña quedan como historia; la cadena no los lee para decidir.
  delete from public.avisos where client_id = c and clave like 'cadena:%' || camp::text || '%';
  get diagnostics n = row_count; if n <> 4 then raise exception 'candado avisos: % (esperaba 4)', n; end if;

  -- ── 5 · las salidas posteriores al plan: las 5 piezas y 2 de los 3 partes (el del reel se queda)
  -- los `ON DELETE SET NULL` (`hitl_queue`, `agent_outcomes`, `campaign_results` · `output_id`): se cuentan ANTES; hoy 0, así que no cambian nada
  if (select count(*) from public.hitl_queue h join public.client_historical_outputs o on o.id = h.output_id
       where o.client_id = c and (o.output_type = 'campaign_piece' or o.id in ('27a1febc-244d-40fa-b01a-5d1a234d1737', 'ce085548-56a0-4892-8852-74c1d2d54576')))
     + (select count(*) from public.agent_outcomes h join public.client_historical_outputs o on o.id = h.output_id
       where o.client_id = c and (o.output_type = 'campaign_piece' or o.id in ('27a1febc-244d-40fa-b01a-5d1a234d1737', 'ce085548-56a0-4892-8852-74c1d2d54576')))
     + (select count(*) from public.campaign_results h join public.client_historical_outputs o on o.id = h.output_id
       where o.client_id = c and (o.output_type = 'campaign_piece' or o.id in ('27a1febc-244d-40fa-b01a-5d1a234d1737', 'ce085548-56a0-4892-8852-74c1d2d54576'))) <> 0
  then raise exception 'antes: hay filas que apuntan a las salidas que se borran (SET NULL): volver a contar'; end if;
  delete from public.client_historical_outputs
   where client_id = c
     and (output_type = 'campaign_piece'
          or (output_type = 'campaign_brief_pack' and id in ('27a1febc-244d-40fa-b01a-5d1a234d1737', 'ce085548-56a0-4892-8852-74c1d2d54576')));
  get diagnostics n = row_count; if n <> 7 then raise exception 'candado client_historical_outputs: % (esperaba 7)', n; end if;

  -- ── 6 · estudio, autorrevisiones y puntos de retoma
  delete from public.estudio_piezas where client_id = c;
  get diagnostics n = row_count; if n <> 8 then raise exception 'candado estudio_piezas: % (esperaba 8)', n; end if;
  delete from public.autorevisiones_del_productor where client_id = c;
  get diagnostics n = row_count; if n <> 2 then raise exception 'candado autorevisiones_del_productor: % (esperaba 2)', n; end if;
  delete from public.workflow_checkpoints where client_id = c;
  get diagnostics n = row_count; if n <> 65 then raise exception 'candado workflow_checkpoints: % (esperaba 65)', n; end if;

  -- ── 6b · la sala (INVENTARIO-CC7 ADENDA 4 · 🟢 CC6): por STREAM ENTERO (sin huecos de `sequence`). Se borran los streams BRIEF de la campaña
  --        (su llave `${camp}:tanda-N:<etapa>` chocaría al reabrir) y los PIEZAS de las partes borradas. Se quedan el alta, el plan y los 2 del reel (009abba3).
  delete from public.sala_event_log
   where stream_id in (select stream_id from public.sala_event_log where client_id = c group by stream_id
                        having bool_or(journey_type = 'BRIEF')
                            or (bool_or(journey_type = 'PIEZAS') and not bool_or(coalesce(logical_period, '') || coalesce(idempotency_key, '') like '%009abba3%')));
  get diagnostics n = row_count; if n <> 82 then raise exception 'candado sala_event_log: % (esperaba 82)', n; end if;

  -- ── 7 · las libretas de `cadena_config`: solo las llaves de Náufrago (las claves se quedan)
  update public.cadena_config set valor = valor - camp::text, actualizado_en = now()
   where clave = 'reubicacion_libreta' and valor ? camp::text;
  get diagnostics n = row_count; if n <> 1 then raise exception 'candado reubicacion_libreta: % (esperaba 1)', n; end if;
  update public.cadena_config set valor = valor #- '{fallidos,f0490664-d17f-40c4-b253-5b2bc6faa976}', actualizado_en = now()
   where clave = 'rehacer_fallidos_libreta' and valor->'fallidos' ? 'f0490664-d17f-40c4-b253-5b2bc6faa976';
  get diagnostics n = row_count; if n <> 1 then raise exception 'candado rehacer_fallidos_libreta: % (esperaba 1)', n; end if;
  update public.cadena_config
     set valor = valor - array[
           '2a93029a-d4e5-439e-87a8-4b67afdfec33:BRF-0001', '2a93029a-d4e5-439e-87a8-4b67afdfec33:BRF-0002', '2a93029a-d4e5-439e-87a8-4b67afdfec33:BRF-0004',
           '27a1febc-244d-40fa-b01a-5d1a234d1737:s2-d1-lun_reel_gye', '27a1febc-244d-40fa-b01a-5d1a234d1737:s2-d4-jue_foto_olon',
           '27a1febc-244d-40fa-b01a-5d1a234d1737:s2-d6-sab_reel_olon', 'ce085548-56a0-4892-8852-74c1d2d54576:s1-d4-jue_foto_olon'],
         actualizado_en = now()
   where clave = 'reintentos_piezas' and (select count(*) from jsonb_object_keys(valor) k where k like '2a93029a-%' or k like '27a1febc-%' or k like 'ce085548-%') = 7;
  get diagnostics n = row_count; if n <> 1 then raise exception 'candado reintentos_piezas: % (esperaba 1)', n; end if;

  -- ── 7b · la campaña misma, al final (sus 10 hijas ya están vacías: son las únicas llaves foráneas hacia `cadena_campanas`)
  delete from public.cadena_campanas where id = camp and client_id = ct and estado = 'pausada';
  get diagnostics n = row_count; if n <> 1 then raise exception 'candado cadena_campanas: % (esperaba 1)', n; end if;

  -- ── 8 · DESPUÉS: lo borrado quedó en 0 y lo que se queda, intacto
  if (select count(*) from public.oficina_encargos where client_id = ct) <> 1 then raise exception 'después: quedan encargos de Náufrago además del reel'; end if;
  if (select count(*) from public.oficina_turnos where encargo_id = reel) <> 17 then raise exception 'después: el reel no tiene sus 17 turnos'; end if;
  if (select count(*) from public.oficina_artefactos where encargo_id = reel) <> 6 then raise exception 'después: el reel no tiene sus 6 artefactos'; end if;
  if (select count(*) from public.oficina_mesa_aportes where encargo_id = reel) <> 19 then raise exception 'después: el reel no tiene sus 19 aportes'; end if;
  if (select count(*) from public.oficina_gastos where encargo_id = reel) <> 28 then raise exception 'después: el reel no tiene sus 28 gastos'; end if;
  if (select count(*) from public.agent_image_generations where client_id = ct) <> 11 then raise exception 'después: faltan las 11 imágenes del reel'; end if;
  if (select count(*) from public.client_historical_outputs where client_id = c and output_type = 'campaign_brief_pack') <> 1 then raise exception 'después: debe quedar solo el parte del reel'; end if;
  if (select count(*) from public.client_historical_outputs where client_id = c and output_type = 'campaign_plan_90d') <> 7 then raise exception 'después: la historia del plan no está entera (7)'; end if;
  if (select count(*) from public.hitl_queue where client_id = c) <> 10 then raise exception 'después: la bandeja del plan no está entera (10)'; end if;
  if (select count(*) from public.eventos_de_emilio where client_id = c) <> 18 then raise exception 'después: la bitácora de Emilio no está entera (18)'; end if;
  if (select count(*) from public.esperas_del_dueno where client_id = c) <> 1 then raise exception 'después: la espera del manual no está'; end if;
  if (select count(*) from public.jefatura_revisiones where client_id = ct and artifact_type = 'plan') <> 4 then raise exception 'después: faltan las 4 revisiones del plan'; end if;
  if (select count(*) from public.sala_event_log where client_id = c) <> 35 then raise exception 'después: la sala del alta, el plan y el reel no está entera (35)'; end if;
  if (select count(*) from public.sala_event_log where client_id = c and journey_type = 'PIEZAS') <> 6 then raise exception 'después: faltan las 6 filas de la sala del reel'; end if;
  if (select count(*) from public.plan_corridas where client_id = ct) <> 6 then raise exception 'después: las corridas del plan no están enteras (6)'; end if;
  if exists (select 1 from public.cadena_campanas where id = camp) then raise exception 'después: la campaña sigue ahí'; end if;
  if plan_de_camp is null or exists (select 1 from public.cadena_campanas where client_id = ct and plan_id::text = plan_de_camp) then raise exception 'después: queda otra campaña con el mismo plan (abrir contestaría ya_abierta)'; end if;
  if (select count(*) from public.client_historical_outputs where id = parte_reel and provenance_tag->>'campana_id' = camp::text) <> 1 then raise exception 'después: la parte del reel perdió su sello'; end if;

  raise notice 'limpieza de Náufrago: hecha · el reel % y el plan intactos', reel;
end
$limpieza$;

commit;
