-- FILA #19 del barrido de reglas rígidas (GO Lenovo 11-nov 03:55Z · CC4) · la CLASE de cada plantilla de la oficina es un DATO.
-- Antes: qué familia era carrusel, kit o video (y cuál no tiene pieza simple) lo decía el NOMBRE de la familia, escrito en 7 archivos del código;
-- una familia nueva cargada en esta tabla se revisaba y se dibujaba como «post». Ahora cada plantilla declara su clase y el código solo sabe qué hace cada clase.
-- Clases: post_img · carrusel · kit · video (sin pieza simple) · interna (pasos de la mesa que no se publican: brief, concepto, reubicación).
-- Una plantilla nueva sin clase NO se puede guardar (not null + check): no cae en silencio como «post».
-- Solo agrega una columna a una tabla que ya existe: los permisos de la tabla (lectura del servidor) la cubren; no se abre nada a public, anon ni authenticated.
-- ORDEN: esta migración se aplica ANTES de publicar el código (el código lee la columna `clase`).
-- Reversa (solo si se revierte el código primero): supabase/reversas/202611111401_oficina_clase_de_pieza_REVERSA.sql
-- Agnóstico: ningún dato de un cliente.
begin;

alter table public.oficina_tipos_de_grupo add column if not exists clase text;

-- relleno de las 9 plantillas de hoy (la única vez que el nombre decide: aquí, en el dato, no en el código)
update public.oficina_tipos_de_grupo set clase = case familia
    when 'post_img' then 'post_img'
    when 'carrusel_ig_v1' then 'carrusel'
    when 'carrusel_mesa' then 'carrusel'
    when 'kit_historias' then 'kit'
    when 'kit_mesa' then 'kit'
    when 'video_mesa' then 'video'
    when 'brief_mesa' then 'interna'
    when 'concepto_mesa' then 'interna'
    when 'reubicacion_mesa' then 'interna'
  end
where clase is null;

-- si existe una plantilla que no está en la lista, la migración FALLA y no cambia nada: alguien decide su clase, no se adivina
do $$
declare sin_clase text;
begin
  select string_agg(familia, ', ') into sin_clase from public.oficina_tipos_de_grupo where clase is null;
  if sin_clase is not null then
    raise exception 'plantillas sin clase (decidir antes de aplicar): %', sin_clase;
  end if;
end $$;

alter table public.oficina_tipos_de_grupo alter column clase set not null;
alter table public.oficina_tipos_de_grupo drop constraint if exists oficina_tipos_de_grupo_clase_valida;
alter table public.oficina_tipos_de_grupo add constraint oficina_tipos_de_grupo_clase_valida check (clase in ('post_img', 'carrusel', 'kit', 'video', 'interna'));

comment on column public.oficina_tipos_de_grupo.clase is 'fila #19 · la clase de la pieza (post_img · carrusel · kit · video · interna): decide cómo se revisa, si dibuja láminas y si tiene pieza simple. La lee src/lib/oficina/clase.ts';

commit;

notify pgrst, 'reload schema';
