-- REVERSA de 202610312011 · los formatos de video vuelven a NO tener sala (familia NULL): las filas nuevas vuelven a `espera_video`, como antes de T8.
-- Se niega si hay encargos de la mesa de video en curso (una pieza de video abierta se termina con la sala que la abrió; no se le quita el camino a media pieza).
-- Las filas del calendario que YA entraron al lote como video no se tocan (el estado de una fila no se reescribe desde aquí).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'video_mesa' AND estado IN ('abierto', 'en_paso')) THEN RAISE EXCEPTION 'hay encargos de la mesa de video en curso: no se quita la sala'; END IF;
END $$;
UPDATE public.cadena_formatos_por_red SET familia = NULL WHERE familia = 'video_mesa';
COMMENT ON COLUMN public.cadena_formatos_por_red.familia IS 'CADENA · familia de la oficina de creativos que produce este formato (post_img · carrusel_ig_v1 · kit_historias). NULL = sin sala: va a la pieza simple.';
COMMIT;
NOTIFY pgrst, 'reload schema';
