-- REVERSA de la oficina (sala 1) · CC#2 · 2026-10-09 · deja el esquema IDÉNTICO a antes.
-- 🔴 SE NIEGA A BORRAR DATOS: si hay algún encargo, o filas añadidas después de la siembra (plantillas, formatos), ABORTA con error y no borra nada. En ese caso: primero EXPORTAR.
-- 🔴 NO va en `supabase/migrations/` (una herramienta de migraciones la correría sola): vive en `supabase/reversas/`.
-- Orden: primero las tablas que apuntan a los encargos, luego los encargos, luego las plantillas y la config. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.oficina_encargos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.oficina_encargos' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: oficina_encargos tiene % filas. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.oficina_tipos_de_grupo') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.oficina_tipos_de_grupo WHERE tipo <> ALL (ARRAY[''post_img''])' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: oficina_tipos_de_grupo tiene % plantillas añadidas después de la siembra. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.oficina_entrega_formatos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.oficina_entrega_formatos WHERE NOT (red = ''instagram'' AND formato = ANY (ARRAY[''foto_1x1'',''foto_4x5'']))' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: oficina_entrega_formatos tiene % formatos añadidos después de la siembra. Exportar antes de borrar.', n; END IF;
  END IF;
  IF to_regclass('public.oficina_config') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.oficina_config WHERE estado <> ''apagada'' OR cardinality(familias_activas) > 0 OR cardinality(clientes_ensayo) > 0' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: la oficina no está apagada y sin familias. Apagarla antes de borrar.'; END IF;
  END IF;
END
$guarda$;
DROP TABLE IF EXISTS public.oficina_uso_de_fotos;
DROP TABLE IF EXISTS public.oficina_gastos;
DROP TABLE IF EXISTS public.oficina_fichas;
DROP TABLE IF EXISTS public.oficina_artefactos;
DROP TABLE IF EXISTS public.oficina_turnos;
DROP TABLE IF EXISTS public.oficina_encargos;
DROP TABLE IF EXISTS public.oficina_entrega_formatos;
DROP TABLE IF EXISTS public.oficina_config;
DROP TABLE IF EXISTS public.oficina_tipos_de_grupo;
COMMIT;
NOTIFY pgrst, 'reload schema';
