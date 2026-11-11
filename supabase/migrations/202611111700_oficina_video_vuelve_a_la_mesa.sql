-- GO Lenovo 11-nov 16:34 Zúrich (decisión de Emilio) · CC4 · el pedido del video VUELVE UNA SOLA VEZ a la mesa si el guion nombra fotos que no existen.
-- Antes: el guion del reel W47 nombró sus 4 fotos por el nombre corto; el pedido las buscaba por el id completo, no halló ninguna y el video salió desde el texto, sin fotos
-- (solo quedó una ficha «sugerencia» que nadie leyó). El código ahora encuentra las fotos por su nombre corto; y si aun así el guion nombra fotos que no existen
-- (o un nombre corto que coincide con varias), el paso `pedido` deja `vuelve_a_la_mesa = true` con el aviso de cuáles, y esta vuelta lo devuelve a la mesa: la dirección
-- rehace el guion con lo que hay y el encargo sigue. Máximo 1 vuelta: a la segunda sigue de largo como hoy. NO es un freno: un cliente sin fotos sigue con el video desde el texto.
-- Es DATO de la plantilla `video_mesa` (el código la lee de esta tabla): agrega `vuelve_a` al paso `pedido` (índice 2). La prueba `mesa-de-video-t8` mantiene el dato igual a `plantillas/video-mesa.ts`.
-- ORDEN: se puede aplicar ANTES del código: el código de hoy nunca escribe `vuelve_a_la_mesa`, así que la condición nunca se cumple y nada cambia hasta publicar.
-- Si la fila no tiene el paso `pedido` en el índice 2 (alguien cambió la plantilla), la migración FALLA y no cambia nada.
-- Reversa: supabase/reversas/202611111700_oficina_video_vuelve_a_la_mesa_REVERSA.sql · Agnóstico: ningún dato de un cliente. No abre permisos.
begin;

do $$
declare n int;
begin
  update public.oficina_tipos_de_grupo
     set pasos = jsonb_set(pasos, '{2,vuelve_a}', $vuelta${"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"pedido_video","campo":"vuelve_a_la_mesa","igual":true}}$vuelta$::jsonb, true)
   where familia = 'video_mesa'
     and pasos->2->>'clave' = 'pedido'
     and pasos->2->>'funcion' = 'pedido_de_video'
     and pasos->1->>'clave' = 'mesa';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'video_mesa: se esperaba 1 fila con el paso pedido en el índice 2 y la mesa en el 1; se tocaron %', n;
  end if;
end $$;

commit;
