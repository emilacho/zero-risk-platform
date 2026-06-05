-- Canon canonical · Discovery output persistence (SPEC 2026-06-05).
--
-- Adds UNIQUE indexes on `client_competitive_landscape` (client_id, competitor_name)
-- and `client_icp_documents` (client_id, audience_segment) so the brain-PUSH
-- module can UPSERT on re-discovery without duplicating rows.
--
-- Pre-state probe (CC#3 2026-06-06) ·
--   client_competitive_landscape · 1 row total · 0 duplicates
--   client_icp_documents         · 2 rows total · 0 duplicates
-- Safe to add UNIQUE indexes without pre-cleanup.
--
-- Reversibility · DROP INDEX (idempotent via IF EXISTS) · no data loss.
-- Default-OFF brain push gate (`SALA_DISCOVERY_BRAIN_PUSH_ENABLED`) means
-- this migration is dormant until the flag flips · zero blast radius
-- shipping it without flipping the flag.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_client_competitive_landscape_unique_per_competitor
  ON client_competitive_landscape (client_id, competitor_name);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_client_icp_documents_unique_per_segment
  ON client_icp_documents (client_id, audience_segment);

COMMENT ON INDEX idx_client_competitive_landscape_unique_per_competitor IS
  'SPEC lazo agentico 2026-06-05 · Discovery output UPSERT key · enables idempotent re-discovery without duplicating competitor rows';

COMMENT ON INDEX idx_client_icp_documents_unique_per_segment IS
  'SPEC lazo agentico 2026-06-05 · Discovery output UPSERT key · enables idempotent re-discovery without duplicating ICP segment rows';

COMMIT;
