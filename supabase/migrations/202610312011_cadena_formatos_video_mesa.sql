-- 31-oct · T8 · VIDEO SOBRE LA HOJA (plan de construcción v3 T8 · CC#1) · DATO de la cadena: los formatos que filma el brazo de video tienen sala.
--   `cadena_formatos_por_red.familia = 'video_mesa'` para los formatos `espera_brazo` de VIDEO CORTO (instagram reel · facebook reel · tiktok video · youtube short).
--   FIRMA 01-nov punto 4: el video LARGO de YouTube (`youtube · video`) es FAMILIA PROPIA (gancho y ritmo propios; ahí aporta la retención): NO entra en `video_mesa`.
--   Su sala (`video_largo`) no existe todavía, así que ese formato sigue como hoy (familia NULL → la fila espera al brazo) hasta que se construya y se firme.
--   Con familia, `expandirPatron`/V20 (código T8) dejan de marcar esas filas `espera_video`: entran al lote, a la hoja (brief `### <fila> · <Red> · reel|video|short`)
--   y el sobre `producir` llega a la puerta de la oficina con `familia: video_mesa` (la mesa de video, plantilla sembrada INACTIVA en 202610312012).
--   SIN esta migración todo sigue como hoy (filas `espera_video`): es la única palanca; la reversa la devuelve a NULL.
--   Aditiva e idempotente: solo UPDATE de filas con familia NULL. NO APLICADA: se aplica en la publicación única (T9), DESPUÉS de 202610312012 o junto con ella (la puerta rechaza un sobre de video si la plantilla no existe).
--   Reversa: supabase/reversas/202610312011_cadena_formatos_video_mesa_REVERSA.sql
BEGIN;

UPDATE public.cadena_formatos_por_red
   SET familia = 'video_mesa'
 WHERE familia IS NULL
   AND produccion = 'espera_brazo'
   AND formato IN ('reel', 'video', 'short')
   AND NOT (red = 'youtube' AND formato = 'video');

COMMENT ON COLUMN public.cadena_formatos_por_red.familia IS 'CADENA · familia de la oficina de creativos que produce este formato (post_img · carrusel_ig_v1 · kit_historias · video_mesa). NULL = sin sala: imagen/carrusel/kit van a la pieza simple; un formato espera_brazo sin familia queda espera_video (T8). youtube·video (largo) es familia propia (video_largo, FIRMA 01-nov) y queda NULL hasta que exista su sala.';

DO $$
DECLARE n int; sin_sala int; largo int;
BEGIN
  SELECT count(*) INTO n FROM public.cadena_formatos_por_red WHERE familia = 'video_mesa' AND produccion = 'espera_brazo';
  SELECT count(*) INTO sin_sala FROM public.cadena_formatos_por_red WHERE produccion = 'espera_brazo' AND familia IS NULL AND formato IN ('reel', 'video', 'short') AND NOT (red = 'youtube' AND formato = 'video');
  SELECT count(*) INTO largo FROM public.cadena_formatos_por_red WHERE red = 'youtube' AND formato = 'video' AND familia = 'video_mesa';
  IF n < 4 THEN RAISE EXCEPTION 'se esperaban al menos 4 formatos de video corto con sala video_mesa y hay %', n; END IF;
  IF sin_sala <> 0 THEN RAISE EXCEPTION 'quedan % formatos de video corto sin sala', sin_sala; END IF;
  IF largo <> 0 THEN RAISE EXCEPTION 'el video largo de YouTube no entra en video_mesa (familia propia, FIRMA 01-nov)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
