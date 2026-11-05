-- REVERSA de 202611051110_topes_del_go_doble_chequeo.sql: vuelve a la versión anterior de cada tope y a los US$ 20 de la ficha de Náufrago. La restricción de hasta US$ 50 se deja: no estorba.
do $$
declare
  t text;
begin
  foreach t in array array['tope_mesa', 'tope_redaccion'] loop
    if (select count(*) from public.plan_catalogo_topes where tope_id = t) > 1 then
      delete from public.plan_catalogo_topes where tope_id = t and vigente;
      update public.plan_catalogo_topes set vigente = true where tope_id = t and version = (select max(version) from public.plan_catalogo_topes where tope_id = t);
    end if;
  end loop;
end $$;
delete from public.plan_catalogo_topes where tope_id = 'tope_analisis';
update public.clients set config = jsonb_set(coalesce(config, '{}'::jsonb), '{spend_cap_usd}', '20'::jsonb) where id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312';
