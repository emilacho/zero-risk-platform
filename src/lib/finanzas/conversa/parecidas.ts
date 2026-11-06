/**
 * ANTES DE PREGUNTARLE AL DUEÑO, EL JEFE DE FINANZAS MIRA SI YA CONTESTÓ ALGO PARECIDO (05-nov · decisión de Emilio, opción A · para todos los clientes).
 * El código no decide si «presupuesto de pauta» responde a «presupuesto semanal de pauta»: le pasa al agente que pregunta lo que dice la puerta del dueño y el agente razona.
 *  · Sin nada parecido, o si ya hay respuesta del MISMO tema (eso lo resuelve la puerta), no se llama a nadie ni se gasta.
 *  · Si no se puede leer o el agente falla, se pregunta como siempre: una pregunta repetida cuesta menos que un dato perdido, y esto nunca frena al plan.
 *  · Lo que el agente decide queda en `buzon_parecidas`, con su motivo: no se le vuelve a consultar por la misma pregunta en este encargo.
 */
import type { ParecidaDelDueno, PendienteParecida } from '../../buzon-dueno/cerebro-dueno'
import { extraerJson } from './esquemas'
import type { EncargoDeConversa, ModeloPuerto } from './puertos'
import type { CerebroDelDueno } from '../../buzon-dueno/cerebro-dueno'

export const AGENTE_DE_LAS_PARECIDAS = 'chief-financial-officer'
export const PASO_DE_LAS_PARECIDAS = 'revisar_parecidas'
/** el mismo tope de una consulta a finanzas: si el agente lo agota, se pregunta como siempre */
export const TOPE_DE_LAS_PARECIDAS_USD = 0.4

export type DecisionSobreLaParecida = 'ya_contestada' | 'pendiente_cubre' | 'preguntar'
export interface VeredictoDeParecida {
  decision: DecisionSobreLaParecida
  por_que: string
  /** solo con `ya_contestada`: la ficha que responde, y su respuesta literal tal como la guardó el cerebro */
  ficha_id?: string
  respuesta?: string
  /** por qué no llegó a decidir el agente (no se pudo leer, falló, citó algo que no existe) */
  sin_razonar?: string
}
export type VeredictosDeParecidas = Record<string, VeredictoDeParecida>

interface PreguntaARevisar { clave: string; tema: string; texto: string }
interface ConParecidas extends PreguntaARevisar { parecidas: ParecidaDelDueno[]; pendientes_parecidas: PendienteParecida[] }

export interface PuertosDeLasParecidas {
  cerebro: CerebroDelDueno
  modelo?: ModeloPuerto
  guardar?(veredictos: VeredictosDeParecidas, costo_usd: number): Promise<void>
}

export function tareaDeLasParecidas(preguntas: ConParecidas[]): string {
  return [
    'Eres el jefe de finanzas. Vas a preguntarle al dueño lo que sigue, pero el cerebro del cliente guarda respuestas y preguntas de temas parecidos.',
    'Razona si ya está contestado. Decide tú, pregunta por pregunta:',
    '- «ya_contestada»: una respuesta guardada ya responde esto. Indica su `ficha_id`. Mira la fecha: decide tú si sigue valiendo.',
    '- «pendiente_cubre»: otra pregunta que sigue sin responder ya cubre lo mismo.',
    '- «preguntar»: hay que preguntar igual. Di por qué lo parecido no alcanza.',
    'Escribe `por_que` en español, con tuteo. Responde SOLO un objeto JSON: {"veredictos":[{"clave":"…","decision":"ya_contestada|pendiente_cubre|preguntar","ficha_id":"… o null","por_que":"…"}]}.',
    '',
    JSON.stringify(preguntas.map((q) => ({ clave: q.clave, pregunta: q.texto, tema: q.tema, respuestas_parecidas: q.parecidas, preguntas_parecidas_sin_responder: q.pendientes_parecidas })), null, 2),
  ].join('\n')
}

function leerVeredicto(q: ConParecidas, crudo: unknown): VeredictoDeParecida {
  if (typeof crudo !== 'object' || crudo === null) return { decision: 'preguntar', por_que: '', sin_razonar: 'el agente no dijo nada de esta pregunta' }
  const v = crudo as Record<string, unknown>
  const por_que = typeof v.por_que === 'string' ? v.por_que.trim() : ''
  if (v.decision === 'ya_contestada') {
    const ficha = q.parecidas.find((f) => f.ficha_id === v.ficha_id)
    // la respuesta sale de la ficha, nunca del agente: una cifra que el dueño no dijo no entra como si la hubiera dicho
    if (!ficha) return { decision: 'preguntar', por_que, sin_razonar: `el agente citó una ficha que no está entre las parecidas (${String(v.ficha_id).slice(0, 60)})` }
    return { decision: 'ya_contestada', por_que, ficha_id: ficha.ficha_id, respuesta: ficha.respuesta }
  }
  if (v.decision === 'pendiente_cubre') {
    if (!q.pendientes_parecidas.length) return { decision: 'preguntar', por_que, sin_razonar: 'el agente dijo que otra pregunta la cubre, pero no hay ninguna parecida sin responder' }
    return { decision: 'pendiente_cubre', por_que }
  }
  if (v.decision === 'preguntar') return { decision: 'preguntar', por_que }
  return { decision: 'preguntar', por_que, sin_razonar: `decisión que no se entiende (${String(v.decision).slice(0, 60)})` }
}

/**
 * Devuelve lo decidido para cada pregunta que tenía algo parecido, junto con lo ya decidido antes en este encargo. Nunca lanza: lo que falle se pregunta como siempre.
 * `previos` evita pagar dos veces por la misma pregunta si la llamada se repite.
 */
export async function revisarParecidas(P: PuertosDeLasParecidas, e: Pick<EncargoDeConversa, 'id' | 'client_id' | 'dry_run' | 'semilla'>, preguntas: PreguntaARevisar[], previos: VeredictosDeParecidas = {}): Promise<VeredictosDeParecidas> {
  const faltan = preguntas.filter((q) => !previos[q.clave])
  if (!faltan.length || !P.cerebro.leerParecidas) return previos
  const lecturas = await Promise.all(faltan.map(async (q) => ({ q, l: await P.cerebro.leerParecidas!({ client_id: e.client_id, tema: q.tema }).catch(() => ({ ok: false as const, error: 'red' })) })))
  const veredictos: VeredictosDeParecidas = { ...previos }
  const conAlgo: ConParecidas[] = []
  for (const { q, l } of lecturas) {
    // sin lectura no es «no hay parecidas»: se dice en el rastro. Lo demás lo resuelve la puerta al registrar
    if (!l.ok) { veredictos[q.clave] = { decision: 'preguntar', por_que: '', sin_razonar: `no se pudieron leer las parecidas: ${l.error}` }; continue }
    if (!l.respondida && (l.parecidas.length || l.pendientes_parecidas.length)) conAlgo.push({ ...q, parecidas: l.parecidas, pendientes_parecidas: l.pendientes_parecidas })
  }
  let costo = 0
  if (conAlgo.length) {
    const sinRazonar = (motivo: string) => { for (const q of conAlgo) veredictos[q.clave] = { decision: 'preguntar', por_que: '', sin_razonar: motivo } }
    if (!P.modelo) sinRazonar('sin modelo configurado')
    else {
      const r = await P.modelo.invocar({ agente: AGENTE_DE_LAS_PARECIDAS, tarea: tareaDeLasParecidas(conAlgo), encargo_id: e.id, client_id: e.client_id, paso: PASO_DE_LAS_PARECIDAS, tope_usd: TOPE_DE_LAS_PARECIDAS_USD, dry_run: e.dry_run === true, ...(typeof e.semilla?.corrida === 'string' && e.semilla.corrida ? { trabajo: { trabajo_tipo: 'plan', trabajo_id: e.semilla.corrida } } : {}) }).catch((x) => ({ ok: false as const, error: x instanceof Error ? x.message : String(x), costo_usd: 0 }))
      costo = r.costo_usd
      if (!r.ok) sinRazonar(`el agente falló: ${r.error}`.slice(0, 300))
      else {
        const j = extraerJson(r.salida)
        const lista = j.ok && typeof j.valor === 'object' && j.valor !== null ? (Array.isArray(j.valor) ? j.valor : (j.valor as { veredictos?: unknown }).veredictos) : null
        if (!Array.isArray(lista)) sinRazonar('la respuesta del agente no se pudo leer')
        else for (const q of conAlgo) veredictos[q.clave] = leerVeredicto(q, lista.find((x) => (x as { clave?: unknown } | null)?.clave === q.clave))
      }
    }
  }
  if (Object.keys(veredictos).length !== Object.keys(previos).length) await P.guardar?.(veredictos, costo)?.catch(() => undefined)
  return veredictos
}
