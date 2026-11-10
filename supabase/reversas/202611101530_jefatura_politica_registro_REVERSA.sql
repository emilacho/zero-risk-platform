-- REVERSA de 202611101530_jefatura_politica_registro · borra SOLO la fila `registro` y solo si está apagada y ninguna revisión la usa (la FK de jefatura_revisiones lo exigiría igual).
BEGIN;

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jefatura_grading_policies WHERE artifact_type = 'registro' AND is_active) THEN
    RAISE EXCEPTION 'la fila registro está encendida: apagarla antes de revertir';
  END IF;
  IF EXISTS (SELECT 1 FROM public.jefatura_revisiones WHERE artifact_type = 'registro') THEN
    RAISE EXCEPTION 'hay revisiones de registro: la reversa no borra historial';
  END IF;
END
$guarda$;

DELETE FROM public.jefatura_grading_policies WHERE artifact_type = 'registro';

COMMIT;
