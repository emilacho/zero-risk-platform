/**
 * EL REVISOR EXTERNO (GPT) y los DESTINOS DE RECADO PERMITIDOS · dos reglas del canon hechas código.
 *
 * REVISOR · firma de Emilio 10-oct («se concatena al cerebro, no se le da ningún tipo de reglas, su opinión cuenta como el arreglo que nuestro llm de anthropic no puede ver»):
 *  · recibe la PIEZA (texto + imágenes/láminas) y el CEREBRO del cliente que lee la sala (manual, plan, brief, lo del portero) como contexto, y UNA pregunta abierta;
 *  · SIN reglas, SIN rúbrica, SIN lista de criterios, SIN formato de salida: su respuesta es texto libre y se guarda como OPINIÓN (nunca como dato confirmado);
 *  · sigue CIEGO al hilo y a las fichas de `jefe-marketing` (firma 09-oct): por construcción, porque esta función solo recibe la pieza, las imágenes y el contexto (no recibe el estado del encargo).
 * RECADOS · «el único humano en el circuito es Emilio» (09-oct): un «necesito…» de la oficina solo va a destinos de tipo HERRAMIENTA que operan; `dueno` (persona) queda excluido por código.
 */

/**
 * LA PREGUNTA y el PEDIDO viven en `src/lib/revisor-gpt.ts` (los comparte la revisión del manual): UNA sola pregunta con huecos {qué es} {uso} {público} {objetivo} (firma D3, 10-oct),
 * generalización de la versión literal que dio el propio revisor. Aquí queda lo propio de la oficina: el resumen del encargo sale SOLO del brief.
 */
import { armarPedido, preguntaAlRevisor, PREGUNTA_AL_REVISOR, PUBLICO_SIN_DATO, OBJETIVO_SIN_DATO, type ContextoDelRevisor, type PedidoAlRevisor } from '../revisor-gpt'
export { PREGUNTA_AL_REVISOR, PUBLICO_SIN_DATO, OBJETIVO_SIN_DATO }
export type { ContextoDelRevisor, PedidoAlRevisor }

/** lo que se sabe del encargo (todo sale del brief; lo que no está se dice, no se inventa) */
export interface ResumenDelEncargo { red: string; publico?: string; objetivo?: string; formato?: string; que_es?: string; llamado?: string }

/** la pregunta de una PIEZA de la oficina: qué es = «una pieza», uso = la red */
export function preguntaDelEncargo(r: Pick<ResumenDelEncargo, 'red' | 'publico' | 'objetivo'>): string {
  return preguntaAlRevisor({ que_es: 'una pieza', uso: r.red.trim() || 'una red social', publico: r.publico, objetivo: r.objetivo })
}

/**
 * Arma el pedido al revisor, en este orden: la pregunta (con el resumen del encargo) → la PIEZA completa → el contexto del cliente.
 * Solo recibe esos datos; nada del hilo ni de las fichas puede entrar porque no hay por dónde. Un contexto vacío se omite (no se inventa).
 */
export function armarPedidoAlRevisor(a: { pieza: string; contexto: ContextoDelRevisor[]; imagenes?: string[]; encargo?: ResumenDelEncargo; nota_pieza?: string }): PedidoAlRevisor {
  const enc = a.encargo
  const resumen = enc
    ? [
        enc.formato || enc.red ? `- Red y formato: ${[enc.red, enc.formato].filter(Boolean).join(' · ')}` : '',
        enc.que_es ? `- Qué es: ${enc.que_es}` : '',
        enc.objetivo ? `- Lo que busca: ${enc.objetivo}` : '',
        enc.llamado ? `- Llamado a la acción: ${enc.llamado}` : '',
      ]
    : []
  return armarPedido({ pregunta: enc ? preguntaDelEncargo(enc) : PREGUNTA_AL_REVISOR, resumen, revisado: a.pieza, nota: a.nota_pieza, contexto: a.contexto, imagenes: a.imagenes })
}

export interface DestinoDeRecado { destino: string; tipo: 'herramienta' | 'agente' | 'persona'; estado_del_brazo: 'opera' | 'por_configurar' | 'no_existe' | string; activo?: boolean }
export function destinoPermitidoParaOficina(d: DestinoDeRecado): { ok: true } | { ok: false; motivo: string } {
  if (d.activo === false) return { ok: false, motivo: `el destino «${d.destino}» está apagado` }
  if (d.tipo !== 'herramienta') return { ok: false, motivo: `el destino «${d.destino}» es de tipo «${d.tipo}»: la oficina solo pide cosas a herramientas (nunca a una persona)` }
  if (d.estado_del_brazo !== 'opera') return { ok: false, motivo: `el destino «${d.destino}» no opera (${d.estado_del_brazo})` }
  return { ok: true }
}
