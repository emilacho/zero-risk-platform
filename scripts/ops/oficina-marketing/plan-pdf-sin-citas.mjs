/**
 * 04-nov · LISTO de CC#1 «plan sin rótulos internos» (decisión Emilio 15:37Z) · parte de CC#2: el PDF del plan sale por «Plan → Drive (PDF)» con el texto GUARDADO, que conserva las citas internas `[D12]` / `[D9, D55]`
 * (el chequeo del plan las necesita). El dashboard ya las quita (`sinCitasInternas`, dashboard #276); el PDF no: medido en el respaldo vivo, el nodo manda `texto: String(…texto || '')` tal cual.
 * Este constructor aplica LA MISMA expresión que el dashboard al texto del PDF. Solo cambia el cuerpo de ese nodo; el plan guardado y todo lo demás quedan igual.
 * Vive en dos flujos con el nodo idéntico: el plan `X9F0zp6LQ2xGEYVS` y la segunda mitad `mdhgiJeCkLV2bTxL`.
 */
import { nodo } from './lib.mjs'

/** igual que `sinCitasInternas` del dashboard: /[ \t]*\[D\d+(?:\s*,\s*D\d+)*\]/g (una cita es `[D` + número, opcionalmente varias separadas por coma) */
export const REGEX_CITAS = String.raw`[ \t]*\[D\d+(?:\s*,\s*D\d+)*\]`
const NODO = 'Plan → Drive (PDF)'
const VIEJO = "texto: String(($('Plan vigente').first().json.jef_vigente || $('¿Llegó la vuelta?').first().json).texto || '') })"
const NUEVO = `texto: String(($('Plan vigente').first().json.jef_vigente || $('¿Llegó la vuelta?').first().json).texto || '').replace(new RegExp('${REGEX_CITAS.split('\\').join('\\\\')}', 'g'), '') })`

export function construirPdfSinCitas(f) {
  const p = nodo(f, NODO).parameters
  if (typeof p.jsonBody !== 'string' || p.jsonBody.split(VIEJO).length !== 2) throw new Error(`«${NODO}»: el cuerpo no tiene la forma esperada`)
  p.jsonBody = p.jsonBody.replace(VIEJO, () => NUEVO)
}
