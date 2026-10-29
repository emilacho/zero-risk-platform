-- Reversa de 202610291500_oficina_formatos_redes_y_tope_de_jefatura.sql · devuelve el tope de la revisión de la pieza a US$ 0,50 y quita las filas de formato que agregó (solo las no verificadas).
BEGIN;
UPDATE public.jefatura_grading_policies
   SET tope_revision_usd = 0.50,
       tope_paso_usd = '{"decision": 0.1, "correccion": 0.2, "revision_fondo": 0.2, "segunda_mirada": 0.1}'::jsonb,
       updated_at = now()
 WHERE artifact_type = 'pieza' AND is_active = true AND tope_revision_usd = 1.50;
DELETE FROM public.oficina_entrega_formatos
 WHERE verificado = false
   AND (red, formato) IN (('facebook','carrusel'),('facebook','foto_1x1'),('facebook','foto_4x5'),('facebook','historia'),('linkedin','carrusel'),('linkedin','foto_1x1'),('linkedin','foto_4x5'),('tiktok','carrusel'));
COMMIT;
