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
 * LA PREGUNTA · la versión literal que dio el propio revisor (consulta del 10-oct, firmada por Emilio: `raw/tasks/2026-10-10-LISTO-CC2-consulta-gpt.md`).
 * Los tres huecos se llenan con datos del encargo; cambiar el texto es cambiar una firma.
 */
export const PREGUNTA_AL_REVISOR = 'Te comparto una pieza para {red}, dirigida a {público}, que busca {objetivo}, junto con el contexto de la marca. Dame una lectura independiente: qué funciona, qué puede fallar y qué cambiarías, si cambiarías algo. Puedes cuestionar también la idea o el enfoque. Sé concreto y apóyate en lo que ves; distingue lo que observas de lo que supones sobre el público. Usa el contexto para entender la pieza, no para justificarla.'

/** lo que se sabe del encargo (todo sale del brief; lo que no está se dice, no se inventa) */
export interface ResumenDelEncargo { red: string; publico?: string; objetivo?: string; formato?: string; que_es?: string; llamado?: string }
export const PUBLICO_SIN_DATO = 'el público del cliente (lo describen los documentos de abajo)'
export const OBJETIVO_SIN_DATO = 'lo que pide el brief'

export function preguntaDelEncargo(r: Pick<ResumenDelEncargo, 'red' | 'publico' | 'objetivo'>): string {
  return PREGUNTA_AL_REVISOR
    .replace('{red}', r.red.trim() || 'una red social')
    .replace('{público}', (r.publico ?? '').trim() || PUBLICO_SIN_DATO)
    .replace('{objetivo}', (r.objetivo ?? '').trim() || OBJETIVO_SIN_DATO)
}

/** un documento de apoyo: su nombre y SU FUNCIÓN (para que el revisor sepa qué es hecho, qué es aspiración y cuál manda si se contradicen) */
export interface ContextoDelRevisor { titulo: string; texto: string; funcion?: string }
export interface PedidoAlRevisor { texto: string; imagenes: string[] }

const INTRO_CONTEXTO = 'Los documentos mezclan hechos (lo que el cliente es y tiene) con aspiraciones (lo que quiere lograr). Cada uno dice qué es. Si dos se contradicen, vale el manual de marca vigente. Es un resumen de lo vigente, no el historial.'

/**
 * Arma el pedido al revisor, en este orden: la pregunta (con el resumen del encargo) → la PIEZA completa → el contexto del cliente.
 * Solo recibe esos datos; nada del hilo ni de las fichas puede entrar porque no hay por dónde. Un contexto vacío se omite (no se inventa).
 */
export function armarPedidoAlRevisor(a: { pieza: string; contexto: ContextoDelRevisor[]; imagenes?: string[]; encargo?: ResumenDelEncargo; nota_pieza?: string }): PedidoAlRevisor {
  const enc = a.encargo
  const partes = [enc ? preguntaDelEncargo(enc) : PREGUNTA_AL_REVISOR]
  if (enc) {
    const filas = [
      enc.formato || enc.red ? `- Red y formato: ${[enc.red, enc.formato].filter(Boolean).join(' · ')}` : '',
      enc.que_es ? `- Qué es: ${enc.que_es}` : '',
      enc.objetivo ? `- Lo que busca: ${enc.objetivo}` : '',
      enc.llamado ? `- Llamado a la acción: ${enc.llamado}` : '',
    ].filter(Boolean)
    if (filas.length) partes.push(`## Resumen del encargo\n${filas.join('\n')}`)
  }
  partes.push(`## La pieza\n${a.pieza.trim() || '(sin texto)'}${a.nota_pieza ? `\n\n(${a.nota_pieza})` : ''}`)
  const docs = a.contexto.filter((c) => c.texto.trim())
  if (docs.length) partes.push(`## Contexto de la marca\n${INTRO_CONTEXTO}\n\n${docs.map((c) => `### ${c.titulo}${c.funcion ? ` — ${c.funcion}` : ''}\n${c.texto.trim()}`).join('\n\n')}`)
  return { texto: partes.join('\n\n'), imagenes: (a.imagenes ?? []).filter((u) => typeof u === 'string' && u !== '') }
}

export interface DestinoDeRecado { destino: string; tipo: 'herramienta' | 'agente' | 'persona'; estado_del_brazo: 'opera' | 'por_configurar' | 'no_existe' | string; activo?: boolean }
export function destinoPermitidoParaOficina(d: DestinoDeRecado): { ok: true } | { ok: false; motivo: string } {
  if (d.activo === false) return { ok: false, motivo: `el destino «${d.destino}» está apagado` }
  if (d.tipo !== 'herramienta') return { ok: false, motivo: `el destino «${d.destino}» es de tipo «${d.tipo}»: la oficina solo pide cosas a herramientas (nunca a una persona)` }
  if (d.estado_del_brazo !== 'opera') return { ok: false, motivo: `el destino «${d.destino}» no opera (${d.estado_del_brazo})` }
  return { ok: true }
}
