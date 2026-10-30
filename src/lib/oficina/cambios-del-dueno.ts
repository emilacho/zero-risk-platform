/**
 * PEDIR CAMBIOS (29-oct · decisión de Emilio): el dueño mira una pieza CERRADA en la ventana de piezas y la devuelve a la oficina con un comentario y, si quiere, las láminas marcadas.
 * Se abre un encargo NUEVO (la versión siguiente) del mismo brief y la misma familia; la pieza vieja no se toca. Los cambios del dueño NO cuentan para el tope de 3 versiones (MAX_VERSIONES_POR_BRIEF):
 * tienen su propio límite de 5 rondas. El comentario viaja en `sala_ref.cambios_del_dueno` y se entrega a cada agente en su tarea (seccionDeCambiosDelDueno).
 */

export const MAX_RONDAS_DE_CAMBIOS = 5
export const TIPO_PIEZA_DE_OFICINA_BANDEJA = 'content_piece_review'

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * 30-oct · un intento de abrir la versión de cambios que murió AL ABRIR (cerró `fallido`, sin gastar nada, llevando `cambios_del_dueno`): no es una ronda del dueño ni una pieza que devolver.
 * No cuenta en las 5 rondas y no impide pedir los cambios otra vez cuando la causa se arregle; la pieza vuelve a la bandeja.
 */
export function esIntentoFallidoDeCambios(e: { estado?: unknown; gasto_usd?: unknown; sala_ref?: unknown }): boolean {
  return e.estado === 'fallido' && Number(e.gasto_usd ?? 0) === 0 && esObjeto(e.sala_ref) && esObjeto(e.sala_ref.cambios_del_dueno)
}

export interface CambiosDelDueno { ronda: number; comentario: string; laminas: number[]; desde_hitl: string; pedido_por: string }


/** valida lo que viaja en el sobre: devuelve los errores (vacío = bien) */
export function erroresDeCambios(c: unknown): string[] {
  if (!esObjeto(c)) return ['`cambios_del_dueno` debe ser un objeto']
  const e: string[] = []
  if (!(Number.isInteger(c.ronda) && (c.ronda as number) >= 1 && (c.ronda as number) <= MAX_RONDAS_DE_CAMBIOS)) e.push(`\`cambios_del_dueno.ronda\` debe ser un entero de 1 a ${MAX_RONDAS_DE_CAMBIOS}`)
  if (!(typeof c.comentario === 'string' && c.comentario.trim().length >= 5 && c.comentario.trim().length <= 2000)) e.push('`cambios_del_dueno.comentario` debe tener de 5 a 2000 caracteres')
  if (!(Array.isArray(c.laminas) && c.laminas.length <= 20 && c.laminas.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 20))) e.push('`cambios_del_dueno.laminas` debe ser una lista de números de lámina (1 a 20)')
  if (typeof c.desde_hitl !== 'string' || !c.desde_hitl) e.push('`cambios_del_dueno.desde_hitl` obligatorio')
  if (typeof c.pedido_por !== 'string' || !c.pedido_por) e.push('`cambios_del_dueno.pedido_por` obligatorio')
  return e
}

/** lo que cada agente lee al final de su tarea cuando el encargo nace de un pedido de cambios del dueño (vacío si no) */
export function seccionDeCambiosDelDueno(sala_ref: Record<string, unknown> | null | undefined): string {
  const c = sala_ref && esObjeto(sala_ref.cambios_del_dueno) ? sala_ref.cambios_del_dueno : null
  if (!c || erroresDeCambios(c).length) return ''
  const laminas = c.laminas as number[]
  return `\n\n## CAMBIOS QUE PIDE EL DUEÑO (ronda ${c.ronda} de ${MAX_RONDAS_DE_CAMBIOS})\nEsta pieza ya se entregó una vez y el dueño la devolvió. Es una orden suya, no una sugerencia: atiéndela primero y deja intacto lo que no pidió cambiar.\nSu comentario, tal cual: «${String(c.comentario).trim()}»\n${laminas.length ? `Láminas que marcó: ${laminas.join(', ')} (los cambios se concentran ahí).` : 'No marcó láminas concretas: el comentario vale para toda la pieza.'}`
}

