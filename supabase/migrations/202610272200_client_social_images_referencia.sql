-- Fotos de REFERENCIA (27-oct · CC-CEREBRO · permiso de Emilio «dale»): además de 'propio' y 'competidor', una foto puede ser 'referencia'
-- (un anuncio o una imagen del mercado que no es de un competidor concreto). ADITIVA: no toca filas ni columnas; solo ensancha el CHECK.
-- REVERSA (solo si no hay filas 'referencia'; si las hay, bórralas o pásalas a 'competidor' antes):
--   ALTER TABLE public.client_social_images DROP CONSTRAINT client_social_images_owner_role_check;
--   ALTER TABLE public.client_social_images ADD CONSTRAINT client_social_images_owner_role_check CHECK (owner_role IN ('propio','competidor'));
ALTER TABLE public.client_social_images DROP CONSTRAINT IF EXISTS client_social_images_owner_role_check;
ALTER TABLE public.client_social_images ADD CONSTRAINT client_social_images_owner_role_check CHECK (owner_role IN ('propio','competidor','referencia'));
