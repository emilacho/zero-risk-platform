/**
 * 02-nov · SEÑAL-LENOVO 13:27Z punto (e) · EL ESLOGAN EN EL MANUAL ES CONTEXTO, NO UNA REGLA (ADENDA 3 de Emilio: «no truncar la creatividad con reglas duras»).
 * Hoy la lente dueña de la casilla del eslogan («[BB] Fan-out prep» → `editor-en-jefe`) recibe, cuando el código halla una frase del cliente (relevo 62, 10-oct):
 *   «FRASE PROPIA DEL CLIENTE (…): «x». Escríbela TAL CUAL, sin cambiar una letra, como PRIMERA opción de `tagline_opciones`…»
 * Eso es una regla. Pasa a ser contexto, igual que en planeación, brief y pieza (`eslogan-del-cliente.mjs`, «UNA FRASE QUE EL CLIENTE USA»):
 *   · se usa, se adapta o se propone otra mejor, libremente; las propuestas son aporte creativo y no se justifican;
 *   · solo si es realmente evidente que es su eslogan (p. ej. aparece como tal junto al nombre del negocio) el agente puede rotularla «eslogan actual» y decir por qué.
 * Sin frase hallada, el texto es VACÍO como hoy (byte por byte). No cambia ningún otro nodo ni la lógica de «uso de lo disponible» (que la cuenta como fuente, sin exigir que se copie).
 * `TOPE_TASK` se calcula con el largo de esta constante, así que el presupuesto de la evidencia se ajusta solo.
 */
import { cambiarCodigo } from './lib.mjs'

export const NODO = '[BB] Fan-out prep'

export const VIEJO = "'\\n\\nFRASE PROPIA DEL CLIENTE (la halló el código, literal, en su sitio y su perfil social): «' + _frase62 + '». Escríbela TAL CUAL, sin cambiar una letra, como PRIMERA opción de `tagline_opciones` (la casilla del eslogan del manual). Las demás opciones son propuestas tuyas.'"

export const NUEVO = "'\\n\\nUNA FRASE QUE EL CLIENTE USA (contexto, no una orden): «' + _frase62 + '». Úsala, adáptala o propón otra mejor, como prefieras. Solo si es evidente que es su eslogan, puedes rotularla «eslogan actual» y decir por qué.'"

export function construirEsloganDelManualComoContexto(f) {
  cambiarCodigo(f, NODO, VIEJO, NUEVO)
}
