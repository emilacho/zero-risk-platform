/**
 * Equipo del manual · parte 1 · palabras con intención en el flujo del manual (ver palabras-con-intencion-manual.mjs).
 *   node scripts/ops/oficina-marketing/construir-manual-palabras.mjs · escribe nuevo/ssLtwYPt7zxuvnM2.json (parte de vivo/)
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirPalabrasConIntencion } from './palabras-con-intencion-manual.mjs'

const f = leerVivo('ssLtwYPt7zxuvnM2')
construirPalabrasConIntencion(f)
console.log(escribirNuevo(f))
