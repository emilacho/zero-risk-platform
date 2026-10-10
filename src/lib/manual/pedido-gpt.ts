/**
 * S6 · EL PEDIDO A GPT CIEGO para el manual. PURO. Usa LA MISMA pregunta que la oficina (firma D3): solo cambian los cuatro huecos.
 * GPT recibe el manual en limpio y el material crudo ordenado (R2); NO recibe hallazgos del código, puntajes, versiones anteriores ni lo que corrigió el autor (ciego por construcción:
 * esta función no tiene por dónde recibirlos).
 */
import { armarPedido, preguntaAlRevisor, type PedidoAlRevisor } from '../revisor-gpt'
import type { Materia } from './materia'

export const QUE_ES_EL_MANUAL = 'el manual de marca de un negocio'
export const USO_DEL_MANUAL = 'guiar todo lo que se produzca para ese negocio'
export const PUBLICO_DEL_MANUAL = 'quien lo describe en el material raspado de sus propias páginas y redes'
export const OBJETIVO_DEL_MANUAL = 'que lo que se produzca suene y se vea como el negocio es de verdad'
export const FUNCION_DEL_MATERIAL = 'lo que el cliente publicó de sí mismo (datos, ubicaciones, horarios y también sus propias frases y promesas)'

export const preguntaDelManual = (h: { publico?: string; objetivo?: string } = {}): string =>
  preguntaAlRevisor({ que_es: QUE_ES_EL_MANUAL, uso: USO_DEL_MANUAL, publico: h.publico ?? PUBLICO_DEL_MANUAL, objetivo: h.objetivo ?? OBJETIVO_DEL_MANUAL })

export function armarPedidoDelManual(a: { manualEnLimpio: string; materia: Materia; publico?: string; objetivo?: string }): PedidoAlRevisor {
  const recortes = a.materia.recortes.map((r) => `${r.bloque}: ${r.leidos} de ${r.total} caracteres`)
  return armarPedido({
    pregunta: preguntaDelManual(a),
    titulo_de_lo_revisado: 'El manual de marca',
    revisado: a.manualEnLimpio,
    contexto: a.materia.bloques.map((b) => ({ titulo: b.rotulo, funcion: FUNCION_DEL_MATERIAL, texto: b.texto })),
    titulo_del_contexto: 'Material crudo de las páginas y redes propias',
    intro_del_contexto: 'Es el material tal como se raspó, sin resumir ni interpretar. Mezcla hechos con lo que el negocio dice de sí mismo; cada bloque dice de dónde sale.' + (recortes.length ? ` Algunos bloques están recortados (${recortes.join('; ')}); el aviso va dentro del bloque.` : ''),
  })
}
