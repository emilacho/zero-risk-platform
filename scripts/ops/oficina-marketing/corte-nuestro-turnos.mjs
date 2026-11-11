/**
 * 11-nov · REGLA (b) de Lenovo (20:10 Zúrich · decisión A): el flujo «Oficina · un turno» (`bTbWL9lUvQCfStAz`) pasa a la oficina, como CAMPOS, lo que ya sabe de un corte por causa nuestra.
 * La oficina marca la versión cortada por esos campos (`orquestador.ts · corteNuestroDeLaVuelta`); jamás por el texto del error.
 * Qué cambia (y SOLO esto):
 *   · «② ¿Aceptó el pedido?» · el nodo HTTP a run-sdk falló (red, tiempo) ⇒ `pedido_no_llego: true`; un rechazo síncrono de run-sdk con `upstream_status` entero ⇒ lo pasa tal cual;
 *   · «② Vuelta» · un fallo (`success:false`) con `upstream_status` entero ⇒ lo pasa. run-sdk lo pone ARRIBA en su 502 y, cuando la vuelta llega por el callback, DENTRO de `inner`
 *     (`markInnerBodyAsNotSuccess` envuelve el cuerpo): se leen los dos lugares. Ningún otro campo se toca; el texto del error queda igual.
 * Idempotente: sobre un flujo ya cambiado no hace nada (devuelve 0). Si el vivo cambió y no aparece el fragmento exacto, se detiene.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

const NO_LLEGO_VIEJO = "error: 'OFICINA_PEDIDO_NO_LLEGO · ' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 200), costo_usd: 0,"
const NO_LLEGO_NUEVO = "error: 'OFICINA_PEDIDO_NO_LLEGO · ' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 200), pedido_no_llego: true, costo_usd: 0,"
const RECHAZO_VIEJO = ": JSON.stringify(r).slice(0, 200)), costo_usd: 0, workflow_execution_id: $execution.id } } }]"
const RECHAZO_NUEVO = ": JSON.stringify(r).slice(0, 200)), ...(Number.isInteger(r.upstream_status) ? { upstream_status: r.upstream_status } : {}), costo_usd: 0, workflow_execution_id: $execution.id } } }]"
const VUELTA_ANCLA = "if (fallo) body.error = 'el agente FALLÓ · ' + fallo + (cuerpo.partial === true ? ' · (había texto parcial: no se usa)' : '')"
export const VUELTA_LINEA = "// 11-nov · regla (b) · el código de run-sdk cuando no llegó al corredor o el corredor contestó roto (arriba en su 502; dentro de `inner` si llegó por el callback): la oficina marca el corte por este CAMPO, nunca por el texto\nif (fallo) { const us = Number.isInteger(cuerpo.upstream_status) ? cuerpo.upstream_status : (cuerpo.inner && typeof cuerpo.inner === 'object' && Number.isInteger(cuerpo.inner.upstream_status) ? cuerpo.inner.upstream_status : null); if (us !== null) body.upstream_status = us }"

/** devuelve cuántos nodos cambió (0 si ya estaba hecho) */
export function construirCorteNuestroTurnos(f) {
  let n = 0
  if (!nodo(f, '② ¿Aceptó el pedido?').parameters.jsCode.includes('pedido_no_llego')) {
    cambiarCodigo(f, '② ¿Aceptó el pedido?', NO_LLEGO_VIEJO, NO_LLEGO_NUEVO)
    cambiarCodigo(f, '② ¿Aceptó el pedido?', RECHAZO_VIEJO, RECHAZO_NUEVO)
    n++
  }
  if (!nodo(f, '② Vuelta').parameters.jsCode.includes('body.upstream_status')) {
    cambiarCodigo(f, '② Vuelta', VUELTA_ANCLA, VUELTA_ANCLA + '\n' + VUELTA_LINEA)
    n++
  }
  return n
}
