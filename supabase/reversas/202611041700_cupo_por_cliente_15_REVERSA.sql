-- REVERSA de 202611041700_cupo_por_cliente_15: vuelve a la versión anterior y borra la de US$ 15
do $$
declare ultima integer;
begin
  select version into ultima from public.plan_catalogo_topes where tope_id = 'tope_cupo_ficha' and vigente and usd = 15;
  if ultima is not null and ultima > 1 then
    update public.plan_catalogo_topes set vigente = false where tope_id = 'tope_cupo_ficha' and version = ultima;
    update public.plan_catalogo_topes set vigente = true where tope_id = 'tope_cupo_ficha' and version = ultima - 1;
    delete from public.plan_catalogo_topes where tope_id = 'tope_cupo_ficha' and version = ultima;
  end if;
end $$;
