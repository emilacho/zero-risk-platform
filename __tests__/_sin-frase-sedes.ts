/**
 * 02-nov · las pruebas viejas fijan que el pedido y la jefatura son «idénticos al ya aplicado»; la frase de indicación de sedes (frase-sedes-y-preguntar.mjs) es lo único que cambió ahí
 * y tiene su propia prueba (flujos-oficina-marketing-frase-sedes-y-preguntar). Esta ayuda devuelve el flujo SIN esa frase para que cada prueba siga midiendo solo lo suyo.
 */
import { FRASE_SEDES_JEFATURA, FRASE_SEDES_Y_PREGUNTAR } from '../scripts/ops/oficina-marketing/frase-sedes-y-preguntar.mjs'
import { FRASE_PLAN_LIMPIO } from '../scripts/ops/oficina-marketing/plan-texto-limpio.mjs'

export const sinFraseSedes = <T>(flujo: T): T => {
  const f = JSON.parse(JSON.stringify(flujo)) as any
  const quitar = (nombre: string, viejo: string) => {
    const n = (f.nodes ?? []).find((x: any) => x.name === nombre)
    if (n && typeof n.parameters?.jsCode === 'string') n.parameters.jsCode = n.parameters.jsCode.replace(viejo, '')
  }
  quitar('Redactor (B4)', "'" + FRASE_PLAN_LIMPIO + "',\n'',\n")
  quitar('Redactor (B4)', "'" + FRASE_SEDES_Y_PREGUNTAR + "',\n'',\n")
  quitar('JEF · armar', '; ' + FRASE_SEDES_JEFATURA)
  // 03-nov · el cierre «hecha · espera al dueño» (V9) tiene su propia prueba (flujos-oficina-marketing-planeacion-cierre-al-esperar-al-dueno): aquí se quita para medir solo lo de cada paso
  const CIERRE = ['V9 · armar el cierre al esperar al dueño', 'V9 · ¿cerrar al esperar al dueño?', 'V9 · cerrar al esperar al dueño']
  if (f.nodes && f.connections && CIERRE.every((n) => f.nodes.some((x: any) => x.name === n))) {
    f.nodes = f.nodes.filter((x: any) => !CIERRE.includes(x.name))
    for (const n of CIERRE) delete f.connections[n]
    delete f.connections['Compuerta · esperar al dueño']
  }
  return f as T
}
