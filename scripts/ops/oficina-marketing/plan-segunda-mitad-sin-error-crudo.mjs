/**
 * 04-nov · GO Lenovo 14:20Z «arreglar ¿Salió el PDF? de la segunda mitad» · sub-flujo `mdhgiJeCkLV2bTxL` («Plan · segunda mitad (PDF → brief)»).
 * Su copia de «¿Salió el PDF?» cae a `$('¿Llegó la vuelta?')` si el plan vigente viniera sin `jef_vigente`, y ese nodo NO existe en este flujo ⇒ error crudo.
 * Mismo criterio que en la primera mitad: las dos lecturas se atrapan y, sin plan, el nodo termina diciendo «sin plan» en palabras simples.
 */
import { cambiarCodigo } from './lib.mjs'

export function construirSegundaMitadSinErrorCrudo(f) {
  cambiarCodigo(f, '¿Salió el PDF?',
    "const v = ($('Plan vigente').first().json.jef_vigente || $('¿Llegó la vuelta?').first().json);",
    "// 04-nov · las dos lecturas se atrapan: en este flujo «¿Llegó la vuelta?» no existe y, sin `jef_vigente`, daba un error crudo\nlet _pv = null; try { _pv = $('Plan vigente').first().json } catch (e) { _pv = null }\nlet _lv = {}; try { _lv = $('¿Llegó la vuelta?').first().json } catch (e) { _lv = {} }\nconst v = ((_pv && _pv.jef_vigente) || _lv || {});")
}
