-- 01-nov · ENCARGO Lenovo firmado por Emilio · equipo del manual · palabras con intención y fuente · CC1
-- `forbidden_words` no cambia: ninguna fila se toca y las listas actuales pasan solas a contexto de marca (`estilo`).
-- La columna nueva guarda solo lo que no es la omisión: [{texto, intencion:'legal'|'del_dueno'|'estilo', porque?, fuente?:{cita, origen?, fecha?, por?}}]. Quien la lee comprueba la cita.
-- REVERSA: supabase/reversas/202611012300_client_brand_books_palabras_con_intencion_REVERSA.sql
BEGIN;
ALTER TABLE public.client_brand_books ADD COLUMN IF NOT EXISTS palabras_con_intencion jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.client_brand_books DROP CONSTRAINT IF EXISTS client_brand_books_palabras_con_intencion_lista;
ALTER TABLE public.client_brand_books ADD CONSTRAINT client_brand_books_palabras_con_intencion_lista CHECK (jsonb_typeof(palabras_con_intencion) = 'array');
COMMIT;
NOTIFY pgrst, 'reload schema';
