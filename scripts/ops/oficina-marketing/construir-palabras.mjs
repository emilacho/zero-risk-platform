/**
 * Las palabras «prohibidas» del manual pasan de reja a contexto (ver palabras-del-manual.mjs) en los flujos del Brief y de la Pieza.
 *   node scripts/ops/oficina-marketing/construir-palabras.mjs · escribe nuevo/PQdIgbuFexuBsoh8.json y nuevo/lVCLzxQCKNkd3uS0.json (parte de vivo/)
 * La parte por filas (BNXqlaX1oHSfZIpF) lleva el mismo parche dentro de construir-parte.mjs.
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirPalabrasDelManual } from './palabras-del-manual.mjs'

for (const id of ['PQdIgbuFexuBsoh8', 'lVCLzxQCKNkd3uS0']) {
  const f = leerVivo(id)
  construirPalabrasDelManual(f)
  console.log(escribirNuevo(f))
}
