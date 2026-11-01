/**
 * 01-nov · EQUIPO DEL MANUAL · parte 2 · el juez de fidelidad NO es quien escribe la voz.
 * Hoy «[BB] Judge · run-sdk» del flujo `ssLtwYPt7zxuvnM2` corre como `editor-en-jefe`, el mismo que escribe la voz (la lente del editor) y a quien se le pide la voz otra vez:
 * el que escribe la voz y el que califica el manual son la misma cabeza. Cambia SOLO el `agent` del juez a `market_research_analyst` (slug con guion bajo: con guiones no se resuelve).
 *   · Ya está en `BRAND_SECTION_ALLOW` del corredor (puede emitir `emit_fidelity_scores`) y corre en Sonnet, el mismo modelo que el juez de hoy: no cambia el costo ni hace falta tocar la plataforma.
 *   · NO cambia «[BB] Uso · pedir la voz otra vez (editor-en-jefe)»: ese nodo le pide la voz otra vez a QUIEN LA ESCRIBE, no al juez. Debe ir con el escritor de la voz (hoy `editor-en-jefe`; si Emilio firma
 *     `content-creator`, cambian juntos la lente del editor y ese nodo, no el juez). El plan y la nota de CC3 los daban por «el mismo agente que el juez»: en el flujo real no lo son. Se declara en el LISTO.
 *   · El pedido del juez («Eres un evaluador de FIDELIDAD…») es neutro: no presupone al editor. El insumo del juez sigue siendo la evidencia cruda del cliente; el analista no aporta datos propios.
 */
import { nodo } from './lib.mjs'

export const JUEZ_NUEVO = 'market_research_analyst'

export function construirJuezIndependiente(f) {
  const n = nodo(f, '[BB] Judge · run-sdk')
  const viejo = '"agent": "editor-en-jefe",'
  const cuantas = n.parameters.jsonBody.split(viejo).length - 1
  if (cuantas !== 1) throw new Error(`«[BB] Judge · run-sdk»: el ancla del agente aparece ${cuantas} veces (debe ser 1)`)
  n.parameters.jsonBody = n.parameters.jsonBody.replace(viejo, `"agent": "${JUEZ_NUEVO}",`)
}
