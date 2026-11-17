-- 202611171215 · RESPUESTA Lenovo 17-nov (punto 6 de creativos + fila 9 de quitar rejas): los largos de cada campo de la lámina del carrusel son DATO de la plantilla.
-- Agrega SOLO la clave `largos_de_lamina` a `limites` de carrusel_ig_v1 (los valores de siempre: antetítulo 24, titular 90, texto 220, llamado 32), igual que src/lib/oficina/plantillas/carrusel-ig-v1.ts.
-- Con el dato, una lámina que se pasa se devuelve al diseñador para acortar hasta 2 veces; después es aviso (nunca bloquea). La mesa no la hereda.
-- Ninguna otra clave de `limites`, ni pasos ni indicaciones cambian. Se niega con encargos vivos o si la clave ya existe. Reversa: supabase/reversas/202611171215_oficina_carrusel_largos_de_lamina_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171215: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND NOT (limites ? 'largos_de_lamina')) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171215: la plantilla del carrusel no está o ya trae largos_de_lamina; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo
SET limites = limites || jsonb_build_object('largos_de_lamina', '{"eyebrow": 24, "headline": 90, "body": 220, "cta": 32}'::jsonb)
WHERE familia = 'carrusel_ig_v1';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE familia = 'carrusel_ig_v1' AND limites->'largos_de_lamina' = '{"eyebrow": 24, "headline": 90, "body": 220, "cta": 32}'::jsonb) IS DISTINCT FROM 1
     OR (SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE limites ? 'largos_de_lamina') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611171215: la plantilla del carrusel no quedó con sus largos';
  END IF;
END $$;

COMMIT;
