/**
 * 17-nov · «creativos en cada paso» (GO Lenovo · firma de Emilio 07:18 · punto 1) · LA RUTA que manda una pieza a la versión CON MESA de su familia.
 * Regla de Emilio: una sola instancia creativa en el momento justo; nada de mesa sobre mesa. La mesa corta de la pieza REEMPLAZA la línea sin mesa (no se suma encima).
 *  · 20-nov · GO Lenovo «la mesa para todos los clientes» (firma de Emilio 12:37 Zúrich): ya NO hay lista de clientes (la vieja palanca `cadena_config.creativos_con_mesa`
 *    solo mandaba a la mesa a los clientes de la lista, y eso rompía la regla del sistema agnóstico). Toda pieza nueva de una familia con versión con mesa, de CUALQUIER cliente, va a su mesa.
 *  · Solo se rutea si la familia con mesa está ACTIVA (fila de `oficina_tipos_de_grupo`): con la mesa apagada, la pieza sigue por la ruta de siempre (nunca queda sin producir).
 *  · Las DOS puertas usan esta misma función: la de la oficina (qué plantilla abre) y el freno de la campaña (cuánto reserva por pieza), para que lo reservado sea lo de la familia que de verdad corre.
 * Puro: sin base ni red.
 */

/** la familia de siempre → su versión con mesa (dato del diseño; agregar una es una línea aquí y su plantilla activa) */
export const FAMILIA_CON_MESA: Readonly<Record<string, string>> = { kit_historias: 'kit_mesa', post_img: 'post_mesa', carrusel_ig_v1: 'carrusel_mesa' }

/**
 * la familia que de verdad corre: la versión con mesa si existe Y está activa; si no, la misma que llegó.
 * `mesaActiva` responde por la familia con mesa (la puerta lee la plantilla; el freno mira si tiene tope de familia activa).
 */
export function familiaConMesa(familia: string | null | undefined, mesaActiva: (familiaConMesa: string) => boolean): string | null {
  if (!familia) return familia ?? null
  const destino = FAMILIA_CON_MESA[familia]
  if (!destino || !mesaActiva(destino)) return familia
  return destino
}

/**
 * el freno de la campaña: lo esperado y el tope de la familia de siempre son los de su versión con mesa (que es la que corre), para cualquier cliente.
 * Si la versión con mesa no tiene tope (no está activa), esa familia queda IGUAL. Nunca baja una reserva: si la de siempre es mayor, se queda la mayor (del lado seguro).
 */
export function topesConMesa(topes: Record<string, number>, reservas: Record<string, number> | undefined): { topes: Record<string, number>; reservas: Record<string, number> | undefined } {
  const t = { ...topes }
  const r = reservas ? { ...reservas } : undefined
  for (const [de, a] of Object.entries(FAMILIA_CON_MESA)) {
    const topeMesa = topes[a]
    if (typeof topeMesa !== 'number' || !(topeMesa > 0)) continue
    t[de] = Math.max(topes[de] ?? 0, topeMesa)
    if (r) {
      // sin reserva propia, la versión con mesa cuenta su tope entero
      const esperadaMesa = typeof reservas?.[a] === 'number' && reservas[a] > 0 ? reservas[a] : topeMesa
      r[de] = Math.max(reservas?.[de] ?? 0, esperadaMesa)
    }
  }
  return { topes: t, reservas: r }
}

/**
 * la MISMA pieza puede nacer por la línea de siempre o por su versión con mesa: para contar versiones y reaperturas (y no abrir dos veces la misma pieza) se miran las dos.
 * Sin pareja, solo la propia. Puro.
 */
export function gruposHermanos(tipoDeGrupo: string): string[] {
  const pareja = FAMILIA_CON_MESA[tipoDeGrupo] ?? Object.entries(FAMILIA_CON_MESA).find(([, a]) => a === tipoDeGrupo)?.[0]
  return pareja ? [tipoDeGrupo, pareja] : [tipoDeGrupo]
}
