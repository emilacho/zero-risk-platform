/**
 * Las palabras «prohibidas» del manual pasan de reja a contexto (ver palabras-del-manual.mjs) en los flujos del Brief y de la Pieza.
 * 01-nov · parte 4 del equipo del manual: el eslogan real del cliente (`client_brand_books.tagline`) llega al pedido del Brief y de la Pieza (ver eslogan-brief-y-pieza.mjs).
 *   node scripts/ops/oficina-marketing/construir-palabras.mjs · escribe nuevo/PQdIgbuFexuBsoh8.json y nuevo/lVCLzxQCKNkd3uS0.json (parte de vivo/)
 * La parte por filas (BNXqlaX1oHSfZIpF) lleva los mismos parches dentro de construir-parte.mjs.
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirEsloganEnBrief, construirEsloganEnPieza } from './eslogan-brief-y-pieza.mjs'
import { construirPalabrasDelManual } from './palabras-del-manual.mjs'
import { construirJerarquiaDeFuentes, construirPlanAprobado } from './plan-aprobado.mjs'

export const NODOS_BRIEF = { cargar: '① Cargar manual vigente', guarda: '① GUARDA · sin manual aprobado se DETIENE', armar: '③ Armar el cuerpo del redactor' }
export const NODOS_PIEZA = { cargar: '② Cargar el manual vigente', guarda: '② GUARDA · sin manual aprobado se DETIENE', armar: '⑤ Armar el cuerpo del productor' }

if (process.argv[1] && process.argv[1].endsWith('construir-palabras.mjs')) {
  for (const [id, construirEslogan, nodos] of [['PQdIgbuFexuBsoh8', construirEsloganEnBrief, NODOS_BRIEF], ['lVCLzxQCKNkd3uS0', construirEsloganEnPieza, NODOS_PIEZA]]) {
    const f = leerVivo(id)
    construirPalabrasDelManual(f)
    construirEslogan(f, nodos)
    if (id === 'PQdIgbuFexuBsoh8') { construirPlanAprobado(f); construirJerarquiaDeFuentes(f) } // 01-nov · 9a/9b: el brief lee el plan aprobado; la pieza no lee el plan
    console.log(escribirNuevo(f))
  }
}
