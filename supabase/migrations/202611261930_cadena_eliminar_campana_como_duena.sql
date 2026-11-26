-- 26-nov · 🔴 «Eliminar» fallaba en TODA campaña (Emilio, 18:02:38Z, campaña 36e66179) · CC4
-- `cadena_eliminar_campana` corría con los permisos de quien la llama (service_role), y service_role NO tiene DELETE, a propósito,
-- en los libros que solo se agregan: `oficina_artefactos` (202610090100), `oficina_mesa_aportes` (202610281500) y
-- `cadena_pedidos_de_campana` (202611201900). Su primer DELETE daba «permission denied» y la transacción entera se deshacía.
-- Arreglo: la función corre como su DUEÑA (postgres, dueña de esas tablas), con su search_path fijo. Los libros siguen sin DELETE para
-- todos los demás: la única forma de borrarlos es esta función, entera y en una transacción, y solo la puede llamar service_role.
BEGIN;

ALTER FUNCTION public.cadena_eliminar_campana(uuid) SECURITY DEFINER;
ALTER FUNCTION public.cadena_eliminar_campana(uuid) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.cadena_eliminar_campana(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cadena_eliminar_campana(uuid) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
