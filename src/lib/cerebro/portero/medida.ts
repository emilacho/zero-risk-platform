/**
 * LA MEDIDA DE LA LISTA · «tokens» estimados con el factor MEDIDO, no con caracteres ÷ 2,8.
 *
 * Medición real 1 (CC#2, 20 llamadas): el contador de Sonnet 5.5 dio 1,91–1,96 caracteres por «token» sobre la instrucción + el mensaje
 * (W1: 23.807 caracteres → 12.440; W2: 19.638 → 10.011). Se usa 1,7 (margen ≈ 12 %): la estimación nunca queda por debajo del contador.
 * Una línea del formato D pesa ≈ 95–105 «tokens»: 20.000 de entrada alcanzan para ≈ 170–190 líneas de ese formato (depende del largo de cada línea).
 */
export const CARACTERES_POR_TOKEN = 1.7
/** lo máximo que se manda al modelo en UNA llamada (instrucción + pedido + lista); su peor caso con 1.500 de salida cuesta ≈ US$ 0,055 */
export const TOPE_DE_ENTRADA_EN_TOKENS = 20_000

export const estimarTokens = (caracteres: number): number => (caracteres <= 0 ? 0 : Math.ceil(caracteres / CARACTERES_POR_TOKEN))
