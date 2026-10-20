// CC#1 · 20-oct · LA ENTRADA DEL CLIENTE · V2 (pendientes de la certificación de CC#3 sobre #659): más formas de enlace que no son sitio, más paredes, y un aviso cuando llega un «@usuario» o un texto que no es una dirección.
//   node construir-entrada-del-cliente-v2-2026-10-20.mjs      → V1 (lo que está vivo y certificado) → V2
//   import { construirFlujo } y pasarle el flujo V1             → lo que prueba __tests__/alta-entrada-del-cliente-v2.test.ts
// Solo cambia el TEXTO del bloque pegado en los mismos 3 nodos (Validate Deal Data · El texto del sitio, o el hueco · El perfil de la red, o el hueco). Nodos y cables IGUALES.
// NO se aplica en vivo hasta que otro empleado certifique (CC#3) y fuera de 14–16 Berlín.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODOS = ['Validate Deal Data', 'El texto del sitio, o el hueco', 'El perfil de la red, o el hueco']
const aqui = dirname(fileURLToPath(import.meta.url))
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
export const BLOQUE_V2 = fs.readFileSync(join(aqui, 'bloque-entrada-del-cliente-v2-2026-10-20.js'), 'utf8').split(CR + LF).join(LF).trim()
const INICIO = '// ═══ LA ENTRADA DEL CLIENTE'
const FIN = '// ═══ fin de la entrada del cliente ═══'

export function cambiarBloque(codigo) {
  const crlf = codigo.includes(CR + LF)
  const s = codigo.split(CR + LF).join(LF)
  const i = s.indexOf(INICIO), j = s.indexOf(FIN)
  if (i < 0 || j < i || s.indexOf(INICIO, i + 1) !== -1) throw new Error('no encuentro UN solo bloque de la entrada del cliente · rehacer desde el vivo')
  if (s.includes('· V2 (')) throw new Error('ya trae la V2 · no construir dos veces')
  const nuevo = s.slice(0, i) + BLOQUE_V2 + s.slice(j + FIN.length)
  return crlf ? nuevo.split(LF).join(CR + LF) : nuevo
}
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  for (const n of NODOS) {
    const x = copia.nodes.find((y) => y.name === n)
    if (!x) throw new Error('falta el nodo ' + n)
    x.parameters.jsCode = cambiarBloque(x.parameters.jsCode)
  }
  return copia
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-v2-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
