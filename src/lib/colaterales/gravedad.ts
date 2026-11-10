/**
 * MOTOR DE COLATERALES · tramo 2a · GRAVEDAD de una edición.
 *
 * Regla de Emilio (13:13Z) y CORRECCIÓN de Lenovo (13:16Z): JUZGAR lo hace el agente; el código solo VERIFICA lo exacto.
 * Sin listas de palabras, zonas, segmentos ni precios: el agente de retoques recibe la instrucción
 * «compara el antes y el después; si el cambio altera a quién le hablamos, qué ofrecemos o la idea central, es de fondo»
 * y devuelve su veredicto con una razón. El código comprueba que el veredicto exista, que la razón no esté vacía y que cite
 * el «antes» y el «después» tal como son. Si algo de eso falla, la edición se trata como DE FONDO (falla cerrado).
 * De fondo = no pasa por «Editar»: va por «Pedir cambios» (H4: pendiente con su confirmación única; ningún productor se llama antes).
 * Agnóstico: ninguna palabra de un cliente.
 */

/** la instrucción que va en el pedido del agente (una sola, para todos los clientes y rubros) */
export const INSTRUCCION_DE_GRAVEDAD =
  'Compara el ANTES y el DESPUÉS de la edición. Si el cambio altera a quién le hablamos, qué ofrecemos o la idea central, es «de fondo»; ' +
  'si no, no lo es. Devuelve «gravedad» con «de_fondo» (true/false) y «razon»: una frase que cite entre comillas el antes y el después tal como están.'

export interface VeredictoDeGravedad {
  de_fondo: boolean
  razon: string
}

export type Gravedad = 'fondo' | 'normal'

/**
 * Lo único que el código decide: si el veredicto del agente está completo y es verificable.
 * Falla cerrado: sin veredicto, sin razón, o una razón que no cita el antes y el después → 'fondo'.
 */
export function gravedadVerificada(v: VeredictoDeGravedad | null | undefined, antes: string, despues: string): { gravedad: Gravedad; motivo: string } {
  if (!v || typeof v.de_fondo !== 'boolean') return { gravedad: 'fondo', motivo: 'sin_veredicto' }
  const razon = (v.razon ?? '').trim()
  if (!razon) return { gravedad: 'fondo', motivo: 'sin_razon' }
  if (!razon.includes(antes) || !razon.includes(despues)) return { gravedad: 'fondo', motivo: 'razon_no_cita_antes_y_despues' }
  return { gravedad: v.de_fondo ? 'fondo' : 'normal', motivo: v.de_fondo ? 'agente_de_fondo' : 'agente_normal' }
}
