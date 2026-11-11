-- REVERSA de 202611111200_jefatura_politica_colateral · borra SOLO la fila `colateral` y solo si está apagada y ninguna revisión la usa (la FK de jefatura_revisiones lo exigiría igual).
BEGIN;

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jefatura_grading_policies WHERE artifact_type = 'colateral' AND is_active) THEN
    RAISE EXCEPTION 'la fila colateral está encendida: apagarla antes de revertir';
  END IF;
  IF EXISTS (SELECT 1 FROM public.jefatura_revisiones WHERE artifact_type = 'colateral') THEN
    RAISE EXCEPTION 'hay revisiones colaterales: la reversa no borra historial';
  END IF;
END
$guarda$;

DELETE FROM public.jefatura_grading_policies WHERE artifact_type = 'colateral';

COMMIT;
