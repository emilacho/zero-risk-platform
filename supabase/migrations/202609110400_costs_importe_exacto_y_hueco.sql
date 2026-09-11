-- ═══════════════════════════════════════════════════════════════════════════
-- LA LIBRETA TIENE QUE ANOTAR LO QUE COSTÓ · 2026-09-11 · CC#3
-- Firma de Emilio 11-sep (`FIRMA-EMILIO-2026-09-11-la-libreta-y-apify-sin-limite.md`)
--   · punto 2 · columna de importe exacta
--   · punto 3 · el importe admite nulos
--
-- 🔴 POR QUÉ, medido: `amount_usd` guarda 2 decimales, y el proveedor cobra en
--    milésimas (medido: 0,0003 · 0,0032 · 0,021114). Todo lo menor a medio centavo
--    caía en 0,00 — el mismo cero que significa «no sé» que esto viene a eliminar.
--    Y el importe era NOT NULL, así que un costo desconocido NO TENÍA cómo decirse.
--
--    Después de esto:
--      amount_usd        = redondeado a centavos · NULL cuando NO se conoce
--      amount_usd_exact  = lo que dijo el proveedor, sin redondear
--      un 0 vuelve a significar «costó cero», y nada más.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.costs ALTER COLUMN amount_usd DROP NOT NULL;

ALTER TABLE public.costs ADD COLUMN IF NOT EXISTS amount_usd_exact numeric(14,6);

COMMENT ON COLUMN public.costs.amount_usd IS
  'Importe redondeado a centavos. NULL = el costo NO se conoce (nunca 0 para decir «no sé»).';

COMMENT ON COLUMN public.costs.amount_usd_exact IS
  'El costo exacto tal como lo devolvió el proveedor, sin redondear (6 decimales). '
  'Si está y amount_usd es 0,00, el gasto fue menor a medio centavo: NO fue gratis.';
