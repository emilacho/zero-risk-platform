/**
 * LECTURA (OCR) DE PDF ESCANEADOS · 31-oct
 * El lector de archivos del cerebro declara «escaneado» cuando un PDF no trae texto (solo imágenes de páginas). Aquí ese PDF se lee con el modelo (que ve las páginas) y su texto vuelve
 * para guardarse como cualquier otro PDF. No se inventa: lo ilegible va como «[ilegible]» y una respuesta sin texto se DECLARA como fallida.
 * El gasto se REGISTRA en la libreta (misma puerta que el resto del portero) y tiene tope por documento.
 */
import { llamarAlModeloConDocumento } from '../cerebro/portero/modelo'
import { costoDeLaLlamada, MODELO, RAZONAMIENTO } from '../cerebro/portero/razonar'
import { crearRegistrador } from '../cerebro/portero/registro'

export const MAX_OCR_POR_CORRIDA = 2
export const TOPE_DE_OCR_POR_DOCUMENTO_USD = 0.5
export const MAX_TOKENS_DE_OCR = 16_000
const PLAZO_DEL_OCR_MS = 120_000

export const INSTRUCCION_DE_OCR = `Eres un lector de documentos escaneados. Recibes un PDF cuyas páginas son imágenes. Transcribe TODO el texto visible, página por página y en el orden de lectura, sin resumir, sin traducir y sin añadir nada que no esté escrito.
Antes de cada página escribe una línea «--- página N ---». Respeta precios, cifras, nombres y horarios tal cual. Si una palabra o un número no se lee con certeza, escribe [ilegible] en su lugar (nunca lo adivines). Si una página no tiene texto, escribe solo su línea de página. Responde solo con la transcripción.`

export interface LecturaOcr { texto: string; costo_usd: number; tokens_entrada: number; tokens_salida: number; cortado: boolean }
export type LectorOcr = (pdf: Buffer, nombre: string) => Promise<LecturaOcr>

/** lo que queda de una transcripción: sin marcas de página vacías; texto real = al menos 20 caracteres sin contar las marcas ni [ilegible] */
export function textoUtilDelOcr(t: string): string {
  const limpio = t.replace(/^---\s*página\s*\d+\s*---\s*$/gim, '').replace(/\[ilegible\]/gi, '').replace(/\s+/g, ' ').trim()
  return limpio.length >= 20 ? t.trim() : ''
}

export function ocrRegistrado(o: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string; clientId: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }): LectorOcr {
  const registrar = crearRegistrador({ origen: o.origen, llaveInterna: o.llaveInterna, fetchImpl: o.fetchImpl })
  return async (pdf, nombre) => {
    const inicio = Date.now()
    const r = await llamarAlModeloConDocumento({ model: MODELO, max_tokens: MAX_TOKENS_DE_OCR, thinking: RAZONAMIENTO, system: INSTRUCCION_DE_OCR, texto: `Transcribe el documento «${nombre.slice(0, 120)}».`, documento: { base64: pdf.toString('base64') }, timeoutMs: PLAZO_DEL_OCR_MS })
    const costo = costoDeLaLlamada(r.usage)
    await registrar({
      workflow_id: o.workflowId, workflow_execution_id: `${o.ejecucionId}:ocr`, agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: o.ejecucionId,
      model: MODELO, cost_usd: costo, duration_ms: Date.now() - inicio, tokens_input: r.usage.input_tokens, tokens_output: r.usage.output_tokens, num_turns: 1, status: 'completed',
      client_id: o.clientId, command: 'portero.ocr_pdf', response_text: r.texto.slice(0, 500), metadata: { stop_reason: r.stop_reason ?? null, documento: nombre.slice(0, 200) },
    })
    return { texto: r.texto, costo_usd: costo, tokens_entrada: r.usage.input_tokens, tokens_salida: r.usage.output_tokens, cortado: r.stop_reason === 'max_tokens' }
  }
}
