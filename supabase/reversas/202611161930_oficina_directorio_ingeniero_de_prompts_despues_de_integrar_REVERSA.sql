-- REVERSA de 202611161930_oficina_directorio_ingeniero_de_prompts_despues_de_integrar.sql · deja la tarjeta como estaba el 16-nov (lectura viva 19:5x Zúrich):
--   aporta antes de la integración solo si la pieza genera imágenes, con su especialidad de antes. El código nuevo, sin la marca `redacta_prompts`, trabaja como antes.
BEGIN;
UPDATE public.oficina_directorio
   SET pertinente_en = ARRAY['carrusel:si_imagen_generada', 'kit:si_imagen_generada']::text[],
       especialidad = 'redacción de las instrucciones para las imágenes que se generan',
       version = version + 1,
       actualizado_en = now()
 WHERE agente = 'design-image-prompt-engineer';
COMMIT;
NOTIFY pgrst, 'reload schema';
