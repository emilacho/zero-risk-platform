-- Reversa de 202611111600_oficina_formatos_de_video.sql · quita SOLO las 5 filas de video que agregó y solo si siguen sin verificar
-- (si alguien ya verificó una, se queda: es un dato que alguien confirmó). No toca piezas ni otras filas.
BEGIN;
DELETE FROM public.oficina_entrega_formatos
 WHERE verificado = false
   AND (red, formato) IN (('instagram','reel'),('facebook','reel'),('tiktok','video'),('youtube','short'),('linkedin','video'));
COMMIT;
