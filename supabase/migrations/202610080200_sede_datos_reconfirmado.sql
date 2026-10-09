-- RECONFIRMACIÓN DE DATOS DE SEDE · CC#1 · 2026-10-08 · relevo 19 (firma de Emilio «SI APROBADO» · arreglos chicos).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con respaldo del día y 0 corridas vivas, ANTES de fusionar el PR (el lector nuevo pide esta columna).
-- Cuando el recolector (o la corrida diaria) vuelve a leer un dato de sede y sigue IGUAL, no crea una observación nueva: anota aquí la fecha de esa lectura.
-- `observado_en` NO se toca (es cuándo se vio por primera vez ese valor); la vigencia se mide desde el MÁS NUEVO de los dos.
-- 🔴 SOLO ADITIVA: 1 columna ANULABLE, sin valor por defecto, sin índice. Las filas existentes quedan con NULL (= nunca reconfirmado). Sin permisos nuevos.
-- 🔴 IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). Una sola transacción.
-- REVERSA: `supabase/reversas/202610080200_sede_datos_reconfirmado_REVERSA.sql` (se niega a borrar si la columna ya tiene datos).
BEGIN;
ALTER TABLE public.client_sede_datos ADD COLUMN IF NOT EXISTS reconfirmado_en timestamptz;
COMMENT ON COLUMN public.client_sede_datos.reconfirmado_en IS 'Última vez que se volvió a leer este MISMO dato y siguió igual (sin crear fila nueva). NULL = nunca reconfirmado. La vigencia usa max(observado_en, reconfirmado_en).';
COMMIT;
-- 🔴 una columna nueva no la ve PostgREST hasta recargar su catálogo
NOTIFY pgrst, 'reload schema';
