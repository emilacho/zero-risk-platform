// CADENA · ronda 75 · UN SOLO CAMINO DE BRIEFS · la puerta con la cadena APAGADA ya no reenvía a la parte vieja (`PQdIgbuFexuBsoh8`) · CC#2 · 2026-10-12
// El plan queda guardado (lo guarda planeación antes de mandar el sobre); la puerta anota «cadena apagada: no se generan briefs» y cierra el viaje de la sala con el resultado `cadena_apagada`.
// Tres nodos cambian de CONTENIDO (el tercero, «Cable · armar», solo acepta además el resultado nuevo)
// Dos nodos cambian de CONTENIDO (mismos nombres y mismas conexiones) y una conexión nueva cierra el viaje por el cable de siempre:
//   «Pasarela · reenviar a la parte»  → antes un POST a /webhook/zero-risk/brief (que cobra el redactor); ahora un nodo de código que NO llama a nadie
//   «Pasarela · ¿salió?»              → ahora devuelve el sobre de cierre con `resultado: 'cadena_apagada'`
//   conexión nueva: «Pasarela · ¿salió?» → «Cable · armar» (el mismo cable de cierre que usan los demás caminos)
// Depende de que el código con `cadena_apagada` en los resultados del cierre (PR de esta ronda) y el cable arreglado (#507) estén publicados.
export const NODOS = { reenviar: 'Pasarela · reenviar a la parte', salio: 'Pasarela · ¿salió?', cable: 'Cable · armar' }
export const NOTA = 'cadena apagada: no se generan briefs'

export const CODIGO_REENVIAR = `// r75 · UN SOLO CAMINO DE BRIEFS · con la cadena apagada NO se reenvía a la parte vieja (que cobraba al redactor sin pasar por la cadena)
// El plan ya está guardado; aquí solo se deja constancia. Este nodo no llama a nadie.
const s = $input.first().json || {}
return [{ json: { statusCode: 200, cadena_apagada: true, nota: '${NOTA}', client_id: s.client_id || null, plan_id: s.plan_id || null } }]
`
export const CODIGO_SALIO = `// r75 · PASARELA · ¿SALIÓ? · con la cadena apagada no hay nada que reenviar: se cierra el viaje con \`cadena_apagada\` y la nota (el plan quedó guardado, no se generan briefs)
const r = $input.first().json || {}
if (r.cadena_apagada !== true) throw new Error('PUERTA_PASARELA_INESPERADA · la pasarela ya no reenvía: este nodo solo cierra con la cadena apagada')
const s = $('⓪ Decidir').first().json
const { cuerpo_original, simulacros, ...resto } = s
return [{ json: { ...resto, resultado: 'cadena_apagada', http: null, nota: r.nota } }]
`

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n); return x }
  const a = nodo(NODOS.reenviar)
  if (a.type !== 'n8n-nodes-base.httpRequest' || !String(a.parameters.url).includes('zero-risk/brief')) throw new Error('«Pasarela · reenviar a la parte» ya no es el reenvío de antes · rehacer desde el vivo')
  a.type = 'n8n-nodes-base.code'; a.typeVersion = 2; delete a.credentials
  a.parameters = { jsCode: CODIGO_REENVIAR }
  delete a.onError; delete a.retryOnFail; delete a.maxTries; delete a.waitBetweenTries
  const b = nodo(NODOS.salio)
  if (!String(b.parameters.jsCode).includes('PUERTA_PASARELA_FALLO')) throw new Error('«Pasarela · ¿salió?» ya no es el de antes · rehacer desde el vivo')
  b.parameters.jsCode = CODIGO_SALIO
  if (copia.connections[NODOS.salio]) throw new Error('«Pasarela · ¿salió?» ya tenía salida')
  const cab = nodo(NODOS.cable)
  const vieja = "const ok = ['cadena_abierta', 'lote_briefeado', 'necesita_humano', 'plan_no_coincide', 'pasarela_ok']"
  if (!cab.parameters.jsCode.includes(vieja)) throw new Error('«Cable · armar» ya no tiene la lista de resultados de antes')
  cab.parameters.jsCode = cab.parameters.jsCode.replace(vieja, () => vieja.replace("'pasarela_ok']", "'pasarela_ok', 'cadena_apagada']"))
  copia.connections[NODOS.salio] = { main: [[{ node: NODOS.cable, type: 'main', index: 0 }]] }
  return copia
}
