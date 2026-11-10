-- Reversa de 202611101800_estudio_almacen_50_mb.sql · vuelve a 20 MB. Los archivos ya guardados no se tocan.
begin;
update storage.buckets set file_size_limit = 20971520 where id = 'oficina-creativos' and file_size_limit = 52428800;
commit;
