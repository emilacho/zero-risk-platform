-- 202611171900 · SPRINT 3 · T1b · EL REGISTRO DE PERMISOS DE PERSONA REAL (DECISIONES Lenovo 17-nov 13:10 Zúrich, opción B).
-- La cara o la voz de una persona real identificable solo con su permiso registrado (es ley). Las personas y voces GENERADAS son libres.
-- Una fila = un permiso: qué persona, de qué cliente, qué fotos propias la muestran, para qué (imagen · video · voz), hasta cuándo y dónde está la evidencia.
-- La sala de video lo LEE al abrir cada encargo: una foto propia con personas solo viaja si un permiso vigente la cubre; si no, la pieza no la usa y lo declara.
-- Nada se borra: revocar = poner `revocado_en`. El servidor lee, inserta y revoca. Reversa: supabase/reversas/202611171900_oficina_permisos_persona_real_REVERSA.sql
begin;

create table if not exists public.oficina_permisos_persona_real (
  id uuid primary key default gen_random_uuid(),
  -- restrict: borrar un cliente NO borra sus constancias de consentimiento (primero se exportan y se decide)
  client_id uuid not null references public.clients(id) on delete restrict,
  persona text not null check (char_length(btrim(persona)) between 1 and 200),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 200),
  alcance text[] not null check (cardinality(alcance) >= 1 and alcance <@ array['imagen', 'video', 'voz']::text[]),
  vence_en date,
  evidencia text not null check (char_length(btrim(evidencia)) between 1 and 2000),
  nota text check (nota is null or char_length(nota) <= 1000),
  registrado_en timestamptz not null default now(),
  revocado_en timestamptz,
  constraint oficina_permisos_persona_real_revocado_despues check (revocado_en is null or revocado_en >= registrado_en)
);
create index if not exists oficina_permisos_persona_real_cliente on public.oficina_permisos_persona_real (client_id);

alter table public.oficina_permisos_persona_real enable row level security;
-- los privilegios por omisión del esquema dan de más a anon/authenticated (y TRUNCATE salta la seguridad por fila): se quitan todos y solo el servidor lee, inserta y revoca
revoke all on public.oficina_permisos_persona_real from anon, authenticated;
revoke all on public.oficina_permisos_persona_real from service_role;
grant select, insert on public.oficina_permisos_persona_real to service_role;
grant update (revocado_en, nota) on public.oficina_permisos_persona_real to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oficina_permisos_persona_real' and policyname = 'oficina_permisos_persona_real_service') then
    create policy oficina_permisos_persona_real_service on public.oficina_permisos_persona_real for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
