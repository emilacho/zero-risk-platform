-- PERFIL DEL PÚBLICO · se BORRA la tabla de voces propia (GO de Lenovo por firma de Emilio, 18-nov 02:14 Zúrich).
-- Desde #1157 el perfil NO raspa: lee la voz del público solo por la consulta del cerebro, y esta tabla quedó sin uso.
-- Comprobado antes (18-nov, solo lectura): 0 filas; ninguna vista, función, disparador, llave foránea ni flujo de n8n la nombra;
-- su única política (`perfil_publico_voces_service`) se va con ella.
-- Se niega si la tabla tiene alguna fila: no se borra lo raspado. Reversa: supabase/reversas/202611180300_borrar_perfil_publico_voces_REVERSA.sql
begin;

do $$
begin
  -- dos IF anidados, no un AND: PL/pgSQL prepara la consulta del EXISTS aunque la tabla no exista y falla (ensayado en pglite)
  if to_regclass('public.perfil_publico_voces') is not null then
    if exists (select 1 from public.perfil_publico_voces) then
      raise exception 'perfil_publico_voces tiene filas: no se borra (avisar a Lenovo)';
    end if;
  end if;
end $$;

drop table if exists public.perfil_publico_voces;

commit;
notify pgrst, 'reload schema';
