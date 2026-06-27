-- Sprint-brain §144 · Task 2 · ingesta VOC · clave de dedup idempotente
-- 2026-06-27 · CC#1 · branch + §144 GO · single-file R10
--
-- client_voc_library no tenía clave de dedup (solo PK por id). La ingesta de
-- feedback/testimonios necesita idempotencia (canon loop · guardrail #3) ·
-- mismo (cliente · fuente · texto) NO debe duplicar fila ni chunk.
--
-- Agrega columna generada `dedup_hash` (md5 estable de client_id|source|quote_text)
-- + UNIQUE · habilita upsert ON CONFLICT (dedup_hash) desde el pipeline.
--
-- Idempotente · ADD COLUMN IF NOT EXISTS + unique index IF NOT EXISTS.

BEGIN;

ALTER TABLE client_voc_library
  ADD COLUMN IF NOT EXISTS dedup_hash text
  GENERATED ALWAYS AS (
    md5(coalesce(client_id::text, '') || '|' || coalesce(source, '') || '|' || coalesce(quote_text, ''))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voc_dedup_hash
  ON client_voc_library (dedup_hash);

COMMIT;
