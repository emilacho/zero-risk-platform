-- P4 y P5 del encargo de correcciones (29-oct) · CC#2.
-- P4 · la pieza real de la mesa (BRF-0002, carrusel de Facebook) llegó a la bandeja con «no hay especificación técnica para este formato y red» porque la tabla de formatos solo traía Instagram y WhatsApp.
--      Se agregan las filas de las redes activas (Facebook, LinkedIn, TikTok). TODAS entran con verificado=false: el chequeo AVISA (no bloquea) en texto/hashtags/peso; las MEDIDAS sí bloquean, así que se dejan
--      en lo que dibuja la oficina hoy (1080×1350 para el carrusel/foto 4:5, 1080×1080 para 1:1, 1080×1920 vertical). YouTube no entra: su pieza es video/portada, no un carrusel de imágenes.
-- P5 · la revisión de la jefatura de la pieza real se cortó con «incompleta por tope»: el tope de la REVISIÓN era US$ 0,50 (fila `pieza` de jefatura_grading_policies) y llevaba gastados US$ 0,4278 → quedaban 0,07,
--      menos que cualquier paso siguiente. Era un tope de DINERO (no de tiempo). Se sube a US$ 1,50 por revisión y se ensanchan los topes por paso para que una pieza completa con imágenes se revise entera.
-- Solo AMPLÍA: no toca filas de piezas ni de revisiones. Reversa en supabase/reversas/202610291500_oficina_formatos_redes_y_tope_de_jefatura_REVERSA.sql.
BEGIN;

INSERT INTO public.oficina_entrega_formatos (red, formato, ancho, alto, ratio, tipos_archivo, peso_max_mb, n_min, n_max, texto_max, hashtags_max, pasos_publicacion, fuente_url, verificado_en, verificado) VALUES
  ('facebook', 'carrusel', 1080, 1350, '4:5', ARRAY['png','jpeg'], 8, 2, 10, 2200, 10, ARRAY['Descargar las imágenes en el orden de sus nombres','Crear una publicación nueva en la página y elegir todas las imágenes','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('facebook', 'foto_1x1', 1080, 1080, '1:1', ARRAY['png','jpeg'], 8, 1, 1, 2200, 10, ARRAY['Descargar la imagen','Crear una publicación nueva en la página y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('facebook', 'foto_4x5', 1080, 1350, '4:5', ARRAY['png','jpeg'], 8, 1, 1, 2200, 10, ARRAY['Descargar la imagen','Crear una publicación nueva en la página y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('facebook', 'historia', 1080, 1920, '9:16', ARRAY['png','jpeg'], 8, 1, 30, 2200, 10, ARRAY['Descargar la imagen','Abrir historias de la página y elegir la imagen','Agregar el texto de la hoja si hace falta','Publicar a la hora indicada'], NULL, NULL, false),
  ('linkedin', 'carrusel', 1080, 1350, '4:5', ARRAY['png','jpeg'], 8, 2, 20, 3000, 5, ARRAY['Descargar las imágenes en el orden de sus nombres','Crear una publicación nueva y elegir todas las imágenes','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('linkedin', 'foto_1x1', 1080, 1080, '1:1', ARRAY['png','jpeg'], 8, 1, 1, 3000, 5, ARRAY['Descargar la imagen','Crear una publicación nueva y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('linkedin', 'foto_4x5', 1080, 1350, '4:5', ARRAY['png','jpeg'], 8, 1, 1, 3000, 5, ARRAY['Descargar la imagen','Crear una publicación nueva y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('tiktok', 'carrusel', 1080, 1920, '9:16', ARRAY['png','jpeg'], 8, 2, 35, 2200, 10, ARRAY['Descargar las imágenes en el orden de sus nombres','Crear una publicación de fotos nueva y elegir todas las imágenes','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false)
ON CONFLICT (red, formato) DO NOTHING;

-- P5 · el tope de la revisión de la pieza: de US$ 0,50 a US$ 1,50 (≈ 3,5 × lo que costó la revisión incompleta de la pieza real: 0,4278); topes por paso más holgados
UPDATE public.jefatura_grading_policies
   SET tope_revision_usd = 1.50,
       tope_paso_usd = '{"decision": 0.20, "correccion": 0.30, "revision_fondo": 0.40, "segunda_mirada": 0.15}'::jsonb,
       updated_at = now()
 WHERE artifact_type = 'pieza' AND is_active = true AND tope_revision_usd = 0.50;

COMMIT;
