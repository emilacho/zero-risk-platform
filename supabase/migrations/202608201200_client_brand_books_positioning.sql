-- CEREBRO · H1.2 · el casillero que falta
--
-- Causa raíz medida en H0.1 (raw/findings/2026-08-20-CC1-H0.1-mapeo-del-escritor.md):
-- `client_brand_books` no tiene columna `positioning`, así que el escritor
-- (src/app/api/brand-book/[clientId]/route.ts) guardaba el statement de posicionamiento
-- bajo `elevator_pitch`, con un comentario que declaraba la intención. Consecuencia:
-- los 5 manuales vivos indexan el posicionamiento en el cerebro bajo el rótulo equivocado
-- (5 filas en client_brain_chunks con section_label='elevator_pitch').
--
-- El arreglo no es re-rotular · es agregar el casillero.
--
-- ORDEN DE PUBLICACIÓN · BLOQUEANTE:
--   esta migración va ANTES que el código. El endpoint pasa a insertar `positioning`
--   en la fila · si la columna no existe, el INSERT falla con 42703 y ningún manual
--   se persiste. Aplicar primero · publicar el código después.
--
-- Sin backfill: las 5 filas existentes conservan el posicionamiento en `elevator_pitch`.
-- Re-etiquetar el histórico es tarea aparte (exige re-indexar el cerebro) · no entra acá.

ALTER TABLE client_brand_books
  ADD COLUMN IF NOT EXISTS positioning TEXT;

COMMENT ON COLUMN client_brand_books.positioning IS
  'Statement de posicionamiento del manual de marca. Columna propia desde H1.2 (2026-08-20) · antes se guardaba prestado en elevator_pitch. Las filas anteriores al 2026-08-20 tienen el posicionamiento en elevator_pitch y esta columna en NULL.';
