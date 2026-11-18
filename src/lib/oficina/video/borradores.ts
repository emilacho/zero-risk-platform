/**
 * EL BORRADOR EN VIDEO DE CADA PROPUESTA · 17-nov · S2-4 tramo 4 (CC1) · decisión de Emilio 16-nov 22:23: «si son videos tienen que mostrarme más; no puedo descifrar la
 * calidad de un video de 11 s o más con 4 imágenes». Cada propuesta trae un ANIMATIC: sus planos en movimiento, con su duración y su ritmo reales, a calidad de borrador.
 *  · Es EL MISMO camino B del video final (encuadre → cotizar la SUMA → un envío por plano → esperar a todos → unir), con la calidad de borrador como DATO de la
 *    plantilla (`limites.video.borrador.resolucion`, 480p por omisión). Cada clip arranca de la imagen clave de BORRADOR de su plano (la de la tarjeta).
 *  · Solo en la fase de propuestas: con la propuesta ya aprobada (o sin propuestas) el paso pasa de largo SIN GASTAR (#1077 · parada única).
 *  · No frena el encargo: una propuesta cuyo borrador no salió queda con `url: null` y su error (la tarjeta muestra «El borrador en video todavía no está»);
 *    lo que el proveedor cobró igual va al gasto del encargo y al libro (§2 de CC7).
 *  · La tarjeta (CC5) lee `borrador_video.propuestas[i].url` y su `costo_usd` por la fila de la dirección (`direccion/decisiones-propuestas.ts`).
 * Puro: arma los pedidos; el envío y la espera viven en `orquestador-video.ts`.
 */
import { RESOLUCIONES_PERMITIDAS, type CatalogoDeModelos } from '../../video/parametros'
import type { BriefLeido } from '../brief'
import type { FotoEtiquetada } from '../fotos'
import type { Estado, Paso } from '../tipos'
import { propuestasDe } from './aprobacion'
import type { ImagenesClave } from './imagen-clave'
import { pedidosPorPlano, type PedidoDePlano } from './planos'

/** la función del paso de código y su artefacto (el nombre lo lee la fila de la dirección: no cambiarlo sin avisar a CC5) */
export const FUNCION_BORRADOR_VIDEO = 'borrador_video'
export const ARTEFACTO_BORRADOR_VIDEO = 'borrador_video'
/** dónde guarda el paso sus pedidos y su envío mientras espera al brazo */
export const ARTEFACTO_PEDIDO_BORRADOR = 'pedido_borrador_video'
export const RESOLUCION_DEL_BORRADOR_POR_OMISION = '480p'

/** el borrador de UNA propuesta (lo que lee la tarjeta) */
export interface BorradorDeLaPropuesta {
  id: string
  /** el mp4 unido en nuestro almacén · null si no salió */
  url: string | null
  /** lo que costaron SUS clips (los reutilizados a US$ 0) */
  costo_usd: number
  planos: number
  error?: string
}

export interface BorradoresDeVideo {
  fase: 'borrador'
  resolucion: string
  propuestas: BorradorDeLaPropuesta[]
  costo_usd: number
  /** el paso pasó de largo sin gastar: por qué */
  omitido?: string
  simulado?: boolean
}

/**
 * 17-nov · REAPERTURA del reel `2ed549cc` (arreglo (e) de CC6): la P2 se quedó sin video porque el proveedor se quedó sin saldo a medio lote, y nadie avisó antes de llegar a «Propuestas».
 * El aviso de UN lote de borradores incompleto (una vez por lote = una vez por incidente): cada propuesta sin video, con el motivo que dio el proveedor tal cual. null si no falta ninguno.
 * No juzga el motivo (no hay lista de errores): lo copia; quien lo lee decide si es saldo y recarga antes de aprobar.
 */
export function avisoDeBorradorIncompleto(briefId: string, b: Pick<BorradoresDeVideo, 'propuestas' | 'omitido'>): string | null {
  if (b.omitido) return null
  const sin = b.propuestas.filter((p) => !p.url)
  if (!sin.length) return null
  const cuales = sin.map((p) => `${p.id} sin video${p.error ? ` (${p.error.replace(/\s+/g, ' ').trim().slice(0, 200)})` : ''}`).join(' · ')
  return `🎞️ Borrador de video incompleto · ${briefId}: ${cuales}. Las propuestas siguen a «Propuestas» como están. Si el motivo es saldo del proveedor, hay que recargar ANTES de aprobar: el video final fallaría igual y cobraría los planos que alcance.`
}

/**
 * 18-nov · R3 de la prueba final (GO Lenovo, decisión de Emilio: «el video llega solo hasta las PROPUESTAS en imágenes, sin Higgsfield»).
 * El INTERRUPTOR del borrador en video es DATO de la plantilla: `limites.video.borrador.activo`. Solo `false` (booleano) lo apaga;
 * ausente o cualquier otra cosa → encendido, igual que antes de este cambio (no cambia nada para quien no escribe la clave).
 * Apagado, el paso pasa de largo ANTES de armar pedidos: 0 llamadas al brazo, US$ 0 y sin aviso de «borrador incompleto».
 */
export const OMITIDO_APAGADO = 'apagado'
export function borradorActivo(limites: Record<string, unknown> | null | undefined): boolean {
  return ((limites?.video as { borrador?: { activo?: unknown } } | undefined)?.borrador?.activo) !== false
}

/** la calidad del borrador (DATO de la plantilla); mal escrita o ausente → 480p (nunca frena) */
export function resolucionDelBorrador(limites: Record<string, unknown> | null | undefined): string {
  const r = ((limites?.video as { borrador?: { resolucion?: unknown } } | undefined)?.borrador?.resolucion)
  const s = typeof r === 'string' ? r.trim().toLowerCase() : ''
  return RESOLUCIONES_PERMITIDAS.has(s) ? s : RESOLUCION_DEL_BORRADOR_POR_OMISION
}

/**
 * los pedidos de los borradores: todos los planos de todas las propuestas, cada uno rotulado con su propuesta, en UN lote (se espera a todos y se une por propuesta).
 * La clave de cada clip es `<encargo>:<brief>:r<ronda>:<propuesta>:borrador:p<n>`; la huella (contenido) decide qué se reutiliza.
 */
export function pedidosDeLosBorradores(o: { e: Pick<Estado, 'artefactos'>; enc: { id: string; brief_id: string }; brief: BriefLeido; fotos: FotoEtiquetada[]; relacion: string; resolucion: string; /** 17-nov · T1 · el catálogo que leyó el encargo al abrir */ catalogo?: CatalogoDeModelos }): { pedidos: PedidoDePlano[]; errores: Array<{ id: string; error: string }>; ids: string[] } {
  const pv = propuestasDe(o.e)
  const ik = (o.e.artefactos?.imagenes_clave?.datos as unknown as ImagenesClave | undefined)?.propuestas ?? []
  const pedidos: PedidoDePlano[] = []
  const errores: Array<{ id: string; error: string }> = []
  const ids: string[] = []
  for (const p of pv?.propuestas ?? []) {
    ids.push(p.id)
    if (!p.guion || !Array.isArray(p.guion.planos) || !p.guion.planos.length) { errores.push({ id: p.id, error: 'la propuesta no trae planos' }); continue }
    const imagenesClave = (ik.find((x) => x.id === p.id)?.planos ?? []).map((x) => ({ n: x.n, url: x.url }))
    const pp = pedidosPorPlano({ guion: p.guion, brief: o.brief, fotos: o.fotos, clave: `${o.enc.id}:${o.enc.brief_id}:r${pv?.ronda ?? 1}:${p.id}:borrador`, relacion: o.relacion, resolucion: o.resolucion, imagenesClave, ...(o.catalogo ? { catalogo: o.catalogo } : {}) })
    if (!pp.ok) { errores.push({ id: p.id, error: `los planos no forman un pedido válido: ${pp.errores.join(' · ')}` }); continue }
    pedidos.push(...pp.pedidos.map((x) => ({ ...x, propuesta: p.id })))
  }
  return { pedidos, errores, ids }
}

/** el artefacto del paso cuando pasa de largo (sin gastar) */
export const borradoresOmitidos = (resolucion: string, omitido: string): BorradoresDeVideo => ({ fase: 'borrador', resolucion, propuestas: [], costo_usd: 0, omitido })

/**
 * el paso, listo para la plantilla que encienda las propuestas de video (va DESPUÉS de `imagenes_clave` y ANTES de `aprobar_propuestas`).
 * El tope es DATO: lo que se acepta gastar en los borradores de TODAS las propuestas juntas (la SUMA se cotiza antes de enviar nada).
 */
export function pasoDelBorradorDeVideo(tope_usd: number): Paso {
  return { clave: FUNCION_BORRADOR_VIDEO, tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_VIDEO, condicion: { tipo: 'siempre' }, entrada: ['imagenes_clave'], salida_artefacto: ARTEFACTO_BORRADOR_VIDEO, tope_usd }
}
