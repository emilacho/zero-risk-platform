-- REVERSA de 202610312007_agents_instalaciones_e1 · borra SOLO las 3 filas instaladas por E1, y solo si ninguna tiene fila viva en oficina_directorio (las siembra CC2 en T6: quitar esas primero).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.oficina_directorio') IS NOT NULL AND EXISTS (SELECT 1 FROM public.oficina_directorio WHERE agente IN ('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist') AND activo) THEN
    RAISE EXCEPTION 'alguno de los agentes E1 sigue activo en oficina_directorio: desactívalo antes de revertir';
  END IF;
END $$;
DELETE FROM public.agents WHERE name IN ('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist') AND identity_source LIKE 'canonical:msitarzewski/agency-agents@b37b5bb:%';
COMMIT;
NOTIFY pgrst, 'reload schema';
