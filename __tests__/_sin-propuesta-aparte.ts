/**
 * 03-nov · decisión de Lenovo (opción 1 + opción A): el rótulo «PROPUESTA» sale del texto y la vara acepta la declaración aparte; los nodos de content-creator saltan al editor.
 * Las pruebas viejas fijan que la vara, los reparos y la instrucción son «idénticos al ya aplicado»; ese cambio tiene su prueba propia (vara-declaracion-aparte y flujos-oficina-marketing-manual-propuesta-aparte).
 * Esta ayuda devuelve el flujo SIN ese cambio para que cada prueba siga midiendo solo lo suyo.
 */
import { BLOQUE_NUEVO, BLOQUE_VIEJO, CABECERA_SALTO, JUECES_DE_USO, NODOS_CONTENT_CREATOR, NODO, REGLA_NUEVA, REGLA_VIEJA, REPAROS } from '../scripts/ops/oficina-marketing/texto-limpio-manual.mjs'

export const sinPropuestaAparte = <T>(flujo: T): T => {
  const f = JSON.parse(JSON.stringify(flujo)) as any
  const cambiar = (nombre: string, de: string, a: string) => {
    const n = (f.nodes ?? []).find((x: any) => x.name === nombre)
    if (n && typeof n.parameters?.jsCode === 'string' && n.parameters.jsCode.includes(de)) n.parameters.jsCode = n.parameters.jsCode.replace(de, () => a)
  }
  cambiar(NODO, REGLA_NUEVA, REGLA_VIEJA)
  for (const j of JUECES_DE_USO) cambiar(j, BLOQUE_NUEVO(), BLOQUE_VIEJO())
  for (const [v, n] of REPAROS) cambiar(JUECES_DE_USO[1], n, v)
  for (const nombre of NODOS_CONTENT_CREATOR) {
    const n = (f.nodes ?? []).find((x: any) => x.name === nombre)
    const ps = n?.parameters?.headerParameters?.parameters
    if (Array.isArray(ps)) n.parameters.headerParameters.parameters = ps.filter((h: any) => h.name !== CABECERA_SALTO.name)
  }
  return f as T
}
