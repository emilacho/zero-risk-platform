-- REVERSA de 202611171900_oficina_permisos_persona_real: quita el registro de permisos de persona real. Se NIEGA si hay alguna fila: son constancias de consentimiento
-- (evidencia legal) y no se destruyen con una reversa; primero se exportan y se decide qué hacer con ellas.
-- Sin la tabla, la sala de video no puede leer el registro y hace lo seguro: ninguna foto propia con personas viaja a una pieza (se declara en cada una).
begin;

do $$
begin
  if to_regclass('public.oficina_permisos_persona_real') is not null
     and exists (select 1 from public.oficina_permisos_persona_real) then
    raise exception '202611171900-reversa: el registro tiene permisos (constancias de consentimiento); exportarlos y decidir antes de quitar la tabla';
  end if;
end $$;

drop table if exists public.oficina_permisos_persona_real;

commit;
notify pgrst, 'reload schema';
