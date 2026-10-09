/**
 * EL REVISOR CIEGO y los DESTINOS DE RECADO PERMITIDOS · dos reglas del canon hechas código.
 *  · Ciego: el pedido al revisor de otro proveedor se arma con una LISTA CERRADA de artefactos (pieza, imagen, dirección visual, manual, plan, brief, material del portero). Nada del hilo,
 *    ni las fichas del jefe, ni las respuestas del autor puede entrar: si llega una clave fuera de la lista, se rechaza.
 *  · Recados: «el único humano en el circuito es Emilio» (09-oct). Un «necesito…» de la oficina solo va a destinos de tipo HERRAMIENTA que operan; `dueno` (persona) queda excluido por código.
 */
export const CLAVES_DEL_PEDIDO_CIEGO = ['pieza', 'imagen', 'visual_direction', 'manual', 'plan', 'brief', 'material_portero'] as const

export function armarPedidoCiego(fuentes: Record<string, unknown>): { ok: true; pedido: Record<string, unknown> } | { ok: false; sobran: string[] } {
  const sobran = Object.keys(fuentes).filter((k) => !(CLAVES_DEL_PEDIDO_CIEGO as readonly string[]).includes(k))
  if (sobran.length) return { ok: false, sobran }
  const pedido: Record<string, unknown> = {}
  for (const k of CLAVES_DEL_PEDIDO_CIEGO) if (fuentes[k] !== undefined) pedido[k] = fuentes[k]
  return { ok: true, pedido }
}

export interface DestinoDeRecado { destino: string; tipo: 'herramienta' | 'agente' | 'persona'; estado_del_brazo: 'opera' | 'por_configurar' | 'no_existe' | string; activo?: boolean }
export function destinoPermitidoParaOficina(d: DestinoDeRecado): { ok: true } | { ok: false; motivo: string } {
  if (d.activo === false) return { ok: false, motivo: `el destino «${d.destino}» está apagado` }
  if (d.tipo !== 'herramienta') return { ok: false, motivo: `el destino «${d.destino}» es de tipo «${d.tipo}»: la oficina solo pide cosas a herramientas (nunca a una persona)` }
  if (d.estado_del_brazo !== 'opera') return { ok: false, motivo: `el destino «${d.destino}» no opera (${d.estado_del_brazo})` }
  return { ok: true }
}
