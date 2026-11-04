/**
 * 02-nov · ENCARGO-LENOVO-a-CC2-CC3-frase-sedes-y-preguntar (firmado por Emilio «dale, todo aprobado») · SOLO INDICACIÓN, sin control ni regla por código.
 * Una frase en «Redactor (B4)» (el pedido que recibe el redactor del plan) y en «JEF · armar» (la función con la que la jefatura lee el resumen vivo):
 * cada sede tiene su propia carta, precios y horario; no se usa el dato de una sede para otra; si una duda importante no está en la carpeta, no se asume: se pregunta al dueño y se marca pendiente.
 * El «camino de preguntas» es el que el redactor ya tiene (formular la duda como PREGUNTA al dueño dentro del plan); no se inventa un camino nuevo.
 * No bloquea, no valida, no cambia ninguna salida: el pedido solo gana unas líneas de texto. Brief/parte/pieza no se tocan (leen el plan ya escrito; no hay un redactor de planes ahí).
 */
import { cambiarCodigo } from './lib.mjs'

export const FRASE_SEDES_Y_PREGUNTAR =
  'Cada sede tiene su propia carta, precios y horario: no uses el dato de una sede para otra. Si una duda es importante y no está en la carpeta, no asumas: pregúntala al dueño (formulada como pregunta del plan, igual que las demás) y márcala como pendiente.'

export const FRASE_SEDES_JEFATURA =
  'cada sede tiene su propia carta, precios y horario: no se usa el dato de una sede para otra'

const ANCLA_USO = '...bloqueSedes,\n'
const ANCLA_JEF = "funcion: 'sedes, horarios y canales actuales del negocio; manda sobre datos viejos de otros documentos'"

export function construirFraseSedesYPreguntar(f) {
  // pedido del redactor: tras el bloque de sedes, una línea de indicación (siempre, haya o no bloque de sedes)
  cambiarCodigo(f, 'Redactor (B4)', ANCLA_USO, ANCLA_USO + "'" + FRASE_SEDES_Y_PREGUNTAR + "',\n'',\n")
  // jefatura: la función del resumen vivo lleva la misma idea
  cambiarCodigo(
    f,
    'JEF · armar',
    ANCLA_JEF,
    ANCLA_JEF.slice(0, -1) + '; ' + FRASE_SEDES_JEFATURA + "'",
  )
}
