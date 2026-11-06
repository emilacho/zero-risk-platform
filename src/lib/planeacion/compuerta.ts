/**
 * LA COMPUERTA DEL PLAN · tramo 1: la regla y su lectura (CC1 · 06-nov · DALE de Emilio 02:00 + CORRECCIÓN «la pausa es del plan» + contrato de Cerebro).
 * Emilio firmó: el plan no se termina con preguntas abiertas. Cada pregunta al dueño de ESTA corrida se cierra al contestarla, asumirla o descartarla.
 * Justo antes del redactor, la compuerta mira las preguntas que hizo esta corrida (cualquier oficina) y dice `sigue` o `espera`.
 * Este tramo NO pausa, NO despierta y NO está cableado en el flujo: solo decide. El cableado (tramo 2) va cuando exista `asumida` en el cerebro.
 *
 * Cómo se cierra cada estado de `cerebro_dueno_preguntas`:
 *  · `respondida` → contestada.
 *  · `asumida` (estado nuevo de Cerebro) → asumida, y su supuesto pasa al redactor como «supuesto aceptado por el dueño». Sin texto de supuesto NO cierra: nunca se inventa.
 *  · `obsoleta` con motivo del dueño («Emilio …», la misma regla de Decisiones) → descartada.
 *  · `obsoleta` por el sistema → reemplazada: otra pregunta tomó su lugar; el dueño ya no la ve y no puede contestarla, así que no frena.
 *  · `pendiente` y `vencida` → abiertas. Vencer no es contestar.
 *  · cualquier estado desconocido → abierta (más estricto, nunca más laxo).
 * Ground truth 06-nov: `finanzas_preguntas` tiene 0 filas; las preguntas de finanzas viven en `cerebro_dueno_preguntas` con su oficina, el flujo y la ejecución del plan.
 * ¿Limita a un agente? Sí, al redactor: con una pregunta abierta, espera. Hoy escribe igual (la compuerta no está cableada). Ejemplo bueno que frenaría: un plan
 * urgente que Emilio quiere ver con supuestos; para eso están «Asumir» y «Descartar», que lo sueltan en el momento.
 */
import { loDescartoElDueno } from '../direccion/decisiones-registro'

export interface PreguntaDelPlan {
  id: string
  tema: string
  pregunta: string
  estado: string
  oficina: string | null
  motivo_descarte: string | null
  /** el supuesto que el dueño aceptó al asumir (lo guarda Cerebro) */
  supuesto: string | null
  asumida_en: string | null
}
export type Cierre = 'contestada' | 'asumida' | 'descartada' | 'reemplazada'
export type MotivoAbierta = 'sin_contestar' | 'vencida' | 'asumida_sin_supuesto' | 'estado_desconocido'
export interface PreguntaAbierta { id: string; tema: string; pregunta: string; oficina: string | null; motivo: MotivoAbierta }
export interface SupuestoDelDueno { pregunta_id: string; tema: string; pregunta: string; supuesto: string; asumida_en: string | null }
export interface DecisionDeLaCompuerta {
  decision: 'sigue' | 'espera'
  abiertas: PreguntaAbierta[]
  cerradas: Record<Cierre, number>
  /** para el redactor: lo que el dueño eligió suponer, marcado aparte de los supuestos del sistema */
  supuestos_del_dueno: SupuestoDelDueno[]
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function cierreDe(p: PreguntaDelPlan): Cierre | MotivoAbierta {
  switch (p.estado) {
    case 'respondida': return 'contestada'
    case 'asumida': return texto(p.supuesto) ? 'asumida' : 'asumida_sin_supuesto'
    case 'obsoleta': return loDescartoElDueno(p.motivo_descarte) ? 'descartada' : 'reemplazada'
    case 'pendiente': return 'sin_contestar'
    case 'vencida': return 'vencida'
    default: return 'estado_desconocido'
  }
}

const CIERRES = new Set<string>(['contestada', 'asumida', 'descartada', 'reemplazada'])

export function evaluarCompuerta(preguntas: PreguntaDelPlan[]): DecisionDeLaCompuerta {
  const cerradas: Record<Cierre, number> = { contestada: 0, asumida: 0, descartada: 0, reemplazada: 0 }
  const abiertas: PreguntaAbierta[] = []
  const supuestos_del_dueno: SupuestoDelDueno[] = []
  for (const p of preguntas) {
    const c = cierreDe(p)
    if (CIERRES.has(c)) {
      cerradas[c as Cierre]++
      if (c === 'asumida') supuestos_del_dueno.push({ pregunta_id: p.id, tema: p.tema, pregunta: p.pregunta, supuesto: texto(p.supuesto) as string, asumida_en: p.asumida_en })
    } else abiertas.push({ id: p.id, tema: p.tema, pregunta: p.pregunta, oficina: p.oficina, motivo: c as MotivoAbierta })
  }
  return { decision: abiertas.length ? 'espera' : 'sigue', abiertas, cerradas, supuestos_del_dueno }
}

export interface EntradaDeLaCompuerta { client_id: string; workflow_id: string; workflow_execution_ids: string[] }
export interface PuertoDeLaCompuerta {
  /** las preguntas que hicieron estas ejecuciones del plan. Una lectura fallida LANZA: leer un error como «no hay preguntas» soltaría al redactor */
  preguntasDeLaCorrida(e: EntradaDeLaCompuerta): Promise<PreguntaDelPlan[]>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validarEntrada(c: Record<string, unknown>): { ok: true; e: EntradaDeLaCompuerta } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const client_id = texto(c.client_id), workflow_id = texto(c.workflow_id)
  if (!client_id || !UUID.test(client_id)) errores.push('`client_id` es un uuid obligatorio')
  if (!workflow_id) errores.push('`workflow_id` es obligatorio')
  // la corrida original y, si se reanudó, las ejecuciones siguientes: cada pregunta queda en la ejecución que la hizo
  const ids = Array.isArray(c.workflow_execution_ids) ? c.workflow_execution_ids.map((x) => (typeof x === 'number' ? String(x) : texto(x))) : null
  if (!ids || !ids.length || ids.length > 20 || ids.some((x) => !x || !/^\d+$/.test(x))) errores.push('`workflow_execution_ids` es una lista de 1 a 20 ids de ejecución')
  if (errores.length) return { ok: false, errores }
  return { ok: true, e: { client_id: client_id as string, workflow_id: workflow_id as string, workflow_execution_ids: [...new Set(ids as string[])] } }
}

export async function compuerta(c: Record<string, unknown>, P: PuertoDeLaCompuerta): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const v = validarEntrada(c)
  if (!v.ok) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: v.errores } }
  let preguntas: PreguntaDelPlan[]
  try { preguntas = await P.preguntasDeLaCorrida(v.e) } catch (x) {
    // falla cerrada: sin poder leer, el redactor no sigue
    return { status: 502, cuerpo: { error: 'lectura_fallida', decision: 'espera', detalle: x instanceof Error ? x.message : String(x) } }
  }
  return { status: 200, cuerpo: { ...evaluarCompuerta(preguntas) } }
}
