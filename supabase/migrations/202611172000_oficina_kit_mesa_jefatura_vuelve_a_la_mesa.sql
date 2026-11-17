-- 202611172000 · LA JEFATURA DEVUELVE UNA VEZ A LA MESA (kit_mesa) · CC3 · GO Lenovo «arreglo de la historia pobre» punto (d) · US$ 0
-- Solo DATO: el paso `jefatura` de `kit_mesa` suma `vuelve_a` = {paso: mesa, max: 1, si: respuesta_imagen.vuelve_a_la_mesa = true}.
-- Efecto: si la revisión de la jefatura deja desacuerdos (p. ej. falta en la historia un dato que el brief pide), la pieza vuelve UNA vez a la mesa con esos desacuerdos
-- como corrección; la dirección integra, la mesa traduce otra vez y la jefatura revisa de nuevo. Solo si sigue, va a la bandeja marcada (como hoy).
-- El código vuelve solo si la vuelta cabe en el tope del encargo; sin este dato, nunca vuelve. Es el dato EXACTO de src/lib/oficina/plantillas/mesa.ts (KIT_MESA); una prueba lo mantiene igual.
-- No toca límites, indicaciones, tope ni `activo`. Se niega con encargos vivos (no cuenta el que solo espera al dueño). Reversa: supabase/reversas/202611172000_oficina_kit_mesa_jefatura_vuelve_a_la_mesa_REVERSA.sql
BEGIN;

DO $$
BEGIN
  -- encargo vivo = abierto o en paso, SALVO el que solo espera al dueño (todos sus turnos abiertos son `dueno`, y tiene al menos uno): el motor solo responde
  --   `esperar_dueno` y no gasta (regla de Lenovo 13:26Z; la misma guarda de 202611171900_oficina_video_t7b, CC2, certificada por CC6). Cualquier otro encargo vivo frena.
  IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND NOT (
       EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo = 'dueno')
       AND NOT EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo <> 'dueno'))) THEN
    RAISE EXCEPTION '202611172000: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p WHERE t.tipo = 'kit_mesa' AND p->>'clave' = 'jefatura') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611172000: kit_mesa no tiene exactamente un paso jefatura; no se toca';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p WHERE t.tipo = 'kit_mesa' AND p ? 'vuelve_a') THEN
    RAISE EXCEPTION '202611172000: kit_mesa ya tiene alguna vuelta; no se pisa';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo t
SET pasos = (
  SELECT jsonb_agg(CASE WHEN p->>'clave' = 'jefatura' THEN p || jsonb_build_object('vuelve_a', $vuelta${"paso":"mesa","max":1,"si":{"tipo":"si_artefacto","artefacto":"respuesta_imagen","campo":"vuelve_a_la_mesa","igual":true}}$vuelta$::jsonb) ELSE p END ORDER BY i)
  FROM jsonb_array_elements(t.pasos) WITH ORDINALITY AS x(p, i)
)
WHERE t.tipo = 'kit_mesa';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) p WHERE t.tipo = 'kit_mesa' AND p->>'clave' = 'jefatura' AND p->'vuelve_a'->>'paso' = 'mesa' AND (p->'vuelve_a'->>'max')::int = 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '202611172000: el paso jefatura de kit_mesa no quedó con su vuelta a la mesa';
  END IF;
END $$;

COMMIT;
