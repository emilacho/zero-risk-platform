/**
 * PERFIL DEL PÚBLICO · T2 · la cadena (brief y gran idea) lee el perfil por la PUERTA del portero (`GET /api/brain/consultar`), nunca por tablas del cerebro.
 * La consulta devuelve SIEMPRE `contexto_del_cliente` (el mismo adjunto que arma el portero, un informe vigente por tipo); de ahí sale el perfil.
 *
 *   · La llave entra por parámetro y NUNCA se imprime.
 *   · Nunca lanza. Un fallo de red, de llave o de lectura es `no_se_pudo_leer` con su motivo: jamás se disfraza de «no hay perfil».
 *   · Quién consulta queda registrado por la puerta (`oficina=cadena`, `agente=<la mesa>`).
 */
import { perfilDelAdjunto, type AdjuntoConInformes, type PerfilParaLectores } from './lectores'

type Fetch = typeof fetch
export type LectorDelPerfil = (clientId: string, mesa: 'brief' | 'gran_idea') => Promise<PerfilParaLectores>

export function perfilPorHttp(p: { base: string; llave: string; fetch?: Fetch }): LectorDelPerfil {
  const f = p.fetch ?? fetch
  const url = `${p.base.replace(/\/+$/, '')}/api/brain/consultar`
  return async (clientId, mesa) => {
    if (!p.base || !p.llave) return { estado: 'no_se_pudo_leer', detalle: 'la puerta del cerebro no está configurada' }
    try {
      const qs = `client_id=${encodeURIComponent(clientId)}&oficina=cadena&agente=${encodeURIComponent(mesa)}&clase=informe_de_analisis&limite=1`
      const r = await f(`${url}?${qs}`, { method: 'GET', headers: { 'x-api-key': p.llave } })
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
      if (r.status < 200 || r.status >= 300) return { estado: 'no_se_pudo_leer', detalle: `la puerta del cerebro respondió ${r.status}` }
      const adj = j && typeof j.contexto_del_cliente === 'object' && j.contexto_del_cliente !== null ? (j.contexto_del_cliente as AdjuntoConInformes) : null
      // el adjunto del portero trae SIEMPRE la lista de informes (vacía si no hay): sin ella no se sabe si hay perfil
      if (!adj || !Array.isArray(adj.informes)) return { estado: 'no_se_pudo_leer', detalle: 'la puerta del cerebro no devolvió el adjunto del cliente' }
      return perfilDelAdjunto(adj)
    } catch {
      return { estado: 'no_se_pudo_leer', detalle: 'sin red hacia la puerta del cerebro' }
    }
  }
}
