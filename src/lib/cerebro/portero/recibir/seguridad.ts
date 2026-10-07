/**
 * PASO 7 · filtro de seguridad POR SEGMENTO. Es el ÚNICO archivo del cerebro que importa `ingress-filter` (excepción firmada; una prueba permanente exige que sea el único).
 * Usa la función pura `runIngressFilter` tal como está (no se toca el filtro), con política propia en modo ESTRICTO (el interruptor de la puerta vieja no manda)
 * y SIN la capa del clasificador (no hay una llamada extra al modelo). Solo se aparta el segmento sospechoso; el resto del ingreso sigue.
 * Un filtro que falla deja el segmento APARTADO (falla cerrado): nunca pasa por error.
 */
import { DEFAULT_ROUTE_POLICY, runIngressFilter } from '../../../ingress-filter'
import type { Segmento } from './segmentos'

export interface Apartado { n: number; firma: string; capa: string; severidad: string; texto: string }
export interface VeredictoDelFiltro { allow: boolean; capa?: string; severidad?: string }
export type Filtro = (texto: string) => Promise<VeredictoDelFiltro>

const POLITICA_ESTRICTA = { ...DEFAULT_ROUTE_POLICY, route_id: 'cerebro_portero_recibir', shadow_mode: false }

/** los emojis compuestos traen un carácter invisible (U+200D) que el filtro lee como sospechoso: se quitan SOLO para el filtro; el texto guardado no cambia */
export const normalizarParaElFiltro = (t: string): string => t.replace(/[​‌‍⁠︎️]/g, '')

export const filtroReal: Filtro = async (texto) => {
  const d = await runIngressFilter(
    { raw_text: texto, source: 'webhook_generic', ingress_route: 'cerebro/portero/recibir' },
    { route: POLITICA_ESTRICTA, skip_classifier: true },
  )
  return { allow: d.allow, capa: d.block_gate ?? 'desconocida', severidad: d.block_severity ?? d.severity }
}

export async function filtrarSegmentos(segmentos: Segmento[], opciones: { filtro?: Filtro } = {}): Promise<{ limpios: Segmento[]; apartados: Apartado[] }> {
  const filtro = opciones.filtro ?? filtroReal
  const limpios: Segmento[] = []
  const apartados: Apartado[] = []
  for (const s of segmentos) {
    try {
      const v = await filtro(normalizarParaElFiltro(s.texto))
      if (v.allow) limpios.push(s)
      else apartados.push({ n: s.n, firma: s.firma, capa: v.capa ?? 'desconocida', severidad: v.severidad ?? 'UNKNOWN', texto: s.texto })
    } catch {
      apartados.push({ n: s.n, firma: s.firma, capa: 'filtro_fallo', severidad: 'UNKNOWN', texto: s.texto })
    }
  }
  return { limpios, apartados }
}
