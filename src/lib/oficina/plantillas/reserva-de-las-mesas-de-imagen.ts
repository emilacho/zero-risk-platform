/**
 * 20-nov · GO Lenovo 12:44Z (`2026-11-20-GO-LENOVO-a-CC2-reserva-por-pieza-mesas-de-imagen`) + 12:57Z (suma `carrusel_mesa`) · lo ESPERADO por pieza de las 3 mesas de imagen para el freno de la campaña.
 * Sin historia ni `limites.reserva_por_pieza_usd`, el freno aparta el tope ENTERO de la mesa (`topesConMesa` · con-mesa.ts): 43/45 con #1249.
 * `carrusel_mesa` tiene historia (1,58), pero de 3 piezas de ANTES de la mesa con propuestas: con #1248 todo carrusel apartaría 2,50 (el piso de `carrusel_ig_v1`), menos de lo que cuesta.
 * Es DATO (migración 202611201330), no cambia ningún tope ni paso. Con historia, `reservasDesdeLaHistoria` toma el MAYOR entre el promedio real y este dato (piso).
 * Medido en seco (US$ 0, solo lectura, 20-nov), con la misma cuenta que reserva `carrusel_mesa` (lo que gasta de verdad una pieza), paso por paso:
 *   · pasada de la mesa con propuestas: 2,49 (promedio de las 5 pasadas completas de `agent_invocations` `trabajo_tipo='pieza'`, 1,57–3,18)
 *   · 3 propuestas en borrador 0,04 · imagen final: post 0,01 (una) · kit y carrusel 0,16 (las láminas del carrusel) · observar 0,04 · jefatura de pieza 0,37 (15 revisiones)
 * No es el peor caso (ese lo cubre el tope del encargo).
 */
export const RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD = { post_mesa: 2.95, carrusel_mesa: 3.1, kit_mesa: 3.1 } as const
