-- 04-nov · CUPO POR CLIENTE A US$ 15 AL DÍA («dale» de Emilio 16:47Z) · CC1
-- El freno real es la variable `RUN_SPEND_CAP_USD` (se pone en 15, sin cambiar código); esta fila no la lee ningún freno hoy: se sube para que el catálogo no la contradiga. Versión nueva, la anterior queda como historia.
-- REVERSA: `supabase/reversas/202611041700_cupo_por_cliente_15_REVERSA.sql`.
do $$
declare siguiente integer;
begin
  if exists (select 1 from public.plan_catalogo_topes where tope_id = 'tope_cupo_ficha' and vigente and usd <> 15) then
    select max(version) + 1 into siguiente from public.plan_catalogo_topes where tope_id = 'tope_cupo_ficha';
    update public.plan_catalogo_topes set vigente = false where tope_id = 'tope_cupo_ficha' and vigente;
    insert into public.plan_catalogo_topes (tope_id, tramo, fuente_id, usd, contador, version, vigente, pais)
      select tope_id, tramo, fuente_id, 15, contador, siguiente, true, pais from public.plan_catalogo_topes where tope_id = 'tope_cupo_ficha' and version = siguiente - 1;
  end if;
end $$;
