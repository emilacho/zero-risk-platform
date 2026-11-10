-- GO-LENOVO 10-nov 18:14Z punto 2 (la raíz del hallazgo de #1002, medida por CC6): los valores por omisión de `postgres` en `public`
-- hacen nacer cada tabla nueva con vaciar/referencias/disparadores/mantenimiento para el servidor, y cada contador nuevo con UPDATE (setval)
-- para anónimo, con sesión y servidor. Medido en vivo 10-nov 18:31Z: tablas service_role=Dxtm · contadores anon=w, authenticated=w, service_role=w.
-- Solo cambia lo que NACE desde ahora: ningún objeto existente cambia (lo prueba la huella de los acl de public antes y después).
-- Fuera: supabase_admin (lo de Supabase) y los demás esquemas. Las tablas del cerebro no se tocan (esto no toca ninguna tabla).
-- Consecuencia para migraciones futuras: un contador nuevo ya no le da UPDATE a nadie, así que la migración que lo crea tiene que dar
-- USAGE al servidor (como hizo 202611102030); sin eso, el servidor no saca números.
-- Reversa exacta: supabase/reversas/202611102300_valores_por_omision_public_sin_permisos_de_mas_REVERSA.sql
begin;
alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from service_role;
alter default privileges for role postgres in schema public revoke update on sequences from anon, authenticated, service_role;
commit;
