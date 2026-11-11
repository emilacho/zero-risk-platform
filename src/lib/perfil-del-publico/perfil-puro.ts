/**
 * PERFIL DEL PÚBLICO · lo PURO que comparten el cálculo del perfil (`perfil.ts`) y sus LECTORES (`lectores.ts`).
 * Sin base, sin red y sin módulos del servidor: así el lector se empaqueta entero para un nodo de n8n (T2b · el productor) sin copiar
 * reglas a mano. `perfil.ts` lo vuelve a exportar: nada de lo que ya lo usaba cambia.
 */
export const TIPO_DEL_INFORME = 'perfil_del_publico'

/** una cita de una o dos letras («que», «ya») está dentro de cualquier voz: no prueba nada */
export const LARGO_MINIMO_DE_UNA_FRASE = 4

/**
 * RED PROPIA contra instrucciones dentro del texto raspado. El filtro existente NO ve «ignora todas las instrucciones…» ni el inglés «ignore all
 * previous instructions» (medido 07-oct) y no se toca aquí: esta red se suma, no lo reemplaza.
 */
const PATRONES_DE_ORDEN: ReadonlyArray<RegExp> = [
  /\b(ignora|olvida|descarta|omite)\b[^.!?\n]{0,40}\b(instrucciones|reglas|indicaciones|lo anterior|tu (mensaje|prompt))\b/,
  /\b(ignore|disregard|forget)\b[^.!?\n]{0,40}\b(instructions|rules|above|previous|prior)\b/,
  /\b(system prompt|mensaje del sistema|prompt del sistema)\b/,
  /\b(eres ahora|ahora eres|you are now|act as|actua como)\b/,
  /<<<|>>>|\[voz:/,
]
export const pareceUnaOrden = (texto: string): boolean => {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return PATRONES_DE_ORDEN.some((r) => r.test(t))
}
