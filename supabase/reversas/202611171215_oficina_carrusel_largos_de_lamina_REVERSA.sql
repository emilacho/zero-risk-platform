-- REVERSA de 202611171215_oficina_carrusel_largos_de_lamina: quita SOLO la clave `largos_de_lamina` de `limites` del carrusel. Se niega con encargos vivos o si la clave no tiene el valor exacto.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171215-reversa: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND limites->'largos_de_lamina' = '{"eyebrow": 24, "headline": 90, "body": 220, "cta": 32}'::jsonb) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171215-reversa: la plantilla del carrusel no trae los largos exactos; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET limites = limites - 'largos_de_lamina'
WHERE familia = 'carrusel_ig_v1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE limites ? 'largos_de_lamina') THEN
    RAISE EXCEPTION '202611171215-reversa: quedaron largos_de_lamina';
  END IF;
END $$;

COMMIT;
