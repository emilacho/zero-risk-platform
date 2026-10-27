/**
 * FOTOS DEL CEREBRO · lectura instantánea y etiquetado automático (27-oct · encargo recuperacion-y-vigia-independiente, puntos 4–7).
 *
 *  · `listarFotos`: las fotos de UN cliente con su ORIGEN (propia / competencia / referencia) y su etiqueta, sin modelo (US$ 0). Solo LEE.
 *  · `etiquetarPendientes`: etiqueta las fotos `ok` que aún no tienen etiqueta, SIN corrida a mano. Propias primero; tope por cliente y día
 *    (`TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA`, medido contra las etiquetadas HOY) y plazo total; una foto que falla no frena a las demás ni se reintenta en la misma pasada.
 *    La llamada al modelo la hace `etiquetarFoto` (inyectada: en la ruta es `etiquetar()` del paso 4, que registra cada llamada); aquí no se escribe nada en la tabla.
 *
 * El origen sale de `owner_role` (`propio` → propia, `competidor` → competencia, `referencia` → referencia). La regla vieja «material de competidores no se mira ni sale en una pieza»
 * quedó superada por la decisión de Emilio del 27-oct: se pueden usar para crear (él aprueba cada pieza) y por eso se rotulan, no se esconden.
 */
import type { Consulta, Fila } from '../consulta'

/** cuántas etiquetas por cliente y día (≈ US$ 0,08 con el costo medido de ~US$ 0,008 por foto; dentro del tope diario del cliente) */
export const TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA = 10
export const COSTO_MEDIDO_POR_FOTO_USD = 0.008
export const ORIGENES_DE_FOTO = ['propia', 'competencia', 'referencia'] as const
export type OrigenDeFoto = (typeof ORIGENES_DE_FOTO)[number]
export const LIMITE_POR_DEFECTO_DE_FOTOS = 60
export const LIMITE_MAXIMO_DE_FOTOS = 200

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [])

export function origenDeLaFoto(ownerRole: unknown): OrigenDeFoto {
  const r = String(ownerRole ?? '').toLowerCase()
  if (r === 'propio') return 'propia'
  if (r === 'referencia') return 'referencia'
  return 'competencia'
}

export interface FotoVista {
  foto_id: string
  origen: OrigenDeFoto
  cuenta: string | null
  tipo: string | null
  medio: string | null
  url: string | null
  publicada_en: string | null
  copiada_en: string | null
  etiquetada: boolean
  que_muestra: string | null
  producto_visto: string[]
  texto_visible: string | null
  confianza: string | null
  con_personas: boolean | null
  tipo_de_toma: string | null
  formato: string | null
}

const COLUMNAS_DE_LECTURA = ['id', 'owner_role', 'handle', 'tipo', 'medio', 'estado', 'url', 'posted_at', 'created_at', 'etiquetada_en', 'que_muestra', 'producto_visto', 'texto_visible', 'etiqueta_confianza', 'con_personas', 'tipo_de_toma', 'formato', 'duplicado_de']

export interface PedidoDeFotos { cliente: string; origen?: OrigenDeFoto | null; soloEtiquetadas?: boolean; limite?: number }
export type RespuestaDeFotos =
  | { ok: true; cliente: string; total: number; devueltas: number; por_origen: Record<OrigenDeFoto, { total: number; etiquetadas: number }>; sin_etiquetar: number; fotos: FotoVista[]; modelos_llamados: 0; costo_usd: 0 }
  | { ok: false; error: string; detalle: string }

/** las fotos de un cliente (solo las que tienen archivo y no son copia de otra), con origen y etiqueta · US$ 0 */
export async function listarFotos(consulta: Consulta, p: PedidoDeFotos): Promise<RespuestaDeFotos> {
  const cliente = txt(p.cliente)
  if (!cliente) return { ok: false, error: 'entrada_invalida', detalle: 'falta `client_id`' }
  if (p.origen && !(ORIGENES_DE_FOTO as readonly string[]).includes(p.origen)) return { ok: false, error: 'entrada_invalida', detalle: `\`origen\` debe ser ${ORIGENES_DE_FOTO.join(', ')}` }
  const limite = Math.min(Math.max(Math.trunc(p.limite ?? LIMITE_POR_DEFECTO_DE_FOTOS) || LIMITE_POR_DEFECTO_DE_FOTOS, 1), LIMITE_MAXIMO_DE_FOTOS)
  const r = await consulta({ tabla: 'client_social_images', columnas: COLUMNAS_DE_LECTURA, donde: { client_id: cliente, estado: 'ok' }, orden: { columna: 'created_at', descendente: true }, limite: 1000 })
  if (r.error) return { ok: false, error: 'error_de_lectura', detalle: r.error.slice(0, 200) }
  const vistas: FotoVista[] = r.filas
    .filter((f) => !txt(f.duplicado_de))
    .map((f) => ({
      foto_id: String(f.id), origen: origenDeLaFoto(f.owner_role), cuenta: txt(f.handle), tipo: txt(f.tipo), medio: txt(f.medio), url: txt(f.url),
      publicada_en: txt(f.posted_at), copiada_en: txt(f.created_at), etiquetada: !!txt(f.etiquetada_en), que_muestra: txt(f.que_muestra), producto_visto: lista(f.producto_visto),
      texto_visible: txt(f.texto_visible), confianza: txt(f.etiqueta_confianza), con_personas: typeof f.con_personas === 'boolean' ? f.con_personas : null,
      tipo_de_toma: txt(f.tipo_de_toma), formato: txt(f.formato),
    }))
  const por_origen = Object.fromEntries(ORIGENES_DE_FOTO.map((o) => [o, { total: 0, etiquetadas: 0 }])) as Record<OrigenDeFoto, { total: number; etiquetadas: number }>
  for (const v of vistas) { por_origen[v.origen].total++; if (v.etiquetada) por_origen[v.origen].etiquetadas++ }
  const filtradas = vistas.filter((v) => (!p.origen || v.origen === p.origen) && (!p.soloEtiquetadas || v.etiquetada))
  return { ok: true, cliente, total: vistas.length, devueltas: Math.min(filtradas.length, limite), por_origen, sin_etiquetar: vistas.filter((v) => !v.etiquetada).length, fotos: filtradas.slice(0, limite), modelos_llamados: 0, costo_usd: 0 }
}

export interface ResultadoDeUnaEtiqueta { llamo_al_modelo: boolean; escribio: boolean; costo_usd: number; motivo?: string }
export interface DepsDeEtiquetarPendientes {
  consulta: Consulta
  /** etiqueta UNA foto (en la ruta: `etiquetar()` del paso 4) · nunca lanza: un fallo vuelve como `escribio:false` con su motivo */
  etiquetarFoto: (a: { cliente: string; foto_id: string }) => Promise<ResultadoDeUnaEtiqueta>
  ahora?: () => Date
  /** plazo total de la pasada (ms) · al agotarse, lo que falte queda para la siguiente */
  plazoMs?: number
}
export interface PedidoDeEtiquetarPendientes { clientes: string[]; tope_por_cliente?: number; dry_run?: boolean }
export interface InformeDeEtiquetas {
  cliente: string
  pendientes: number
  etiquetadas_hoy_antes: number
  intentadas: number
  etiquetadas: number
  fallidas: Array<{ foto_id: string; motivo: string }>
  omitidas_por_tope: number
  omitidas_por_plazo: number
  costo_usd: number
  error?: string
}

/** etiqueta las pendientes de cada cliente · propias primero · tope por cliente/día · plazo total · `dry_run` solo cuenta (US$ 0) */
export async function etiquetarPendientes(deps: DepsDeEtiquetarPendientes, p: PedidoDeEtiquetarPendientes): Promise<{ dry_run: boolean; informes: InformeDeEtiquetas[]; etiquetadas: number; costo_usd: number; modelos_llamados: number }> {
  const ahora = (deps.ahora ?? (() => new Date()))()
  const hoy = ahora.toISOString().slice(0, 10)
  const limiteDeTiempo = ahora.getTime() + (deps.plazoMs ?? 240_000)
  const tope = Math.max(0, Math.trunc(p.tope_por_cliente ?? TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA))
  const dry = p.dry_run !== false
  const informes: InformeDeEtiquetas[] = []
  for (const cliente of p.clientes) {
    const inf: InformeDeEtiquetas = { cliente, pendientes: 0, etiquetadas_hoy_antes: 0, intentadas: 0, etiquetadas: 0, fallidas: [], omitidas_por_tope: 0, omitidas_por_plazo: 0, costo_usd: 0 }
    informes.push(inf)
    const r = await deps.consulta({ tabla: 'client_social_images', columnas: ['id', 'owner_role', 'estado', 'etiquetada_en', 'duplicado_de', 'created_at'], donde: { client_id: cliente, estado: 'ok' }, orden: { columna: 'created_at', descendente: false }, limite: 1000 })
    if (r.error) { inf.error = r.error.slice(0, 200); continue }
    const filas: Fila[] = r.filas.filter((f) => !txt(f.duplicado_de))
    inf.etiquetadas_hoy_antes = filas.filter((f) => (txt(f.etiquetada_en) ?? '').slice(0, 10) === hoy).length
    const pendientes = filas.filter((f) => !txt(f.etiquetada_en)).sort((a, b) => Number(origenDeLaFoto(a.owner_role) !== 'propia') - Number(origenDeLaFoto(b.owner_role) !== 'propia'))
    inf.pendientes = pendientes.length
    const cupo = Math.max(0, tope - inf.etiquetadas_hoy_antes)
    inf.omitidas_por_tope = Math.max(0, pendientes.length - cupo)
    if (dry) continue
    for (const f of pendientes.slice(0, cupo)) {
      if ((deps.ahora ?? (() => new Date()))().getTime() >= limiteDeTiempo) { inf.omitidas_por_plazo++; continue }
      inf.intentadas++
      const x = await deps.etiquetarFoto({ cliente, foto_id: String(f.id) }).catch((e: unknown): ResultadoDeUnaEtiqueta => ({ llamo_al_modelo: false, escribio: false, costo_usd: 0, motivo: e instanceof Error ? e.message : String(e) }))
      inf.costo_usd = Math.round((inf.costo_usd + x.costo_usd) * 1e6) / 1e6
      if (x.escribio) inf.etiquetadas++
      else inf.fallidas.push({ foto_id: String(f.id), motivo: (x.motivo ?? 'no se escribió la etiqueta').slice(0, 120) })
    }
  }
  const etiquetadas = informes.reduce((s, i) => s + i.etiquetadas, 0)
  return { dry_run: dry, informes, etiquetadas, costo_usd: Math.round(informes.reduce((s, i) => s + i.costo_usd, 0) * 1e6) / 1e6, modelos_llamados: informes.reduce((s, i) => s + i.intentadas, 0) }
}
