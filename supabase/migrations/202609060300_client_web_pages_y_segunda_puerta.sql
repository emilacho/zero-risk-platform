-- =============================================================================
-- EL ATERRIZAJE DE LA WEB DEL CLIENTE · la tabla propia + LA SEGUNDA PUERTA
--
-- Por qué existe (medido 2026-09-06):
--   · 861 fragmentos en el cerebro, de 3 orígenes. Páginas web: CERO, nunca.
--   · La puerta de ingesta rechaza cualquier origen web: su lista blanca son 5 tablas.
--   · Y la BASE tiene el MISMO límite como CHECK. Son DOS puertas independientes:
--     cambiar sólo la del código hace que la puerta acepte y la base rechace AL ESCRIBIR
--     — el fallo aparece tarde y en silencio (precedente medido el 05-sep: la libreta
--     `costs` aceptaba en el nodo y devolvía 23514 en la base · quedó vacía sin que
--     nadie se enterara).
--
-- Por eso esta migración hace las DOS cosas: crea la tabla y amplía el CHECK.
-- Si se aplica sólo el cambio de código, no funciona. Si se aplica sólo esto, tampoco.
--
-- 🔴 El identificador de origen del cerebro es `uuid NOT NULL`. Una URL NO sirve.
--    Por eso la página se GUARDA como fila y su `id` es el que viaja al cerebro.
--    Sin fila, el `source_id` apuntaría a la nada y el rótulo sería mentira.
-- =============================================================================

-- ── 1 · la tabla propia · rótulo honesto (opción A) ──────────────────────────
CREATE TABLE IF NOT EXISTS client_web_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- la dirección del SITIO (la de arranque del recorrido), no la de cada página
  url           text NOT NULL,
  title         text,
  -- el texto de todo lo recorrido · las páginas van como secciones al cerebro
  content_text  text,
  pages_count   integer NOT NULL DEFAULT 0,
  crawled_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- re-leer el mismo sitio ACTUALIZA la fila · no duplica ⇒ el `source_id` es estable
  -- y el cerebro sobreescribe sus fragmentos en vez de acumular copias
  UNIQUE (client_id, url)
);

CREATE INDEX IF NOT EXISTS idx_client_web_pages_client ON client_web_pages(client_id);

-- ── 2 · LA SEGUNDA PUERTA · ampliar el CHECK del cerebro ─────────────────────
-- El CHECK original se declaró en línea (migración 202605220900), así que su nombre
-- lo puso Postgres. NO se asume cómo se llama: se busca. Si se asumiera y el nombre
-- fuera otro, el DROP no haría nada, el ADD crearía un SEGUNDO CHECK, y el viejo
-- seguiría rechazando · exactamente el fallo silencioso que esta migración evita.
DO $$
DECLARE
  nombre text;
BEGIN
  SELECT conname INTO nombre
    FROM pg_constraint
   WHERE conrelid = 'client_brain_chunks'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%source_table%'
   LIMIT 1;

  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE client_brain_chunks DROP CONSTRAINT %I', nombre);
    RAISE NOTICE 'CHECK viejo quitado · %', nombre;
  ELSE
    RAISE NOTICE 'no habia CHECK de source_table · se crea igual';
  END IF;
END $$;

ALTER TABLE client_brain_chunks
  ADD CONSTRAINT client_brain_chunks_source_table_check
  CHECK (source_table IN (
    'client_brand_books',
    'client_icp_documents',
    'client_voc_library',
    'client_competitive_landscape',
    'client_historical_outputs',
    'client_web_pages'          -- ← lo único que se agrega
  ));

-- ── 3 · comprobación · que la puerta nueva quedó abierta y las viejas también ──
DO $$
DECLARE
  def text;
  t text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conrelid = 'client_brain_chunks'::regclass
     AND conname = 'client_brain_chunks_source_table_check';

  FOREACH t IN ARRAY ARRAY['client_brand_books','client_icp_documents','client_voc_library',
                           'client_competitive_landscape','client_historical_outputs','client_web_pages']
  LOOP
    IF def NOT LIKE '%' || t || '%' THEN
      RAISE EXCEPTION 'el CHECK nuevo NO acepta % · migracion abortada', t;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'client_brain_chunks'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%source_table%') <> 1 THEN
    RAISE EXCEPTION 'quedo mas de un CHECK sobre source_table · uno viejo seguiria rechazando';
  END IF;

  RAISE NOTICE 'OK · un solo CHECK · acepta las 6 tablas';
END $$;
