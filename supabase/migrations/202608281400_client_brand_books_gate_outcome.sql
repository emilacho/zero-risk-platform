-- Sprint B · pieza (e) · el manual sale SIEMPRE, y el que no alcanzó la vara sale MARCADO
--
-- Decisión de Emilio · §144 · 2026-08-28: se acaba la retención silenciosa.
--
-- POR QUÉ HACE FALTA UNA COLUMNA Y NO ALCANZA `content_text`:
--   el veredicto YA se guarda dentro de `content_text` (fidelity_passed, scores,
--   threshold, approved_by, approved_at · verificado en las 5 filas vivas). Lo que
--   NO se puede hoy es VERLO: hay que parsear el JSON fila por fila. Y «sale
--   marcado» significa que la marca se ve listando la tabla.
--
-- ESTADO MEDIDO QUE ESTA PIEZA CIERRA (2026-08-28):
--   8 corridas juzgadas · 5 manuales escritos · 3 sin manual
--   las 5 publicadas aprobaron en la PRIMERA pasada
--   las 2 que entraron al lazo de corrección terminaron SIN manual → 0 en 2 de 2
--   Peniche sigue sin manual después de DOS corridas juzgadas
--   ⇒ sin manual publicado el cimiento no se promueve y la segunda fase no corre
--
-- Valores · 'paso_la_vara' | 'salio_al_tope'
--   NULL = fila anterior a esta pieza. NO se rellena hacia atrás: las 5 filas vivas
--   aprobaron por la vara (`fidelity_passed: true` en su `content_text`), pero
--   inferirlo y escribirlo sería reescribir historia con una deducción. Si se
--   quisiera, es una migración aparte y explícita.

ALTER TABLE client_brand_books
  ADD COLUMN IF NOT EXISTS gate_outcome TEXT;

COMMENT ON COLUMN client_brand_books.gate_outcome IS
  'Veredicto de la vara de fidelidad con el que se publicó el manual. paso_la_vara = alcanzó el umbral 0,85 en los campos gateados. salio_al_tope = se agotaron las 3 correcciones sin alcanzarlo y se publicó marcado (§144 Emilio 2026-08-28 · antes se retenía en silencio). NULL = fila anterior a la pieza (e) del Sprint B.';
