-- Encargo 10 de Cerebro (18-nov) + DECISIÓN 19-nov · «NO ES DE ESTE CLIENTE»: una ficha de OTRO negocio se guarda con su marca, su motivo y su prueba. Nada se borra.
-- Aditiva: las fichas de hoy quedan con estas columnas vacías (= sin marca). Los lectores las entregan CON la marca, como dato.
--   otro_negocio_como: `mercado` (sirve de referencia, con su nivel del embudo) | `nada` (no sirve para este cliente)
-- Reversa: supabase/reversas/202611191600_cerebro_fichas_otro_negocio_REVERSA.sql

alter table public.cerebro_fichas
  add column if not exists otro_negocio_motivo text,
  add column if not exists otro_negocio_prueba text,
  add column if not exists otro_negocio_como text,
  add column if not exists otro_negocio_nivel text,
  add column if not exists otro_negocio_por text,
  add column if not exists otro_negocio_en timestamptz;

alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_como_check;
alter table public.cerebro_fichas add constraint cerebro_fichas_otro_negocio_como_check check (otro_negocio_como is null or otro_negocio_como in ('mercado', 'nada'));
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_nivel_check;
alter table public.cerebro_fichas add constraint cerebro_fichas_otro_negocio_nivel_check check (otro_negocio_nivel is null or otro_negocio_nivel in ('global', 'pais', 'mundo'));
-- una marca va ENTERA (motivo, prueba, cómo, quién y cuándo) o no va; `mercado` exige su nivel y `nada` no lleva nivel
alter table public.cerebro_fichas drop constraint if exists cerebro_fichas_otro_negocio_entera;
alter table public.cerebro_fichas add constraint cerebro_fichas_otro_negocio_entera check (
  (otro_negocio_motivo is null and otro_negocio_prueba is null and otro_negocio_como is null and otro_negocio_nivel is null and otro_negocio_por is null and otro_negocio_en is null)
  or (otro_negocio_motivo is not null and otro_negocio_prueba is not null and otro_negocio_como is not null and otro_negocio_por is not null and otro_negocio_en is not null
      and ((otro_negocio_como = 'mercado') = (otro_negocio_nivel is not null)))
);

-- las marcadas de un cliente, para contarlas y revisarlas
create index if not exists cerebro_fichas_otro_negocio on public.cerebro_fichas (client_id) where otro_negocio_motivo is not null;
