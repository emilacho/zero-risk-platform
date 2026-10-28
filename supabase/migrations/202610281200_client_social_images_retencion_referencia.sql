-- Retención de las fotos de REFERENCIA (28-oct · CC-CEREBRO · firma de Emilio: «igual que competidor»): 90 días desde created_at, como competidor. ADITIVA: solo documenta (COMMENT); no toca filas ni columnas.
-- REVERSA: COMMENT ON TABLE public.client_social_images IS NULL;
COMMENT ON TABLE public.client_social_images IS 'Fotos de redes en el bucket client-social-images. Retención (política declarada, sin proceso que borre todavía): competidor = 90 días y referencia = 90 días desde created_at; propio = mientras el cliente esté activo.';
