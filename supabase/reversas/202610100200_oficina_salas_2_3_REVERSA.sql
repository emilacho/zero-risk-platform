-- REVERSA de las salas 2 y 3 (datos) · CC#2 · 2026-10-10 · deja las tablas como estaban tras la migración de la sala 1.
-- 🔴 SE NIEGA A BORRAR SI HAY HISTORIA: si algún encargo usa una de las dos plantillas, ABORTA y no borra nada (exportar antes).
-- 🔴 NO va en supabase/migrations/ (una herramienta de migraciones la correría sola): vive en supabase/reversas/. Una sola transacción.
BEGIN;
DO $guarda$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.oficina_encargos') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.oficina_encargos WHERE tipo_de_grupo IN ('carrusel_ig_v1', 'kit_historias');
    IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA: % encargo(s) usan carrusel_ig_v1 o kit_historias. Exportar antes de borrar.', n; END IF;
  END IF;
END
$guarda$;
DELETE FROM public.oficina_tipos_de_grupo WHERE tipo IN ('carrusel_ig_v1', 'kit_historias');
DELETE FROM public.oficina_entrega_formatos WHERE (red, formato) IN (('instagram', 'carrusel'), ('instagram', 'historia'), ('whatsapp', 'estado')) AND verificado = false;
COMMIT;
NOTIFY pgrst, 'reload schema';
