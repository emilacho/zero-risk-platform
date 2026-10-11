// PLANEACIÓN · el sobre del brief ya no sale con 401 · CC#2 · 2026-10-11 (encargo «sobre del brief»)
// Defecto (LISTO-CC1-paso-2 §6): el nodo «BRIEF · sobre · pedir el parte a la sala» mandaba `x-api-key: $env.SALA_INGRESS_API_KEY` SIN respaldo; esa variable no está en el entorno de n8n ⇒ cabecera vacía ⇒ 401 «missing x-api-key header»
// ⇒ «Nota perdida · sobre del brief» (el cable de la planeación quedaba en 1 de 2).
// Arreglo: la misma llave, por entorno y con el mismo respaldo que ya usa el sobre del trato cerrado (`SALA_INGRESS_API_KEY || INTERNAL_API_KEY`). No se pega ningún valor.
export const NODO = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
export const VIEJO = '={{ $env.SALA_INGRESS_API_KEY }}'
export const NUEVO = '={{ $env.SALA_INGRESS_API_KEY || $env.INTERNAL_API_KEY }}'

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  const cab = n.parameters.headerParameters.parameters.filter((h) => h.name === 'x-api-key')
  if (cab.length !== 1) throw new Error('el nodo debe tener UNA cabecera x-api-key, tiene ' + cab.length)
  if (cab[0].value !== VIEJO) throw new Error('la cabecera ya no es la de antes · rehacer desde el vivo')
  cab[0].value = NUEVO
  return copia
}
