-- =============================================================================
-- LOS PERMISOS DE `client_web_pages` · lo encontró LA CORRIDA REAL
--
-- 🔴 Qué pasó (2026-09-06 03:20): la 17ª raspó bien, el cerebro aceptó 4 fragmentos…
-- y la tabla quedó con CERO filas. El nodo que guarda la página falló EN SILENCIO
-- (va colgado, con `neverError`), así que el identificador salió nulo y los
-- fragmentos quedaron apuntando al CLIENTE en vez de a la fila. Es decir: el rótulo
-- decía `client_web_pages` y no había ninguna página. Justo lo que se quería evitar.
--
-- Causa medida: la tabla se creó SIN los permisos que Supabase necesita para que
-- PostgREST la vea. `permission denied for table client_web_pages` (42501).
--   client_web_pages   → sólo TRUNCATE/REFERENCES/TRIGGER (privilegios por defecto)
--   client_brand_books → INSERT,SELECT,UPDATE,DELETE + RLS activado + política
--
-- Esta migración la deja IGUAL que las que funcionan. Se separó de la primera a
-- propósito: la primera ya está aplicada y verificada, y una migración que se
-- re-escribe después de aplicada es una migración que miente.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_web_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_web_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_web_pages TO anon;

-- Mismo patrón que `client_brain_chunks`: permisos por fila activados, con política
-- explícita para los dos roles que la usan.
ALTER TABLE client_web_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_pages_service_role_all ON client_web_pages;
CREATE POLICY web_pages_service_role_all ON client_web_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS web_pages_auth_full ON client_web_pages;
CREATE POLICY web_pages_auth_full ON client_web_pages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── comprobación · que quedó como las que funcionan ─────────────────────────
DO $$
DECLARE
  faltan text;
BEGIN
  SELECT string_agg(t.priv, ', ') INTO faltan
    FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS t(priv)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_name = 'client_web_pages'
        AND g.grantee = 'service_role'
        AND g.privilege_type = t.priv);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'a client_web_pages le siguen faltando permisos: %', faltan;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'client_web_pages') THEN
    RAISE EXCEPTION 'client_web_pages quedo SIN permisos por fila · las demas los tienen';
  END IF;

  RAISE NOTICE 'OK · permisos y RLS como las tablas que funcionan';
END $$;
