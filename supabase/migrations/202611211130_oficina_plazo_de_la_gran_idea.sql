-- 202611211130 · EL PLAZO DE LA MESA DE LA GRAN IDEA · CC4 · 21-nov · US$ 0
-- GO de Lenovo 10:19Z (firma de Emilio 10:18Z): la dirección de la gran idea reserva US$ 10 por turno y su turno tiene un plazo coherente con eso (250 min,
-- `PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN` en `src/lib/oficina/mesa/tipos.ts`). El plazo de la mesa entera (90 min) no deja caber UN turno así: el vigía cerraría la mesa
-- antes. Pasa a 90 + 250 = 340 min (lo de siempre más un turno de la dirección al techo).
-- Solo DATO: limites.plazo_mesa_min de concepto_mesa, + version. Se niega con encargos vivos de la familia y si la fila no es la leída (90).
-- Reversa: supabase/reversas/202611211130_oficina_plazo_de_la_gran_idea_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia = 'concepto_mesa') THEN
    RAISE EXCEPTION '202611211130: hay una mesa de gran idea viva; esperar a que cierre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND (g.limites->>'plazo_mesa_min')::numeric = 90) THEN
    RAISE EXCEPTION '202611211130: el plazo de concepto_mesa no es el leído (90); no se toca';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo g
SET limites = g.limites || jsonb_build_object('plazo_mesa_min', 340), version = g.version + 1
WHERE g.tipo = 'concepto_mesa';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo g WHERE g.tipo = 'concepto_mesa' AND (g.limites->>'plazo_mesa_min')::numeric = 340) THEN
    RAISE EXCEPTION '202611211130: el plazo de concepto_mesa no quedó en 340';
  END IF;
END $$;

COMMIT;
