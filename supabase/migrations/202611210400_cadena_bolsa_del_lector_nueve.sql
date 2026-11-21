-- 21-nov · opción A (GO de Lenovo 02:47Z) · decisión de Lenovo 03:37Z, fichas (a) · CC1
-- El tope de UNA llamada del lector de fichas pasa a US$ 3: cubre un turno al techo de salida (128K × US$ 20/M + 100K × US$ 4/M = 2,96),
-- porque el SDK solo corta por dinero ENTRE turnos. La bolsa PROPIA del lector tiene que alcanzar para los 3 intentos (MAXIMO_DE_INTENTOS),
-- y un intento caído cuenta su tope entero: 3 × 3 = US$ 9. Era US$ 2 (migración 202611172300): con el tope nuevo no cabría ni un intento.
-- Un tope no es gasto.
ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT 9;

-- Las campañas que tienen la bolsa del valor por omisión viejo (exactamente 2) suben a 9. Si no subieran, su lector no podría arrancar con el tope nuevo
-- (`prepararCorrida` exige gastado + tope ≤ bolsa). Una bolsa que alguien fijó a mano (distinta de 2) no se toca.
-- Lectura viva del 21-nov 03:4xZ: 3 campañas, las 3 en 2,00.
UPDATE public.cadena_campanas SET presupuesto_lector_usd = 9 WHERE presupuesto_lector_usd = 2;

COMMENT ON COLUMN public.cadena_campanas.presupuesto_lector_usd IS 'CADENA · la bolsa PROPIA del lector de fichas (US$). No sale del presupuesto de planificación. 3 intentos × el tope de un turno al techo (US$ 3) = 9 (21-nov).';
