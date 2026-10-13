/**
 * r79 · D3 · copia por filas (BNXqlaX1oHSfZIpF) · el nodo «⑤ Seco · lo que se habría escrito» manda en `parte_seco.fila` la fila COMPLETA que habría guardado,
 * para que `/api/cadena/filas autoproducir` (dry_run) la guarde MARCADA como seco (otra llave de lote, vence sola) y la puerta de la oficina la halle por su uuid.
 * Cambia SOLO ese nodo. Retrocompatible: la ruta de antes ignoraba lo que no conocía.
 * Reversa: republicar `copia-r79-ANTES.json`.
 * Uso: import { construirFlujo } y pasarle el flujo vivo ({ name, nodes, connections, settings }).
 */
const NODO = '⑤ Seco · lo que se habría escrito'
const ANCLA = "salida.json.parte_seco = { lote: String(c.lote || ''), valido: c.parte_valido !== false, briefs: "
const NUEVO = "salida.json.parte_seco = { lote: String(c.lote || ''), valido: c.parte_valido !== false, fila: { title: f.title, content: f.content, content_text: f.content_text, producing_agent: f.producing_agent, provenance_tag: f.provenance_tag }, briefs: "

export function construirFlujo(flujo) {
  const nuevo = JSON.parse(JSON.stringify(flujo))
  const n = nuevo.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error(`no está el nodo «${NODO}»`)
  const crlf = n.parameters.jsCode.includes('\r\n')
  const cod = n.parameters.jsCode.replace(/\r\n/g, '\n')
  if (cod.split(ANCLA).length !== 2) throw new Error('el ancla de parte_seco no es única (o no está)')
  const sal = cod.replace(ANCLA, NUEVO)
  n.parameters.jsCode = crlf ? sal.replace(/\n/g, '\r\n') : sal
  return nuevo
}
