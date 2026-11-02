/**
 * Equipo del manual de marca · el flujo del manual (`ssLtwYPt7zxuvnM2`) con las partes de CC2 aplicadas EN ORDEN sobre el respaldo vivo/.
 *   parte 1 · palabras con intención (palabras-con-intencion-manual.mjs)
 *   parte 2 · el juez de fidelidad deja de ser quien escribe la voz (juez-independiente-manual.mjs)
 *   parte 4 · pedir cambios al manual (reescritura-del-manual.mjs) · solo actúa con `reescritura` en el sobre
 *   parte 3 · el eslogan real hallado llega como tagline con su fuente (eslogan-del-cliente.mjs)
 *   (e) · la frase del cliente en la lente del eslogan pasa de orden a contexto (eslogan-manual-contexto.mjs)
 *   (d) · content-creator escribe la voz y el editor-en-jefe la revisa (voz-content-creator-manual.mjs)
 *   (c) · reparto de secciones: estrategia a brand-strategist; productos y sedes a jefe-client-success (reparto-de-secciones-manual.mjs)
 *   (c2) · piso visual: design-visual-storyteller lo escribe y style-consistency-reviewer lo revisa (piso-visual-equipo-manual.mjs)
 *   node scripts/ops/oficina-marketing/construir-manual.mjs · escribe nuevo/ssLtwYPt7zxuvnM2.json
 * Cada parte se certifica por separado; la ventana de aplicación es una sola, con el archivo acumulado.
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirJuezIndependiente } from './juez-independiente-manual.mjs'
import { construirPalabrasConIntencion } from './palabras-con-intencion-manual.mjs'
import { construirReescrituraDelManual } from './reescritura-del-manual.mjs'
import { construirEsloganDelManualComoContexto } from './eslogan-manual-contexto.mjs'
import { construirVozConContentCreator } from './voz-content-creator-manual.mjs'
import { construirRepartoDeSecciones } from './reparto-de-secciones-manual.mjs'
import { construirPisoVisualConEquipo } from './piso-visual-equipo-manual.mjs'

const f = leerVivo('ssLtwYPt7zxuvnM2')
construirPalabrasConIntencion(f)
construirJuezIndependiente(f)
construirReescrituraDelManual(f) // 02-nov · pedir cambios al manual: solo actúa con `reescritura` en el sobre
construirEsloganDelManualComoContexto(f) // 02-nov · (e) la frase que el cliente usa es contexto, no una orden de copiarla tal cual
construirVozConContentCreator(f) // 02-nov · (d) content-creator escribe la voz; el editor-en-jefe la revisa (asesora)
construirRepartoDeSecciones(f) // 02-nov · (c) estrategia a brand-strategist; productos y sedes a jefe-client-success
construirPisoVisualConEquipo(f) // 02-nov · (c2) design-visual-storyteller escribe lo visual; style-consistency-reviewer lo revisa (asesora)
console.log(escribirNuevo(f))
