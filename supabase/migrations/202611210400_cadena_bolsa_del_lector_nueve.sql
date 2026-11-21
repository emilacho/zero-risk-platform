-- 21-nov · opción A (GO de Lenovo 02:47Z) · decisión de Lenovo 03:37Z, fichas (a) · CC1
-- El tope de UNA llamada del lector de fichas pasa a US$ 3: cubre un turno al techo de salida (128K × US$ 20/M + 100K × US$ 4/M = 2,96),
-- porque el SDK solo corta por dinero ENTRE turnos. La bolsa PROPIA del lector tiene que alcanzar para los 3 intentos (MAXIMO_DE_INTENTOS),
-- y un intento caído cuenta su tope entero: 3 × 3 = US$ 9. Era US$ 2 (migración 202611172300): con el tope nuevo no cabría ni un intento.
-- Un tope no es gasto. Se puede aplicar dos veces sin daño (el DEFAULT es el mismo; la segunda vez ninguna fila vale 2).
ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT 9;

-- Las campañas con la bolsa en 2 (el valor por omisión viejo) suben a 9: si no, su lector no podría arrancar con el tope nuevo
-- (`prepararCorrida` exige gastado + tope ≤ bolsa). Límite conocido: un 2 puesto a mano no se distingue de uno que vino del DEFAULT.
-- Lectura viva del 21-nov 03:4xZ: 3 campañas, las 3 en 2,00, ninguna con la bolsa del lector escrita a mano (nacieron con el DEFAULT).
-- Candado: solo si la bolsa de planificación + la del lector nueva caben en el tope de gasto de la campaña (o no tiene tope).
-- Hoy: 36e66179 → 6 + 9 = 15 ≤ 150 · 2fd5f619 → 17,97 + 9 ≤ 300 (y su piso de planificación de 36 + 9 = 45 ≤ 300) · 31dc6aaf sin tope.
UPDATE public.cadena_campanas
   SET presupuesto_lector_usd = 9
 WHERE presupuesto_lector_usd = 2
   AND (tope_gasto_usd IS NULL OR presupuesto_planificacion_usd + 9 <= tope_gasto_usd);

COMMENT ON COLUMN public.cadena_campanas.presupuesto_lector_usd IS 'CADENA · la bolsa PROPIA del lector de fichas (US$). No sale del presupuesto de planificación. 3 intentos × el tope de un turno al techo (US$ 3) = 9 (21-nov).';

-- REVERSA (a mano, solo si se deshace la opción A; las filas que se subieron son las que ahora valen 9 y antes valían 2):
--   ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT 2;
--   UPDATE public.cadena_campanas SET presupuesto_lector_usd = 2 WHERE presupuesto_lector_usd = 9 AND id IN (<los ids que guardó la lectura de antes de aplicar>);
