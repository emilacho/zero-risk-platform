/**
 * 01-nov · «QUÉ CAMBIÓ» POR CÓDIGO · parte de CC2 del punto 6 de CC1 (LISTO-CC1-para-certificar-que-cambio-por-codigo).
 * La sección «Qué cambió» de las versiones B y C del plan ya no la escribe el modelo: `elegir_version` (plataforma) devuelve `textos_a_guardar: { B?: texto, C?: texto }` con la sección armada por código y pegada al plan.
 * Aquí, al guardar cada versión, el flujo usa ese texto como `content` / `content_text` si existe; si no existe (palanca vieja, versión sin texto, algo no-texto) guarda lo de hoy, byte por byte.
 *   · «JEF · plan · el plan de guardado»: deja pasar `textos_a_guardar` (objeto; si no es objeto, {}).
 *   · «JEF · plan · armar B» y «armar C»: el texto a guardar es `textos_a_guardar[S]` si es texto no vacío; `tag_propio.caracteres` describe el texto que de verdad se guarda.
 */
import { cambiarCodigo } from './lib.mjs'

const GUARDADO_ANCLA = 'solo_en_la_traza: Array.isArray(plan.solo_en_la_traza) ? plan.solo_en_la_traza : [] } }]'
const GUARDADO_NUEVO = "solo_en_la_traza: Array.isArray(plan.solo_en_la_traza) ? plan.solo_en_la_traza : [], textos_a_guardar: b.textos_a_guardar && typeof b.textos_a_guardar === 'object' && !Array.isArray(b.textos_a_guardar) ? b.textos_a_guardar : {} } }]"

const ARMAR_ANCLA_HOY = "const hoy = new Date().toISOString().slice(0, 10)\n"
const ARMAR_BLOQUE = `// 01-nov · «Qué cambió» POR CÓDIGO: si la plataforma devolvió el texto de esta versión con la sección armada, ese es el que se guarda; si no, el de hoy.
const _tx = est.textos_a_guardar && typeof est.textos_a_guardar[S] === 'string' && est.textos_a_guardar[S].trim() ? est.textos_a_guardar[S] : null
const texto_a_guardar = _tx || p.texto
`
const ARMAR_CONTENT_VIEJO = 'content: p.texto, content_text: p.texto,'
const ARMAR_CONTENT_NUEVO = 'content: texto_a_guardar, content_text: texto_a_guardar,'
const ARMAR_CARACTERES_VIEJO = 'tag_propio: { caracteres: p.caracteres,'
const ARMAR_CARACTERES_NUEVO = 'tag_propio: { caracteres: _tx ? _tx.length : p.caracteres,'

export function construirQueCambioPorCodigo(f) {
  cambiarCodigo(f, 'JEF · plan · el plan de guardado', GUARDADO_ANCLA, GUARDADO_NUEVO)
  for (const nombre of ['JEF · plan · armar B', 'JEF · plan · armar C']) {
    cambiarCodigo(f, nombre, ARMAR_ANCLA_HOY, ARMAR_ANCLA_HOY + ARMAR_BLOQUE)
    cambiarCodigo(f, nombre, ARMAR_CONTENT_VIEJO, ARMAR_CONTENT_NUEVO)
    cambiarCodigo(f, nombre, ARMAR_CARACTERES_VIEJO, ARMAR_CARACTERES_NUEVO)
  }
}
