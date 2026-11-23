/**
 * ENCARGO 15 · ADENDA 1 (firma de Emilio, 21-nov 12:09–12:13: «no se puede crear nada sin el portero del cerebro»).
 *
 * Si la consulta al cerebro FALLA (llave, saldo, red, status ≠ 200, base), el agente NO crea: el paso se detiene
 * ANTES de llamar al modelo (US$ 0), con estado claro «esperando al cerebro» y el motivo real. Se retoma
 * reintentando el MISMO paso cuando el cerebro vuelve: lo ya hecho queda en lo ya guardado y no se rehace a mano.
 *
 * Lo que NO detiene:
 *  · 0 resultados (`brain_empty_for_client`): el agente sigue y queda anotado;
 *  · consulta vacía o sin cliente: no hay cerebro que consultar;
 *  · el empuje apagado por el pedido (encargo 9);
 *  · el seco (`dryRun`): no crea nada, sirve justamente para probar sin el cerebro.
 *
 * La alarma va a `#alertas` por la puerta ÚNICA que ya existe en la plataforma (`POST /api/brain/alimentar/alarma`),
 * que guarda el incidente en la base y publica UNA vez; las repeticiones van al hilo. Este aviso NUNCA detiene ni
 * tumba nada: si la puerta no responde, se anota y el paso igual queda detenido (la detención no depende de la alarma).
 */
import type { EnrichmentResult } from './brain-enrichment'

export const ESTADO_ESPERANDO_AL_CEREBRO = 'esperando_al_cerebro'
/** UNA alarma por incidente: la clave fija agrupa todos los pasos detenidos por la misma caída */
export const CLAVE_DE_INCIDENTE_DEL_CEREBRO = 'cerebro:consulta-fallo'

export interface Espera {
  detiene: true
  motivo: string
  /** el mensaje completo del fallo, para `result.error` */
  error: string
}

/** ¿este resultado del cerebro detiene el paso? Pura. */
export function esperaDelCerebro(enrichment: Pick<EnrichmentResult, 'brain_fallo' | 'error' | 'brain_error_detalle'>, dryRun: boolean): Espera | null {
  if (enrichment.brain_fallo !== true || dryRun) return null
  const motivo = [enrichment.error ?? 'consulta fallida', enrichment.brain_error_detalle].filter(Boolean).join(' · ')
  return {
    detiene: true,
    motivo,
    error: `${ESTADO_ESPERANDO_AL_CEREBRO}: la consulta al cerebro falló (${motivo}); el agente no crea sin el cerebro — este mismo paso se reintenta cuando vuelva`,
  }
}

export interface ResultadoDelAviso { entregada: boolean; detalle: string }
type Traer = (url: string, init?: RequestInit) => Promise<Response>

/** avisa el incidente por la puerta interna de la plataforma · best effort · NUNCA lanza */
export async function avisarEsperaAlCerebro(a: { agente: string; cliente: string | null | undefined; motivo: string; fetchImpl?: Traer; env?: Record<string, string | undefined> }): Promise<ResultadoDelAviso> {
  const env = a.env ?? process.env
  const base = (env.ZR_PLATFORM_URL ?? '').replace(/\/+$/, '')
  const llave = env.INTERNAL_API_KEY ?? ''
  if (!base || !llave) return { entregada: false, detalle: 'sin ZR_PLATFORM_URL o INTERNAL_API_KEY en el entorno del corredor' }
  const traer = a.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  const texto = `🔴 El cerebro no responde a los agentes y los pasos quedan detenidos esperándolo. Motivo: ${a.motivo}. Último paso detenido: ${a.agente} (cliente ${a.cliente || 'sin cliente'}). Se reanudan reintentando el mismo paso cuando el cerebro vuelva.`
  try {
    const r = await traer(`${base}/api/brain/alimentar/alarma`, {
      method: 'POST',
      headers: { 'x-api-key': llave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: false, clave: CLAVE_DE_INCIDENTE_DEL_CEREBRO, texto }),
      signal: AbortSignal.timeout(8000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; accion?: string; detalle?: string }
    if (!r.ok) return { entregada: false, detalle: `la puerta de alarmas respondió ${r.status}` }
    return { entregada: j.ok === true, detalle: `${j.accion ?? 'sin accion'}${j.detalle ? `: ${j.detalle}` : ''}` }
  } catch (e) {
    return { entregada: false, detalle: e instanceof Error ? e.message : String(e) }
  }
}
