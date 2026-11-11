-- REVERSA de 202611111401_oficina_clase_de_pieza.sql · fila #19 (CC4).
-- Aplicar SOLO después de revertir el código que lee `oficina_tipos_de_grupo.clase` (si no, la oficina deja de leer sus plantillas).
begin;
alter table public.oficina_tipos_de_grupo drop constraint if exists oficina_tipos_de_grupo_clase_valida;
alter table public.oficina_tipos_de_grupo drop column if exists clase;
commit;
notify pgrst, 'reload schema';
