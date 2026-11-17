-- REVERSA de 202611171500_cadena_filas_elegidas: quita la tabla de permisos. Se niega si hay un permiso VIGENTE (una producción elegida en curso):
-- primero se espera a que venza (24 h) o a que su parte termine. Sin la tabla, la acción `filas · producir` falla declarada y una campaña pausada no suelta nada (como antes).
begin;

do $$
begin
  if to_regclass('public.cadena_filas_elegidas') is not null
     and exists (select 1 from public.cadena_filas_elegidas where vence_en > now()) then
    raise exception '202611171500-reversa: hay permisos de filas elegidas vigentes; esperar a que venzan';
  end if;
end $$;

drop table if exists public.cadena_filas_elegidas;

commit;
notify pgrst, 'reload schema';
