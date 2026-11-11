-- GO Lenovo 11-nov 15:38 Zúrich · CC3 · filas de VIDEO en la tabla de formatos de entrega (certifica CC6) · US$ 0.
-- El reel W47 (`s2-d1-lun_reel_gye`, bandeja 319e8a8a) llegó con «entrega: no hay especificación técnica para este formato y red»: la tabla solo traía
-- imágenes (carrusel, foto, historia, estado). Ya pasó 3 veces desde el 28-oct. La oficina busca la fila por (red, formatoDeEntrega(formatoDeVideo(brief)))
-- (`src/lib/oficina/orquestador-video.ts:192-194`, `video/pedido.ts`): reel → «reel», short → «short», tiktok → «video», lo demás → «video».
-- Se agregan las 5 redes canónicas con su formato de video vertical (las de `cadena_formatos_por_red` con familia `video_mesa`, más LinkedIn):
--   instagram·reel · facebook·reel · tiktok·video · youtube·short · linkedin·video
-- TODAS en mp4, 1080×1920 (9:16) y verificado=false: igual que las filas de imagen, los límites de texto/hashtags/peso AVISAN y no bloquean.
-- Las medidas de un video no se leen por código (solo el encabezado `ftyp`): el chequeo deja «mirar el video antes de aprobar». No es una verificación nueva: es un dato que faltaba.
-- YouTube «video» (16:9, sin familia) no entra: la oficina no lo produce.
-- Solo AMPLÍA (ON CONFLICT DO NOTHING): no toca filas existentes ni piezas. Reversa en supabase/reversas/202611111600_oficina_formatos_de_video_REVERSA.sql.
BEGIN;

INSERT INTO public.oficina_entrega_formatos (red, formato, ancho, alto, ratio, tipos_archivo, peso_max_mb, n_min, n_max, texto_max, hashtags_max, pasos_publicacion, fuente_url, verificado_en, verificado) VALUES
  ('instagram', 'reel', 1080, 1920, '9:16', ARRAY['mp4'], 250, 1, 1, 2200, 30, ARRAY['Descargar el video','Crear un reel nuevo y elegir el video','Pegar el texto y las etiquetas de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('facebook', 'reel', 1080, 1920, '9:16', ARRAY['mp4'], 250, 1, 1, 2200, 30, ARRAY['Descargar el video','Crear un reel nuevo en la página y elegir el video','Pegar el texto y las etiquetas de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('tiktok', 'video', 1080, 1920, '9:16', ARRAY['mp4'], 250, 1, 1, 2200, 10, ARRAY['Descargar el video','Subir un video nuevo y elegir el archivo','Pegar el texto y las etiquetas de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('youtube', 'short', 1080, 1920, '9:16', ARRAY['mp4'], 250, 1, 1, 5000, 15, ARRAY['Descargar el video','Crear un short nuevo y elegir el video','Pegar el título, la descripción y las etiquetas de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('linkedin', 'video', 1080, 1920, '9:16', ARRAY['mp4'], 250, 1, 1, 3000, 5, ARRAY['Descargar el video','Crear una publicación nueva y elegir el video','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false)
ON CONFLICT (red, formato) DO NOTHING;

COMMIT;
