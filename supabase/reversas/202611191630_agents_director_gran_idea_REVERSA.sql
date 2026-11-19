-- REVERSA de 202611191630_agents_director_gran_idea · la gran idea vuelve a la dirección de `creative-director-mesa`.
-- La fila de `agents` se DESACTIVA (no se borra: sus invocaciones la referencian) y su tarjeta se apaga. Las mesas abiertas no cambian (directorio congelado).
BEGIN;
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'concepto:dirige'), actualizado_en = now()
  WHERE agente = 'creative-director-mesa' AND NOT ('concepto:dirige' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET activo = false, actualizado_en = now() WHERE agente = 'director-gran-idea';
UPDATE public.agents SET is_active = false, status = 'inactive' WHERE name = 'director-gran-idea';
DO $$
DECLARE n int; quien text;
BEGIN
  SELECT count(*), min(agente) INTO n, quien FROM public.oficina_directorio WHERE activo AND rol = 'direccion' AND 'concepto:dirige' = ANY(pertinente_en);
  IF n <> 1 OR quien <> 'creative-director-mesa' THEN RAISE EXCEPTION 'la gran idea debía volver a creative-director-mesa y tiene % (%)', n, quien; END IF;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
