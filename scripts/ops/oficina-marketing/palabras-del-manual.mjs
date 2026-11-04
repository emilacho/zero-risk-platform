/**
 * LAS PALABRAS «PROHIBIDAS» DEL MANUAL SON CONTEXTO DE MARCA, NO UNA REJA · 01-nov · encargo de Emilio (ADENDA 1, punto 5): «seguro es una regla dura absurda».
 * Causa: el redactor/productor recibían «NUNCA sus palabras prohibidas» y los chequeos buscaban la palabra por coincidencia literal; una reseña de un cliente, citada y
 * atribuida, saltaba igual que un superlativo propio sin prueba. Qué hace (agnóstico, solo textos; no cambia la lógica ni la forma de ningún resultado):
 *   · el pedido al redactor/productor pasa de «NUNCA…» a «contexto de marca: razona la intención» (lo que el cliente no puede probar, no; una cita atribuida, sí);
 *   · el hallazgo `palabra_prohibida` se redacta como AVISO («coincidencia literal · no bloquea · comprueba la intención»). Ya NO era fatal: solo se declaraba.
 * Lo que NO toca: el manual ni su generador (dominio Cerebro), las listas «prohibido»/«negativos» que el brief escribe, ni los flujos de Brand Book.
 * Flujos: PQdIgbuFexuBsoh8 (Brief), BNXqlaX1oHSfZIpF (Parte por filas), lVCLzxQCKNkd3uS0 (Pieza).
 */
import { cambiarCodigo } from './lib.mjs'

const REGLA_VIEJA = "'10. Usa el vocabulario obligatorio del manual y NUNCA sus palabras prohibidas en lo que el brief pide (solo pueden aparecer en la lista «prohibido» y «negativos»).',"
export const REGLA_NUEVA = "'10. Usa el vocabulario obligatorio del manual. Las palabras «prohibidas» del manual son CONTEXTO DE MARCA, no una lista de bloqueo: razona la intención. No las uses como afirmación propia del cliente que no se pueda probar (p. ej. un superlativo sin prueba); una reseña de un cliente, citada y atribuida, es otra cosa. Si dudas, dilo en «limites».',"

const BRIEF_VIEJO = "falla('palabra_prohibida', idE, 'usa «' + prohibidas[w] + '», prohibida por el manual (búsqueda literal)')"
export const BRIEF_NUEVO = "falla('palabra_prohibida', idE, 'aparece «' + prohibidas[w] + '», que el manual marca como prohibida (coincidencia literal · AVISO, no bloquea): comprueba la intención; solo cuenta si es una afirmación propia que no se puede probar, no una cita atribuida')"

const HOJA_VIEJO = "detalle: 'la hoja usa «' + wn + '», prohibida por el manual, fuera de las listas de lo prohibido'"
export const HOJA_NUEVO = "detalle: 'la hoja contiene «' + wn + '», que el manual marca como prohibida (coincidencia literal · AVISO, no bloquea): comprueba la intención; solo cuenta si es una afirmación propia que no se puede probar, no una cita atribuida'"

const PRODUCTOR_VIEJO = 'NUNCA uses una palabra prohibida (solo pueden aparecer en la lista «prohibido» del brief, no en tu texto).'
export const PRODUCTOR_NUEVO = 'Las palabras «prohibidas» del manual son CONTEXTO DE MARCA: razona la intención y no las uses como afirmación propia que no se pueda probar (una reseña citada y atribuida es otra cosa). Lo que el brief lista en «prohibido» sí evítalo.'

const PIEZA_VIEJO = "falla('palabra_prohibida', 'usa «' + w + '», prohibida (búsqueda literal · puede ser una mención y no un uso)')"
export const PIEZA_NUEVO = "falla('palabra_prohibida', 'aparece «' + w + '» (coincidencia literal · AVISO, no bloquea): comprueba la intención; puede ser una cita atribuida y no un uso propio')"

export function construirPalabrasDelManual(f) {
  if (f.id === 'PQdIgbuFexuBsoh8' || f.id === 'BNXqlaX1oHSfZIpF') {
    cambiarCodigo(f, '③ Armar el cuerpo del redactor', REGLA_VIEJA, REGLA_NUEVA)
    cambiarCodigo(f, '④ Chequeos', BRIEF_VIEJO, BRIEF_NUEVO)
  }
  // el chequeo de la hoja solo existe una vez puesto el atajo de la hoja por código (construir-parte.mjs lo llama después); sobre el vivo sin atajo no hay nada que cambiar
  if (f.id === 'BNXqlaX1oHSfZIpF' && f.nodes.find((n) => n.name === '④ Chequeos').parameters.jsCode.includes(HOJA_VIEJO)) cambiarCodigo(f, '④ Chequeos', HOJA_VIEJO, HOJA_NUEVO)
  if (f.id === 'lVCLzxQCKNkd3uS0') {
    cambiarCodigo(f, '⑤ Armar el cuerpo del productor', PRODUCTOR_VIEJO, PRODUCTOR_NUEVO)
    cambiarCodigo(f, '⑦ Chequeos', PIEZA_VIEJO, PIEZA_NUEVO)
  }
}
