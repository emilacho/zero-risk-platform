// CADENA · ronda 74 · F7 · el simulacro del parte llega hasta la copia por filas y, en seco, autoproducir se ensaya sin sembrar nada a mano · CC#2 · 2026-10-12
// Dos flujos, partiendo del VIVO, conexiones y ajustes de lo demás idénticos:
//   PUERTA  `pBAp5Cx7R39U585i`: «⓪ Llave y origen» lee `_simulacro_respuesta` (SOLO con dry_run:true) y «Parte · armar» se lo pasa a la copia por filas.
//   COPIA   `BNXqlaX1oHSfZIpF`: «⑤ Seco · lo que se habría escrito» deja el `parte_seco` y un nodo NUEVO «⑤c Autoproducir (seco)» lo manda a /api/cadena/filas (dry_run:true) → «⑤c ¿Salió?».
export const PUERTA = { llave: '⓪ Llave y origen', armar: 'Parte · armar' }
export const COPIA = { seco: '⑤ Seco · lo que se habría escrito', nuevo: '⑤c Autoproducir (seco)', salio: '⑤c ¿Salió?' }

const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 70))
  return s.replace(a, () => b)
}
const conLF = (f) => (c) => { const crlf = c.includes('\r\n'); const r = f(c.split('\r\n').join('\n')); return crlf ? r.split('\n').join('\r\n') : r }

export const cambiarLlave = conLF((s) => {
  if (s.includes('simulacro_respuesta')) throw new Error('la puerta ya pasa el simulacro del parte')
  return unaVez(s, '    dry_run: body.dry_run,\n', "    dry_run: body.dry_run,\n    // r74 · SOLO en seco: la respuesta enlatada del redactor del parte viaja hasta la copia por filas (en real se ignora por completo)\n    simulacro_respuesta: body.dry_run === true && typeof body._simulacro_respuesta === 'string' ? body._simulacro_respuesta : null,\n", PUERTA.llave)
})
export const cambiarArmar = conLF((s) => {
  if (s.includes('_simulacro_respuesta')) throw new Error('«Parte · armar» ya pasa el simulacro')
  return unaVez(s, '_journey_id: s._journey_id, _sala_correlation_id: s._sala_correlation_id }\n', "_journey_id: s._journey_id, _sala_correlation_id: s._sala_correlation_id, ...(s.dry_run === true && typeof s.simulacro_respuesta === 'string' ? { _simulacro_respuesta: s.simulacro_respuesta } : {}) }\n", PUERTA.armar)
})
export function construirPuerta(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n); return x }
  nodo(PUERTA.llave).parameters.jsCode = cambiarLlave(nodo(PUERTA.llave).parameters.jsCode)
  nodo(PUERTA.armar).parameters.jsCode = cambiarArmar(nodo(PUERTA.armar).parameters.jsCode)
  return copia
}

export const cambiarSeco = conLF((s) => {
  if (s.includes('parte_seco')) throw new Error('el nodo seco ya deja el parte_seco')
  return unaVez(s, 'return [salida]', "// r74 · lo que HABRÍA guardado, para ensayar autoproducir en seco sin sembrar nada a mano (la ruta solo lo acepta con dry_run:true)\nsalida.json.parte_seco = { lote: String(c.lote || ''), valido: c.parte_valido !== false, briefs: (f.provenance_tag && Array.isArray(f.provenance_tag.familias_por_brief)) ? f.provenance_tag.familias_por_brief : [] }\nreturn [salida]", COPIA.seco)
})
export const CUERPO_AUTOPRODUCIR_SECO = "={{ JSON.stringify({ accion: 'autoproducir', campana_id: $('④ Chequeos').first().json.fila_parte.provenance_tag.campana_id, parte_seco: $json.parte_seco, dry_run: true, workflow_id: $workflow.id, workflow_execution_id: $execution.id, _sala_correlation_id: $('⓪ Sobre · llave · modo seco').first().json._sala_correlation_id || undefined, _journey_id: $('⓪ Sobre · llave · modo seco').first().json._journey_id || undefined }) }}"

export function construirCopia(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n); return x }
  if (copia.nodes.some((n) => n.name === COPIA.nuevo)) throw new Error('la copia ya tiene el nodo de autoproducir en seco')
  const seco = nodo(COPIA.seco), real = nodo('⑤c Autoproducir')
  seco.parameters.jsCode = cambiarSeco(seco.parameters.jsCode)
  const nuevo = JSON.parse(JSON.stringify(real))
  delete nuevo.id; nuevo.name = COPIA.nuevo; nuevo.position = [seco.position[0] + 350, seco.position[1]]
  nuevo.parameters.jsonBody = CUERPO_AUTOPRODUCIR_SECO
  copia.nodes.push(nuevo)
  if (copia.connections[COPIA.seco]) throw new Error('el nodo seco ya tenía salida')
  copia.connections[COPIA.seco] = { main: [[{ node: COPIA.nuevo, type: 'main', index: 0 }]] }
  copia.connections[COPIA.nuevo] = { main: [[{ node: COPIA.salio, type: 'main', index: 0 }]] }
  return copia
}
