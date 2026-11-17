-- reversa de 202611172140_cerebro_fotos_procedencia_y_clase.sql · quita las columnas nuevas (lo que se llenó en ellas se pierde: hay respaldo en el vault)
ALTER TABLE public.client_social_images
  DROP CONSTRAINT IF EXISTS csi_clase_valida,
  DROP CONSTRAINT IF EXISTS csi_captura_con_motivo,
  DROP CONSTRAINT IF EXISTS csi_procedencia_valida,
  DROP CONSTRAINT IF EXISTS csi_lugar_con_fuente,
  DROP CONSTRAINT IF EXISTS csi_fecha_con_fuente,
  DROP COLUMN IF EXISTS clase,
  DROP COLUMN IF EXISTS clase_motivo,
  DROP COLUMN IF EXISTS procedencia,
  DROP COLUMN IF EXISTS oferta,
  DROP COLUMN IF EXISTS sede_id,
  DROP COLUMN IF EXISTS lugar_fuente,
  DROP COLUMN IF EXISTS fecha_origen,
  DROP COLUMN IF EXISTS fecha_fuente;
NOTIFY pgrst, 'reload schema';
