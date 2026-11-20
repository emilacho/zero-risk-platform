/**
 * 20-nov · TOPES DE LAS 3 MESAS DE IMAGEN (CC4 · decisión (a) de Lenovo 12:09Z, regla firmada por Emilio: topes = 2–3× lo estimado, límites al máximo; un tope NO es gasto).
 * Por qué: `202611181700` subió la cota de la pasada de la mesa a 9,54 y dejó el tope de esas familias en 15/15/18. Con eso ninguna cubre su peor caso
 * (post 31,06, carrusel 32,06, kit 32,06 · `coberturaDelTope`) y toda pieza nueva vuelve con 409 `tope_no_cubre` al abrir (`orquestador.ts`).
 * La cifra cubre el peor caso de HOY y además una vuelta entera de la segunda mirada de GPT (PLAN v4, rama aparte): una pasada más de la mesa + todo
 * lo que sigue + las rondas del dueño. Medido en seco sobre las filas vivas con esa plantilla: post 42,78 → 43; carrusel y kit 44,08 → 45 (44 no alcanza).
 * Solo dato: la migración `202611201100` los escribe en columna y límite.
 */
export const TOPES_DE_LAS_MESAS_DE_IMAGEN_USD = { post_mesa: 43, carrusel_mesa: 45, kit_mesa: 45 } as const
/** lo que tenían las filas vivas al medir (lectura del 20-nov) · la migración se niega si no es esto */
export const TOPES_LEIDOS_DE_LAS_MESAS_DE_IMAGEN_USD = { post_mesa: 15, carrusel_mesa: 15, kit_mesa: 18 } as const
