-- RETIRAR EL TROZO 343bed5c · la ficha de Mapas de OTRO negocio (Gualaceo) que quedó en el cerebro de Náufrago · CC#1 · 2026-10-02
-- (encargo Lenovo «sedes, mapas, cerebro y voz» punto 5 · firma de Emilio 02-oct «retirar el trozo de Gualaceo por el camino normal»).
--
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo y GO de Emilio, DESPUÉS de fusionar el cambio que hace que «mirar afuera» deje de escribir al cerebro
--    (si no, la siguiente pieza vuelve a dejar otro). Cero corridas vivas.
--
-- POR QUÉ ASÍ (el camino sancionado): el cerebro no tiene ruta de borrado (los trozos viejos «se quedan en la tabla», E116) y está prohibido borrar a mano por la vía de administración.
-- Una migración revisada, con CADA condición del trozo en el predicado, borra EXACTAMENTE esa fila o ninguna: si el id, el cliente, la sección, el origen del raspado o el texto no coinciden, no toca nada.
-- Es idempotente: la segunda vez no encuentra nada y avisa.
--
-- ARCHIVO PARA VOLVER ATRÁS: la fila completa (sin el vector) está en `raw/evidencia/2026-10-02-SEDES-MAPAS-CEREBRO-VOZ/trozo-343bed5c-ANTES-de-retirar.json`.
-- Reponerla = reinsertar esa fila y re-embeber con `/api/brain/reembed-source-row` (el vector se recalcula; no se guardó).
--
-- MEDIDO ANTES (02-oct): 1 fila con ese id · client_id 41dd3d62-d6de-4c9a-9996-6df78c1da118 (Náufrago) · section_label google_maps_competitive · metadata.apify_function google_maps_scraper · texto «El Naufrago Marisquería … Gualaceo».
DO $retirar$
DECLARE
  encontrados integer;
  borrados integer;
BEGIN
  SELECT count(*) INTO encontrados
    FROM public.client_brain_chunks
   WHERE id = '343bed5c-2333-4ea7-8f1b-5ef320269a29'
     AND client_id = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
     AND source_table = 'client_competitive_landscape'
     AND section_label = 'google_maps_competitive'
     AND metadata->>'apify_function' = 'google_maps_scraper'
     AND chunk_text LIKE '%Gualaceo%';

  IF encontrados = 0 THEN
    RAISE NOTICE 'trozo 343bed5c: no está (ya retirado) o no coincide con lo medido · NO se tocó nada';
    RETURN;
  END IF;

  DELETE FROM public.client_brain_chunks
   WHERE id = '343bed5c-2333-4ea7-8f1b-5ef320269a29'
     AND client_id = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
     AND source_table = 'client_competitive_landscape'
     AND section_label = 'google_maps_competitive'
     AND metadata->>'apify_function' = 'google_maps_scraper'
     AND chunk_text LIKE '%Gualaceo%';
  GET DIAGNOSTICS borrados = ROW_COUNT;

  IF borrados <> 1 THEN
    RAISE EXCEPTION 'trozo 343bed5c: se esperaba borrar 1 fila y se borraron % · se deshace todo', borrados;
  END IF;
  RAISE NOTICE 'trozo 343bed5c retirado (1 fila)';
END
$retirar$;
