-- 31-oct · OFICINA DE MARKETING · T1 «lo afectado por la auditoría» (CC#1 · plan v3 firmado por CC#3) · PROPUESTA · NO APLICADA (se aplica en T9, publicación única, DESPUÉS de 202610312001)
--   La INDICACIÓN de tarea al redactor del plan es DATO, no texto pegado en un nodo: vive en `cadena_config.planeacion.indicacion`,
--   al lado del `redactor` que sembró 202610312001 (`{"redactor":"jefe-marketing"}`). El nodo de planeación (CC#2) lee `{redactor, indicacion}` y la pega al pedido.
--   Agnóstica de cliente e idioma: no fija idioma ni trato (eso lo dice el manual del cliente, adenda 31-oct 15:40Z). Solo dice QUIÉN escribe (el redactor, sin delegar) y DÓNDE se decide el idioma.
--   Idempotente: jsonb_set sobre la fila existente; si alguien ya puso una indicación distinta, NO se pisa (se respeta lo que haya).
-- Reversa: supabase/reversas/202610312004_cadena_config_planeacion_indicacion_REVERSA.sql
BEGIN;

DO $$
DECLARE v jsonb;
BEGIN
  SELECT valor INTO v FROM public.cadena_config WHERE clave = 'planeacion';
  IF v IS NULL THEN
    RAISE EXCEPTION 'falta la fila planeacion de cadena_config: aplica primero 202610312001';
  END IF;
  IF jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'cadena_config.planeacion no es un objeto (%): no se toca', jsonb_typeof(v);
  END IF;
END $$;

UPDATE public.cadena_config
   SET valor = jsonb_set(
                 valor,
                 '{indicacion}',
                 to_jsonb('Escribe tú el plan completo, de principio a fin: no delegues ninguna sección ni pidas que otro la escriba. Responde en el idioma y con el trato (tú, vos o usted) que fija el manual de marca del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.'::text),
                 true),
       actualizado_en = now()
 WHERE clave = 'planeacion'
   AND NOT (valor ? 'indicacion');

DO $$
DECLARE v jsonb;
BEGIN
  SELECT valor INTO v FROM public.cadena_config WHERE clave = 'planeacion';
  IF NOT (v ? 'redactor') OR NOT (v ? 'indicacion') THEN
    RAISE EXCEPTION 'cadena_config.planeacion debe traer redactor e indicacion; tiene %', v;
  END IF;
END $$;

COMMIT;
