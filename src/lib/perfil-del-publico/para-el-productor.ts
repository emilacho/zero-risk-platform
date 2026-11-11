/**
 * PERFIL DEL PÚBLICO · T2b · el PRODUCTOR de piezas (flujo n8n `lVCLzxQCKNkd3uS0`) lee el perfil por la PUERTA del cerebro, igual que la cadena (T2).
 * GO Lenovo 2026-11-11 14:25 Zúrich. Se publica APAGADO de hecho: mientras T3 no esté encendido no hay perfil vigente y el pedido queda idéntico.
 *
 *   · `perfilDeLaRespuesta`: de lo que contestó la puerta (`GET /api/brain/consultar`) saca el perfil. La misma regla la usa la cadena (`por-http.ts`).
 *   · `perfilDelProductor`: lo mismo, desde el ítem que deja el nodo HTTP de n8n (`fullResponse: true`, `neverError: true`, `onError: continueRegularOutput`).
 *     Un fallo de red, de llave o de lectura es `no_se_pudo_leer` con su motivo: jamás se disfraza de «no hay perfil».
 *   · Este archivo y lo que importa son PUROS (sin base, sin red, sin módulos del servidor): se empaquetan enteros en el nodo de n8n,
 *     así el productor usa EXACTAMENTE estas reglas (el bloque como dato, las marcas, el tope) y no una copia escrita a mano.
 */
import { bloqueDelPerfil, perfilDelAdjunto, type AdjuntoConInformes, type PerfilParaLectores } from './lectores'

export { bloqueDelPerfil }

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** lo que contestó la puerta del cerebro → el perfil para los lectores */
export function perfilDeLaRespuesta(status: number | null, cuerpo: unknown): PerfilParaLectores {
  if (status === null || status < 200 || status >= 300) return { estado: 'no_se_pudo_leer', detalle: `la puerta del cerebro respondió ${status ?? 'sin estado'}` }
  const adj = esObjeto(cuerpo) && esObjeto(cuerpo.contexto_del_cliente) ? (cuerpo.contexto_del_cliente as AdjuntoConInformes) : null
  // el adjunto del portero trae SIEMPRE la lista de informes (vacía si no hay): sin ella no se sabe si hay perfil
  if (!adj || !Array.isArray(adj.informes)) return { estado: 'no_se_pudo_leer', detalle: 'la puerta del cerebro no devolvió el adjunto del cliente' }
  return perfilDelAdjunto(adj)
}

/** el ítem del nodo HTTP de n8n («⑤ Perfil del público · puerta del cerebro») → el perfil para el pedido del productor */
export function perfilDelProductor(item: unknown): PerfilParaLectores {
  if (!esObjeto(item)) return { estado: 'no_se_pudo_leer', detalle: 'el nodo de la puerta del cerebro no dejó salida' }
  if (item.error !== undefined && item.error !== null) {
    const e = item.error
    const m = esObjeto(e) ? String(e.message ?? e.name ?? '') : String(e)
    return { estado: 'no_se_pudo_leer', detalle: `sin red hacia la puerta del cerebro${m ? ` (${m.slice(0, 120)})` : ''}` }
  }
  const status = typeof item.statusCode === 'number' ? item.statusCode : null
  let cuerpo: unknown = item.body
  if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo) } catch { cuerpo = null } }
  return perfilDeLaRespuesta(status, cuerpo)
}

/** lo que viaja con la pieza (y queda en su procedencia): qué perfil se usó, sin su texto */
export function resumenDelPerfil(p: PerfilParaLectores): Record<string, unknown> {
  if (p.estado === 'vigente') return { estado: 'vigente', fecha_de_corte: p.fecha_de_corte, ficha_id: p.ficha_id }
  return p.estado === 'no_se_pudo_leer' ? { estado: 'no_se_pudo_leer', detalle: p.detalle } : { estado: 'sin_perfil' }
}
