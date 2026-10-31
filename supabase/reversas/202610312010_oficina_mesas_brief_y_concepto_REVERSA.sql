-- REVERSA de 202610312010_oficina_mesas_brief_y_concepto.sql · CC#1 · 2026-10-31 · NO APLICADA
-- Se NIEGA si hay encargos de estas mesas (evidencia de uso). Quita las dos plantillas, las pertinencias `brief`/`concepto*` y las dos filas del directorio que esta migración agregó.
-- 🔴 CUANDO LA GUARDA SALTA, ESTE ARCHIVO DEJA SU TRANSACCIÓN ABIERTA: en una SESIÓN INTERACTIVA hace falta un ROLLBACK a mano.
BEGIN;

DO $t1br$
DECLARE n bigint := 0;
BEGIN
  IF to_regclass('public.oficina_encargos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.oficina_encargos WHERE tipo IN (''brief_mesa'',''concepto_mesa'')' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'oficina_encargos: hay % encargo(s) de brief_mesa/concepto_mesa; no se revierte. Si usas una sesión interactiva, ROLLBACK.', n; END IF;
  END IF;
END
$t1br$;

UPDATE public.oficina_directorio SET pertinente_en = array_remove(array_remove(array_remove(pertinente_en, 'concepto'), 'concepto:si_instagram'), 'concepto:si_video'), actualizado_en = now()
  WHERE 'concepto' = ANY(pertinente_en) OR 'concepto:si_instagram' = ANY(pertinente_en) OR 'concepto:si_video' = ANY(pertinente_en);
DELETE FROM public.oficina_directorio WHERE agente = 'campaign-brief-agent' AND rol = 'direccion' AND pertinente_en = ARRAY['brief'];
DELETE FROM public.oficina_directorio WHERE agente = 'video-editor' AND rol = 'miembro' AND pertinente_en = ARRAY[]::text[];

DELETE FROM public.oficina_tipos_de_grupo WHERE tipo IN ('brief_mesa', 'concepto_mesa');

COMMIT;
NOTIFY pgrst, 'reload schema';
