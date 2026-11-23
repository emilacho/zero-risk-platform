-- 23-nov · firma de Emilio 20:35 Zúrich («subelo a 10») · GO de Lenovo 19:37Z · CC4
-- El tope de UNA llamada de fichas (y de calendario y fechas) pasa de US$ 3 a US$ 10. La bolsa PROPIA del lector tiene que alcanzar para los
-- 3 intentos (MAXIMO_DE_INTENTOS), y un intento caído cuenta su tope entero: 3 × 10 = US$ 30. Con 9, el lector arrancaría un solo intento
-- (`prepararCorrida` exige gastado + tope ≤ bolsa). Un tope no es gasto. Se puede aplicar dos veces sin daño (la segunda vez ninguna fila vale 9).
ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT 30;

-- Las campañas con la bolsa en 9 (el DEFAULT anterior, o la subida de 202611210400) suben a 30.
-- Lectura viva del 23-nov 19:4xZ: 2fd5f619 → 9 (tope 300, planificación 17,97) · 31dc6aaf → 9 (sin tope) · 36e66179 → 2.
-- Candado: solo si la bolsa de planificación + la del lector nueva caben en el tope de gasto de la campaña (o no tiene tope).
-- Hoy: 2fd5f619 → 17,97 + 30 ≤ 300 (y con su planificación crecida al piso nuevo, 120 + 30 = 150 ≤ 300) · 31dc6aaf sin tope.
-- 🔴 36e66179 NO se toca (regla de Emilio): se excluye por id y su fila queda igual.
UPDATE public.cadena_campanas
   SET presupuesto_lector_usd = 30
 WHERE presupuesto_lector_usd = 9
   AND (tope_gasto_usd IS NULL OR presupuesto_planificacion_usd + 30 <= tope_gasto_usd)
   AND id <> '36e66179-3061-4a7d-94db-932a900d9515';

COMMENT ON COLUMN public.cadena_campanas.presupuesto_lector_usd IS 'CADENA · la bolsa PROPIA del lector de fichas (US$). No sale del presupuesto de planificación. 3 intentos × el tope de una llamada de fichas (US$ 10) = 30 (23-nov).';

-- REVERSA (a mano; las filas que se subieron son las que ahora valen 30 y antes valían 9, según la lectura de antes de aplicar):
--   ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT 9;
--   UPDATE public.cadena_campanas SET presupuesto_lector_usd = 9 WHERE presupuesto_lector_usd = 30 AND id IN (<los ids que guardó la lectura de antes de aplicar>);
