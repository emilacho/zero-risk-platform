-- GO-LENOVO 10-nov 14:55Z · el almacén de la oficina (oficina-creativos) admite 50 MB por archivo (antes 20 MB).
-- 50 MB es también el tope del proyecto (storage config fileSizeLimit 52428800): más arriba no sirve sin cambiar el proyecto.
-- Solo cambia si sigue en 20 MB (lo medido el 10-nov). Reversa: supabase/reversas/202611101700_estudio_almacen_50_mb_REVERSA.sql
begin;
update storage.buckets set file_size_limit = 52428800 where id = 'oficina-creativos' and file_size_limit = 20971520;
commit;
