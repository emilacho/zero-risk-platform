-- REVERSA de 202611180010 · quita SOLO la vara del sentido contra la ficha (el mismo texto exacto que agregó la migración) y devuelve «la sede o la zona» a la vara de #1122
--   (así la reversa de 202611172000, que busca su texto exacto, sigue funcionando después de esta). Lo demás de la indicación se conserva.
BEGIN;
UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = replace(indicacion_fondo, ' ' || $s$Sentido contra la ficha: si recibes el documento «Ficha de la oferta», comprueba que lo que el público ve corresponda a esa oferta y que lo que la pieza afirma (fechas, precio, disponibilidad, objetivo) cuadre con la ficha en la fecha de la pieza. Si no cuadra, pon una ficha de gravedad "bloquea" cuyo «que» empiece exactamente por «sentido · <destino>:», donde <destino> es el paso que lo causó: pieza (lo puso la pieza), hoja (la hoja de la pieza trae el dato mal), calendario (la pieza no debía ir en esa fecha o para esa oferta) o banco (la idea misma choca con la ficha). Termina ese «que» con « — ficha: «<la línea de la ficha copiada tal cual>»». Si no recibes ese documento, no uses este rótulo.$s$, '')
 WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Sentido contra la ficha:%';
UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = replace(indicacion_fondo, 'y la oferta o la zona que importan son las correctas.', 'y la sede o la zona que importan son las correctas.')
 WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%y la oferta o la zona que importan son las correctas.%';
COMMIT;
NOTIFY pgrst, 'reload schema';
