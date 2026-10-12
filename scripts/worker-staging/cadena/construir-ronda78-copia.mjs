// COPIA POR FILAS · ensayo en seco del tramo 2 · CC#2 · 2026-10-12
// Defecto hallado: en «④ Chequeos» el bucle de «campos completos» usa `for (var c = 0; …)` DENTRO de `chequear`, y `var` es de función: pisa la `c` del sobre (con `fila_ids`).
// Resultado: «CADA FILA DEL LOTE SALE BRIEFEADA EXACTAMENTE UNA VEZ» lee `c.fila_ids` de un número → `[]` → nunca marca `fila_sin_brief`, `fila_repetida` ni `fila_ajena`.
// Un parte que se salta filas del lote pasaba como válido. Arreglo: el índice del bucle se llama `ci`. Nada más cambia.
export const NODO = '④ Chequeos'
const VIEJO = "    for (var c = 0; c < CAMPOS_OBLIGATORIOS.length; c++) {\n      var k = CAMPOS_OBLIGATORIOS[c]\n"
const NUEVO = "    for (var ci = 0; ci < CAMPOS_OBLIGATORIOS.length; ci++) {\n      var k = CAMPOS_OBLIGATORIOS[ci]\n"

export function cambiarChequeos(codigo) {
  const crlf = codigo.includes('\r\n')
  const s = crlf ? codigo.split('\r\n').join('\n') : codigo
  const n = s.split(VIEJO).length - 1
  if (n !== 1) throw new Error('el bucle de campos completos aparece ' + n + ' veces (debe ser 1) · rehacer desde el vivo')
  const r = s.replace(VIEJO, () => NUEVO)
  return crlf ? r.split('\n').join('\r\n') : r
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = cambiarChequeos(n.parameters.jsCode)
  return copia
}
