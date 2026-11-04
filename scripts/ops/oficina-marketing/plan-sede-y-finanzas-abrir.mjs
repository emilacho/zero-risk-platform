/**
 * 04-nov · LISTO de CC1 puntos 4 y 5 del encargo «el plan como se diseñó» · flujo del plan `X9F0zp6LQ2xGEYVS` (lo que CC1 pidió a CC2):
 *   · «Redactor (B4)» · `_v3FilaDeTabla`: la fila de la tabla lleva la sede del dato (`· sede guayaquil`), igual que ya hace `pedido-v3.js`.
 *   · «FIN · abrir la conversación»: el cuerpo lleva `trabajo_tipo: 'plan'` y `trabajo_id` = el `corrida_id` del pre-vuelo, para que cada corrida abra SU encargo de finanzas
 *     (sin él, sigue como hoy: vacío = «sin dato» en silencio).
 */
import { cambiarCodigo, nodo } from './lib.mjs'
import { CORRIDA_ID_JS } from './trabajo-de-cada-llamada-plan.mjs'

const FILA_VIEJA = "d.id, d.tipo_id + (d.atributo ? ' (' + d.atributo + ')' : ''), _v3Valor(d),"
const FILA_NUEVA = "d.id, d.tipo_id + (d.atributo ? ' (' + d.atributo + ')' : '') + (d.sede ? ' · sede ' + d.sede : ''), _v3Valor(d),"

export function construirPlanSedeYFinanzasAbrir(f) {
  cambiarCodigo(f, 'Redactor (B4)', FILA_VIEJA, FILA_NUEVA)
  const p = nodo(f, 'FIN · abrir la conversación').parameters
  const viejo = "accion: 'abrir', "
  if (typeof p.jsonBody !== 'string' || p.jsonBody.split(viejo).length !== 2) throw new Error('«FIN · abrir la conversación»: el cuerpo no tiene la forma esperada')
  p.jsonBody = p.jsonBody.replace(viejo, () => `accion: 'abrir', trabajo_tipo: 'plan', trabajo_id: ${CORRIDA_ID_JS}, `)
}
