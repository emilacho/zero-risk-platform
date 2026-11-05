-- REVERSA de 202611052100_estudio_piezas.sql · borra la tabla del estudio y sus filas.
-- Los archivos en el almacén (`estudio/<client_id>/…`) y las filas del libro (`costs.service like 'estudio:%'`) NO se borran: el libro no se borra.
drop table if exists public.estudio_piezas;
