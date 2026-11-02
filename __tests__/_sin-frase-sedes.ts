/**
 * 02-nov · las pruebas viejas fijan que el pedido y la jefatura son «idénticos al ya aplicado»; la frase de indicación de sedes (frase-sedes-y-preguntar.mjs) es lo único que cambió ahí
 * y tiene su propia prueba (flujos-oficina-marketing-frase-sedes-y-preguntar). Esta ayuda devuelve el flujo SIN esa frase para que cada prueba siga midiendo solo lo suyo.
 */
import { FRASE_SEDES_JEFATURA, FRASE_SEDES_Y_PREGUNTAR } from '../scripts/ops/oficina-marketing/frase-sedes-y-preguntar.mjs'

export const sinFraseSedes = <T>(flujo: T): T => {
  const f = JSON.parse(JSON.stringify(flujo)) as any
  const quitar = (nombre: string, viejo: string) => {
    const n = (f.nodes ?? []).find((x: any) => x.name === nombre)
    if (n && typeof n.parameters?.jsCode === 'string') n.parameters.jsCode = n.parameters.jsCode.replace(viejo, '')
  }
  quitar('Redactor (B4)', "'" + FRASE_SEDES_Y_PREGUNTAR + "',\n'',\n")
  quitar('JEF · armar', '; ' + FRASE_SEDES_JEFATURA)
  return f as T
}
