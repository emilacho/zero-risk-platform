/**
 * El juicio de relevancia CABLEADO al entorno real (encargo 4): base, foto reducida del almacén, modelo con varias imágenes y registro en `log-invocation`.
 * Lo comparten el cierre del vigilante (corrida diaria) y la ruta `/api/brain/portero/relevancia` (la prueba de 40 y la primera pasada por cliente).
 */
import type { Db } from './alimentar'
import { crearBajador } from '../cerebro/portero/almacen'
import { llamarAlModeloConImagenes } from '../cerebro/portero/modelo'
import { crearRegistrador } from '../cerebro/portero/registro'
import { urlReducida, type DepsDeRelevancia } from './relevancia'

export function depsDeRelevanciaDelEntorno(o: { db: Db; origen: string; llaveInterna: string }): DepsDeRelevancia {
  const urlDeLaBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  return {
    db: o.db,
    llamarModelo: (p) => llamarAlModeloConImagenes(p),
    // el bajador revisa que la foto sea del almacén; la que baja es la REDUCIDA (≤512 px). Sin versión reducida, no hay foto (se juzga por el texto)
    bajarFoto: crearBajador({
      urlDeLaBase,
      fetchImpl: (u, i) => {
        const r = urlReducida(u, urlDeLaBase)
        return r ? fetch(r, i) : Promise.resolve(new Response(null, { status: 404 }))
      },
    }),
    registrar: crearRegistrador({ origen: o.origen, llaveInterna: o.llaveInterna }),
  }
}
