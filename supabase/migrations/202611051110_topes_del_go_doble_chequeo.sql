-- 05-nov · GO de Lenovo tras el doble chequeo · CC1. Versión nueva de cada fila, la anterior queda como historia.
-- Mesa 3 → 4. Redacción 0,80 → 2,50 (su tope real por intento: el pre-vuelo contaba de menos). Análisis 5 (nuevo: el botón ahora lo pide siempre). Ficha de Náufrago: US$ 30 por 24 h (D3).
-- REVERSA: `supabase/reversas/202611051110_topes_del_go_doble_chequeo_REVERSA.sql`.
alter table public.plan_catalogo_topes drop constraint if exists plan_catalogo_topes_usd_check;
alter table public.plan_catalogo_topes add constraint plan_catalogo_topes_usd_check check (usd >= 0 and usd <= 50);

do $$
declare
  fila record;
  siguiente integer;
begin
  for fila in select * from (values ('tope_mesa', 4::numeric), ('tope_redaccion', 2.5::numeric)) as t(tope_id, usd) loop
    if exists (select 1 from public.plan_catalogo_topes where tope_id = fila.tope_id and vigente and usd <> fila.usd) then
      select max(version) + 1 into siguiente from public.plan_catalogo_topes where tope_id = fila.tope_id;
      update public.plan_catalogo_topes set vigente = false where tope_id = fila.tope_id and vigente;
      insert into public.plan_catalogo_topes (tope_id, tramo, fuente_id, usd, contador, version, vigente, pais)
        select tope_id, tramo, fuente_id, fila.usd, contador, siguiente, true, pais from public.plan_catalogo_topes where tope_id = fila.tope_id and version = siguiente - 1;
    end if;
  end loop;
end $$;

insert into public.plan_catalogo_topes (tope_id, tramo, fuente_id, usd, contador, version, vigente, pais)
  select 'tope_analisis', 'analisis', null, 5, 'mesa_de_analisis', 1, true, null
  where not exists (select 1 from public.plan_catalogo_topes where tope_id = 'tope_analisis');

update public.clients set config = jsonb_set(coalesce(config, '{}'::jsonb), '{spend_cap_usd}', '30'::jsonb)
  where id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
