/**
 * Equipo del manual de marca · el flujo del manual (`ssLtwYPt7zxuvnM2`) con las partes de CC2 aplicadas EN ORDEN sobre el respaldo vivo/.
 *   parte 1 · palabras con intención (palabras-con-intencion-manual.mjs)
 *   parte 2 · el juez de fidelidad deja de ser quien escribe la voz (juez-independiente-manual.mjs)
 *   node scripts/ops/oficina-marketing/construir-manual.mjs · escribe nuevo/ssLtwYPt7zxuvnM2.json
 * Cada parte se certifica por separado; la ventana de aplicación es una sola, con el archivo acumulado.
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirJuezIndependiente } from './juez-independiente-manual.mjs'
import { construirPalabrasConIntencion } from './palabras-con-intencion-manual.mjs'

const f = leerVivo('ssLtwYPt7zxuvnM2')
construirPalabrasConIntencion(f)
construirJuezIndependiente(f)
console.log(escribirNuevo(f))
