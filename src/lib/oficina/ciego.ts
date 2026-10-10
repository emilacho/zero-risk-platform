/**
 * EL REVISOR EXTERNO (GPT) y los DESTINOS DE RECADO PERMITIDOS · dos reglas del canon hechas código.
 *
 * REVISOR · firma de Emilio 10-oct («se concatena al cerebro, no se le da ningún tipo de reglas, su opinión cuenta como el arreglo que nuestro llm de anthropic no puede ver»):
 *  · recibe la PIEZA (texto + imágenes/láminas) y el CEREBRO del cliente que lee la sala (manual, plan, brief, lo del portero) como contexto, y UNA pregunta abierta;
 *  · SIN reglas, SIN rúbrica, SIN lista de criterios, SIN formato de salida: su respuesta es texto libre y se guarda como OPINIÓN (nunca como dato confirmado);
 *  · sigue CIEGO al hilo y a las fichas de `jefe-marketing` (firma 09-oct): por construcción, porque esta función solo recibe la pieza, las imágenes y el contexto (no recibe el estado del encargo).
 * RECADOS · «el único humano en el circuito es Emilio» (09-oct): un «necesito…» de la oficina solo va a destinos de tipo HERRAMIENTA que operan; `dueno` (persona) queda excluido por código.
 */

/** la pregunta abierta: sin criterios, sin reglas, sin formato (cambiarla es cambiar una firma) */
export const PREGUNTA_AL_REVISOR = 'Eres un revisor externo e independiente: no ves ninguna conversación previa ni el trabajo de nadie más. Abajo está lo que sabemos del cliente y una pieza de marketing (con sus imágenes, si las hay). Dinos con libertad lo que opinas de la pieza: lo que cambiarías, lo que te llama la atención, lo que otro modelo no vería. No hay criterios ni formato: escribe como quieras.'

export interface ContextoDelRevisor { titulo: string; texto: string }
export interface PedidoAlRevisor { texto: string; imagenes: string[] }

/**
 * Arma el pedido al revisor: pregunta abierta + contexto del cerebro (en el orden que se pasa) + la pieza. Solo recibe esos tres datos; nada del hilo ni de las fichas puede entrar
 * porque no hay por dónde. Un contexto vacío se omite (no se inventa).
 */
export function armarPedidoAlRevisor(a: { pieza: string; contexto: ContextoDelRevisor[]; imagenes?: string[] }): PedidoAlRevisor {
  const partes = [PREGUNTA_AL_REVISOR]
  for (const c of a.contexto) if (c.texto.trim()) partes.push(`## ${c.titulo}\n${c.texto.trim()}`)
  partes.push(`## La pieza\n${a.pieza.trim() || '(sin texto)'}`)
  return { texto: partes.join('\n\n'), imagenes: (a.imagenes ?? []).filter((u) => typeof u === 'string' && u !== '') }
}

export interface DestinoDeRecado { destino: string; tipo: 'herramienta' | 'agente' | 'persona'; estado_del_brazo: 'opera' | 'por_configurar' | 'no_existe' | string; activo?: boolean }
export function destinoPermitidoParaOficina(d: DestinoDeRecado): { ok: true } | { ok: false; motivo: string } {
  if (d.activo === false) return { ok: false, motivo: `el destino «${d.destino}» está apagado` }
  if (d.tipo !== 'herramienta') return { ok: false, motivo: `el destino «${d.destino}» es de tipo «${d.tipo}»: la oficina solo pide cosas a herramientas (nunca a una persona)` }
  if (d.estado_del_brazo !== 'opera') return { ok: false, motivo: `el destino «${d.destino}» no opera (${d.estado_del_brazo})` }
  return { ok: true }
}
