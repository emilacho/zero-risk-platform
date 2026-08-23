-- ═══════════════════════════════════════════════════════════════════════════
-- B1 · el vínculo canónico entre fichas del MISMO negocio
-- Plan · raw/tasks/2026-08-15-LENOVO-arreglo-agujeros-freno-de-gasto.md (agujero B)
-- Firmado por Emilio · 2026-08-23
--
-- POR QUÉ UN VÍNCULO DECLARADO Y NO UNA CLAVE DERIVADA
-- El plan proponía sumar el gasto "también por una clave estable (slug o dominio)".
-- Medido el 2026-08-22 sobre los 6 clientes reales, eso NO cierra el caso vivo:
--     53b05ecb  name="Cliente 53b05ecb"     slug="cliente-53b05ecb"    website=null  domain=null
--     e388a370  name="Peniche Surf Escape"  slug="peniche-surf-escape" website=...   domain=null
--   · `domain` está VACÍA en las 6 filas · `website_url` es nula en una de las dos
--   · no comparten slug ni nombre — y no por casualidad: la ficha fantasma nació con
--     un nombre de relleno GENERADO DE SU PROPIO UUID, justo porque el sistema no
--     supo reconocerla.
-- La información que uniría las dos fichas NO EXISTE en la fila ⇒ hay que declararla.
--
-- ESTO NO FUSIONA NI BORRA NADA. Sólo anota que dos fichas son el mismo negocio.
-- La identidad del cliente sigue siendo obra aparte y diferida (plan §1.B).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS canonical_client_id UUID REFERENCES public.clients(id);

COMMENT ON COLUMN public.clients.canonical_client_id IS
  'B1 · apunta a la ficha canónica cuando este registro es un duplicado del mismo '
  'negocio. NULL = esta ficha es la canónica. El freno de gasto §150 acumula por '
  'la familia (coalesce(canonical_client_id, id)) para que la duplicación no parta '
  'la cuenta. No fusiona filas · no toca la identidad.';

-- Índice para la consulta del freno (busca hermanas por el canónico).
CREATE INDEX IF NOT EXISTS clients_canonical_client_id_idx
  ON public.clients (canonical_client_id)
  WHERE canonical_client_id IS NOT NULL;

-- Una ficha canónica no puede a su vez apuntar a otra (evita cadenas y ciclos:
-- el freno resuelve UN salto, no un grafo).
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_canonical_not_self;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_canonical_not_self
  CHECK (canonical_client_id IS NULL OR canonical_client_id <> id);

-- ───────────────────────────────────────────────────────────────────────────
-- EL CASO VIVO · Peniche · decidido por Emilio 2026-08-23
--   QUEDA canónica  · e388a370-910f-4ee7-9a48-4a79393b8cb4 "Peniche Surf Escape"
--                     (485 fragmentos · 40 perfiles · 51 competidores · sitio y
--                      redes declaradas · país Portugal · $18,65 ya pagados)
--   APUNTA a ésa    · 53b05ecb-670a-4411-8a94-427e8dea6d2b "Cliente 53b05ecb"
--                     (52 fragmentos · país EC equivocado · tiene el único manual)
--
-- Efecto medible: el gasto de Peniche deja de contarse partido ($18,65 + $5,37)
-- y pasa a acumular en una sola cuenta contra el techo de $8/24h.
--
-- Reversión: UPDATE public.clients SET canonical_client_id = NULL
--            WHERE id = '53b05ecb-670a-4411-8a94-427e8dea6d2b';
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.clients
   SET canonical_client_id = 'e388a370-910f-4ee7-9a48-4a79393b8cb4'
 WHERE id = '53b05ecb-670a-4411-8a94-427e8dea6d2b'
   AND canonical_client_id IS DISTINCT FROM 'e388a370-910f-4ee7-9a48-4a79393b8cb4';
