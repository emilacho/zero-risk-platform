/**
 * 05-nov · decisión de Lenovo sobre #928: si un analista de la mesa falla también en su reintento, el plan declara que no hubo ese informe y por qué. Flujo `X9F0zp6LQ2xGEYVS`, nodo «¿Llegó la vuelta?».
 * El redactor ya recibe el hueco en su bloque «NO SE PUDO VERIFICAR», pero que lo escriba depende de él. Esta sección la escribe EL SISTEMA, al final del texto que se guarda, se sube a Drive y lee el brief.
 * Va en lenguaje llano y sin detalles técnicos: el motivo completo queda en la salida de la rama de análisis.
 * NO se declara: la mesa apagada para ese cliente (ahí corre el paso 0 de mercado, y no es una falta) ni un ensayo. Todo lo demás que no contestó sí: por omisión se dice, no se calla.
 * Si nadie pidió análisis, no sale ninguna sección. No limita a ningún agente: solo informa.
 */
import { cambiarCodigo } from './lib.mjs'

const VIEJO = "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + '\\n' : textoDelRedactor;"

export const CODIGO_INFORMES_QUE_NO_LLEGARON = `// 05-nov · lo que la mesa de análisis no entregó lo declara el sistema, no depende de que el redactor lo recuerde
let itemsDeLaMesa = [];
try { itemsDeLaMesa = $('firma de la rama · analisis').all().map((i) => i.json || {}); } catch (x) { itemsDeLaMesa = []; }
const informesQueNoLlegaron = itemsDeLaMesa.filter((j) => {
  if (j.error !== undefined && j.error !== null) return true;
  return j.estado === 'sin_respuesta' && !/la mesa está (apagada|encendida pero)|fue un ensayo/.test(String(j.motivo || ''));
});
const bloqueInformesQueNoLlegaron = informesQueNoLlegaron.length
  ? '\\n## Informes de análisis que no llegaron (lo declara el sistema, no el redactor)\\n' + informesQueNoLlegaron.map((j) => '- ' + String(j.objetivo || 'un informe de análisis').split('_').join(' ') + ' — ' + (j.error !== undefined && j.error !== null ? 'la mesa de análisis no contestó' : String(j.motivo || 'sin motivo declarado').split(' · ')[0].split('_').join(' '))).join('\\n') + '\\n'
  : '';
`

const NUEVO = CODIGO_INFORMES_QUE_NO_LLEGARON + "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + '\\n' + bloqueInformesQueNoLlegaron : textoDelRedactor;"

export function construirPlanInformesQueNoLlegaron(f) {
  cambiarCodigo(f, '¿Llegó la vuelta?', VIEJO, NUEVO)
}
