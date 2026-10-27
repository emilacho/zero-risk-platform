/**
 * MATERIAL · «si a un paso le falta material, la oficina se lo PIDE al portero y espera su aviso» (firma de Emilio, 27-oct). PURO: sin red, sin base, sin modelo.
 * Diseño: PROPUESTA-CC2-oficina-pide-al-portero + CERTIFICACION-CC3 (5 condiciones). Todo nace APAGADO: `limites.material_activo` (dato de la plantilla) debe ser `true`.
 *  · el umbral de «falta» es DATO de la plantilla (`material_fotos_minimas`) con un valor por omisión por familia;
 *  · el pedido al portero es UNO por (encargo, clase) con un `pedido_id` determinista: un reintento no paga dos veces;
 *  · «material cercano» (fotos de otro origen, o de otro producto) es una respuesta válida SI viene rotulada con qué es y de dónde viene;
 *  · la competencia y las referencias NUNCA son fotos del cliente: solo referencia de estilo (texto).
 */
import crypto from 'node:crypto'
import { origenDeLaFoto, type OrigenDeFoto } from '../cerebro/portero/fotos-pendientes'
import type { FotoEtiquetada } from './fotos'

export { origenDeLaFoto, type OrigenDeFoto }

export type ClaseDeMaterial = 'foto' | 'hecho'
export const OFICINA_QUE_PIDE = 'oficina'
export const FLUJO_QUE_PIDE = 'oficina-turno'

/** minutos antes de leer el pedido por nuestra cuenta (el aviso del portero puede no llegar) y techo duro, después del cual la oficina sigue con lo que haya */
export const MATERIAL_PLAZO_MIN = 20
export const MATERIAL_TECHO_MIN = 30
export const MATERIAL_TOPE_USD = 0.4
export const MATERIAL_MAX_PEDIDOS_POR_CLASE = 1

export interface LimitesDeMaterial { activo: boolean; plazo_min: number; techo_min: number; max_pedidos: number; tope_usd: number; fotos_minimas: number | null }

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)

/** los límites de material de una plantilla; sin la bandera `material_activo === true` (el booleano) todo queda apagado */
export function limitesDeMaterial(l: Record<string, unknown> | undefined): LimitesDeMaterial {
  const x = l ?? {}
  return {
    activo: x.material_activo === true,
    plazo_min: num(x.material_plazo_min, MATERIAL_PLAZO_MIN),
    techo_min: num(x.material_techo_min, MATERIAL_TECHO_MIN),
    max_pedidos: Math.max(0, Math.floor(num(x.material_max_pedidos_por_encargo, MATERIAL_MAX_PEDIDOS_POR_CLASE))),
    tope_usd: num(x.material_tope_usd, MATERIAL_TOPE_USD),
    fotos_minimas: typeof x.material_fotos_minimas === 'number' && x.material_fotos_minimas >= 0 ? Math.floor(x.material_fotos_minimas) : null,
  }
}

/**
 * Cuántas fotos aptas hacen falta ANTES de que el curador decida (dato de plantilla; por omisión: carrusel 3 · kit la mitad de sus elementos · post 1).
 * Se mide antes del curador a propósito: él decide después y no debe decidir sobre la falta.
 */
export function fotosMinimas(familia: string, elementos: number, lim: LimitesDeMaterial): number {
  if (lim.fotos_minimas !== null) return lim.fotos_minimas
  if (familia === 'carrusel') return 3
  if (familia === 'kit') return Math.max(1, Math.ceil(elementos / 2))
  return 1
}

/** el `pedido_id` que el portero exige (uuid) sale de (encargo, turno, clase): el mismo paso reintentado manda el mismo y el portero no cobra dos veces */
export function idDelPedido(encargoId: string, n: number, clase: ClaseDeMaterial): string {
  const h = crypto.createHash('sha256').update(`oficina-material|${encargoId}|${n}|${clase}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
/** lo que vuelve en el aviso como `ref_de_quien_pide` */
export const refDeQuienPide = (encargoId: string, n: number): string => `${encargoId}:${n}`
export function leerRef(ref: unknown): { encargo_id: string; n: number } | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,6})$/i.exec(typeof ref === 'string' ? ref.trim() : '')
  return m ? { encargo_id: m[1].toLowerCase(), n: Number(m[2]) } : null
}

export interface HuecoPedido { fuente?: string; tipo?: string; objetivo?: string; motivo?: string }
export interface PedidoAlPortero {
  client_id: string
  pedido_por: { oficina: string; agente: string }
  para: string
  huecos: HuecoPedido[]
  pedido_id: string
  avisar_a: string
  ref_de_quien_pide: string
  dry_run: boolean
  workflow_id: string
  workflow_execution_id: string
}

export function pedidoDeFotos(o: { client_id: string; encargo_id: string; n: number; paso: string; protagonista: string[]; minimo: number; aptas: number; avisar_a: string; dry_run: boolean }): PedidoAlPortero {
  const prota = o.protagonista.length ? ` (el protagonista del encargo: ${o.protagonista.join(' / ')})` : ''
  return {
    client_id: o.client_id, pedido_por: { oficina: OFICINA_QUE_PIDE, agente: o.paso },
    para: `Fotos para una pieza: hacen falta al menos ${o.minimo} fotos propias aptas y hay ${o.aptas}${prota}. Entrega lo más cercano que haya (propias, de la competencia o de referencia), rotulado con su origen.`,
    huecos: [{ tipo: 'fotos', objetivo: `fotos propias del cliente, de la competencia y de referencia${prota}`, motivo: 'la oficina no tiene fotos suficientes para la pieza' }],
    pedido_id: idDelPedido(o.encargo_id, o.n, 'foto'), avisar_a: o.avisar_a, ref_de_quien_pide: refDeQuienPide(o.encargo_id, o.n),
    dry_run: o.dry_run, workflow_id: FLUJO_QUE_PIDE, workflow_execution_id: `oficina:${o.encargo_id}:${o.n}`,
  }
}

export interface NecesidadDeAgente { que: string; para_que?: string; bloquea?: boolean }
/** las necesidades que un agente declaró y que BLOQUEAN su trabajo (máx. 3); lo demás es una nota, no un pedido */
export function necesidadesQueBloquean(valor: unknown): NecesidadDeAgente[] {
  const v = (valor && typeof valor === 'object' ? (valor as Record<string, unknown>).necesito : undefined)
  if (!Array.isArray(v)) return []
  return v.filter((x): x is NecesidadDeAgente => !!x && typeof x === 'object' && typeof (x as NecesidadDeAgente).que === 'string' && (x as NecesidadDeAgente).que.trim().length > 0 && (x as NecesidadDeAgente).bloquea === true).slice(0, 3)
}
export function pedidoDeHechos(o: { client_id: string; encargo_id: string; n: number; paso: string; necesidades: NecesidadDeAgente[]; avisar_a: string; dry_run: boolean }): PedidoAlPortero {
  return {
    client_id: o.client_id, pedido_por: { oficina: OFICINA_QUE_PIDE, agente: o.paso },
    para: `Datos que le faltan al paso «${o.paso}» de una pieza: ${o.necesidades.map((x) => x.que).join('; ')}`.slice(0, 600),
    huecos: o.necesidades.map((x) => ({ objetivo: x.que.slice(0, 400), motivo: (x.para_que ?? 'lo necesita el paso para no inventar').slice(0, 400) })),
    pedido_id: idDelPedido(o.encargo_id, o.n, 'hecho'), avisar_a: o.avisar_a, ref_de_quien_pide: refDeQuienPide(o.encargo_id, o.n),
    dry_run: o.dry_run, workflow_id: FLUJO_QUE_PIDE, workflow_execution_id: `oficina:${o.encargo_id}:${o.n}`,
  }
}

// ── lo que el portero contesta
export interface FotoDelPortero { foto_id: string; origen: OrigenDeFoto; que_muestra: string | null; producto_visto: string[]; url: string | null }
export type EstadoDelMaterial = 'resuelto' | 'cercano' | 'sin_dato' | 'negado' | 'en_proceso' | 'seco'
export interface ResultadoDeMaterial {
  estado: EstadoDelMaterial
  detalle: string
  costo_usd: number
  fotos: FotoDelPortero[]
  hechos: Array<{ pedido: string; texto: string; fuente: string | null }>
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Lee la respuesta (síncrona o el aviso) del portero. Reglas:
 *  · `en_proceso`/`en_cadena` sin nada utilizable ⇒ sigue en proceso;
 *  · hueco con estado `tope` o un pedido que el portero negó ⇒ `negado` (se trata como «sin dato», NO como error);
 *  · fotos devueltas, aunque sean de otro origen ⇒ `cercano` (válidas, rotuladas); si trae las pedidas y alcanzan ⇒ `resuelto`.
 */
export function leerRespuestaDelPortero(body: unknown, clase: ClaseDeMaterial): ResultadoDeMaterial {
  const b = obj(body)
  const huecos = arr(b.huecos).map(obj)
  const costo = Number(b.costo_usd ?? 0) || huecos.reduce((s, h) => s + (Number(h.costo_usd) || 0), 0)
  if (b.apagado === true) return { estado: 'negado', detalle: 'el portero tiene los pedidos apagados', costo_usd: 0, fotos: [], hechos: [] }
  const fotos: FotoDelPortero[] = []
  for (const h of huecos) for (const f of arr(h.fotos).map(obj)) {
    const id = txt(f.foto_id)
    if (!id || fotos.some((x) => x.foto_id === id)) continue
    fotos.push({ foto_id: id, origen: origenDeLaFoto(f.origen === 'propia' ? 'propio' : f.origen === 'referencia' ? 'referencia' : f.origen === 'competencia' ? 'competidor' : f.origen), que_muestra: txt(f.que_muestra) || null, producto_visto: arr(f.producto_visto).filter((x): x is string => typeof x === 'string'), url: txt(f.url) || null })
  }
  const hechos: ResultadoDeMaterial['hechos'] = []
  for (const h of huecos) {
    const pedido = txt(obj(h.hueco).objetivo) || txt(obj(h.hueco).tipo)
    for (const hz of arr(h.hallazgos).map(obj)) if (txt(hz.resumen)) hechos.push({ pedido, texto: txt(hz.resumen), fuente: txt(hz.url) || null })
    if ((h.estado === 'ya_esta' || h.estado === 'traido_y_archivado') && !arr(h.hallazgos).length && txt(h.detalle)) hechos.push({ pedido, texto: txt(h.detalle), fuente: null })
  }
  const estados = huecos.map((h) => String(h.estado ?? ''))
  const util = clase === 'foto' ? fotos.length > 0 : hechos.length > 0
  const sigue = String(b.estado ?? '') === 'en_proceso' || (estados.length > 0 && estados.every((s) => s === 'en_cadena') && !util)
  if (sigue && !util) return { estado: 'en_proceso', detalle: 'el portero sigue buscando', costo_usd: costo, fotos, hechos }
  if (util) {
    const completo = estados.length > 0 && estados.every((s) => s === 'ya_esta' || s === 'traido_y_archivado')
    return { estado: completo ? 'resuelto' : 'cercano', detalle: txt(huecos[0]?.detalle) || (completo ? 'el portero lo tenía' : 'el portero entregó lo más cercano que halló'), costo_usd: costo, fotos, hechos }
  }
  if (estados.includes('tope') || String(b.error ?? '') === 'tope') return { estado: 'negado', detalle: 'el portero no pidió más por tope de gasto', costo_usd: costo, fotos, hechos }
  if (estados.includes('seco')) return { estado: 'seco', detalle: 'ensayo: el portero no buscó', costo_usd: costo, fotos, hechos }
  return { estado: 'sin_dato', detalle: txt(huecos[0]?.detalle) || txt(b.detalle) || 'esta información me falta', costo_usd: costo, fotos, hechos }
}

// ── fotos: propias vs referencias (UNA sola implementación del origen: la del portero)
export type FilaDeFoto = Record<string, unknown>
export function separarFotos(filas: FilaDeFoto[]): { propias: FotoEtiquetada[]; referencias: FotoEtiquetada[] } {
  const propias: FotoEtiquetada[] = [], referencias: FotoEtiquetada[] = []
  for (const x of filas) {
    const origen = origenDeLaFoto(x.owner_role)
    const f = { ...x, id: String(x.id), origen } as unknown as FotoEtiquetada
    if (origen === 'propia') propias.push(f)
    else referencias.push(f)
  }
  return { propias, referencias }
}
/** el rótulo que ve quien aprueba en la bandeja y el curador en su pedido */
export const rotuloDeOrigen = (o: OrigenDeFoto | undefined): string => (o === 'propia' ? 'foto propia del cliente' : o === 'competencia' ? 'foto de la competencia (solo referencia, no se publica)' : o === 'referencia' ? 'foto de referencia (solo referencia, no se publica)' : 'foto propia del cliente')

/** el estilo que sale de las fotos de referencia: SOLO texto (lo que muestran), nunca la imagen ni su dirección */
export function referenciasDeEstilo(refs: Array<{ origen?: OrigenDeFoto; que_muestra?: string | null; producto_visto?: string[] | null }>, max = 6): string[] {
  return refs.filter((r) => r.origen !== 'propia' && txt(r.que_muestra)).slice(0, max).map((r) => `${r.origen === 'referencia' ? 'referencia' : 'competencia'}: ${txt(r.que_muestra).slice(0, 220)}`)
}
