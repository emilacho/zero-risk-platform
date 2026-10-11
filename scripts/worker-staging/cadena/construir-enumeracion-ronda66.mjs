// RONDA 66 (CC#1 2026-10-11) · devolver «(tú · vos · usted)» a la instrucción del trato en el brief y en la copia por filas.
// El barrido del voseo (#492) la había vuelto «(tú · tú · usted)»: la protección de líneas que explican el registro usaba `\b` con «tú», y `\b` no entiende la tilde (no hay «borde de palabra» tras la «ú»),
// así que la línea no quedó protegida y el pronombre «vos» —aquí NOMBRE de una de las tres opciones— se cambió. Cuatro cadenas: nodos ③ y ④ de «Brief» (activo) y de la copia por filas (inactiva).
//   node scripts/worker-staging/cadena/construir-enumeracion-ronda66.mjs
// Parte de los respaldos de AHORA (el flujo vivo, que en la copia ya trae autoproducir) y escribe los ARREGLADOS · NO toca n8n (eso lo hace n8n-flujo.mjs restaurar --ejecutar).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const MAL = '(tú · tú · usted)'
export const BIEN = '(tú · vos · usted)'

/** devuelve el flujo con la enumeración corregida en TODOS los parámetros de texto; exige que la cadena mala aparezca (si no, no hay nada que corregir) */
export function corregirEnumeracion(flujo) {
  const f = JSON.parse(JSON.stringify(flujo)); let n = 0
  const rec = (o) => {
    if (typeof o === 'string') { const k = o.split(MAL).length - 1; n += k; return k ? o.split(MAL).join(BIEN) : o }
    if (Array.isArray(o)) return o.map(rec)
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rec(v)]))
    return o
  }
  for (const nodo of f.nodes) nodo.parameters = rec(nodo.parameters)
  if (n === 0) throw new Error(`no encuentro «${MAL}» · nada que corregir`)
  return { flujo: f, correcciones: n }
}

if (process.argv[1] && process.argv[1].endsWith('construir-enumeracion-ronda66.mjs')) {
  const ws = join(aqui, '..')
  for (const [antes, despues] of [[join(ws, 'PQdIgbuFexuBsoh8/brief-ANTES-ronda66-2026-10-11.json'), join(ws, 'PQdIgbuFexuBsoh8/brief-ARREGLADO-ronda66-2026-10-11.json')], [join(aqui, 'parte-por-filas-ANTES-ronda66-2026-10-11.json'), join(aqui, 'parte-por-filas-ARREGLADA-ronda66-2026-10-11.json')]]) {
    const r = corregirEnumeracion(JSON.parse(readFileSync(antes, 'utf8')))
    writeFileSync(despues, JSON.stringify(r.flujo, null, 1) + '\n')
    console.log(despues.split('/').pop(), '·', r.correcciones, 'cadenas devueltas')
  }
}
