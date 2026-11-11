-- REVERSA de 202611111700_oficina_video_vuelve_a_la_mesa.sql (CC4) · quita la vuelta del paso `pedido` de `video_mesa`.
-- Se puede aplicar con el código nuevo publicado: sin la vuelta, el pedido sigue de largo como antes (con la ficha de fotos no halladas).
begin;
update public.oficina_tipos_de_grupo
   set pasos = pasos #- '{2,vuelve_a}'
 where familia = 'video_mesa'
   and pasos->2->>'clave' = 'pedido';
commit;
