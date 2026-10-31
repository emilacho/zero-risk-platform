/**
 * TENDENCIAS DEL CLIENTE y BODEGA VIRAL DEL MUNDO · lectura instantánea (31-oct · encargo «tendencias y redes», punto D). US$ 0, sin modelo, solo lee.
 * Se entregan por separado: `cliente` (embudo global → país → competencia → directa) o `bodega` (sin cliente, nivel «mundo»). Dentro de cada nivel, de lo más gustado a lo menos.
 * Lo vigente es lo del último día observado; con `historial` se ven también los días anteriores (no se borra nada).
 */
import type { Consulta, Fila } from '../consulta'
import { ordenDelEmbudo } from '../../portero-alimenta/tendencias'

export const LIMITE_POR_DEFECTO_DE_TENDENCIAS = 50
export const LIMITE_MAXIMO_DE_TENDENCIAS = 200
const REDES = ['tiktok', 'instagram', 'x', 'linkedin', 'pinterest', 'youtube', 'facebook']
const NIVELES = ['global', 'pais', 'competencia', 'directa', 'mundo']

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

export interface TendenciaVista {
  tendencia_id: string
  nivel: string
  red: string
  origen: string
  subcategoria: string
  consulta: string
  tipo: string
  autor: string | null
  texto: string | null
  url: string | null
  media_url: string | null
  vistas: number | null
  me_gusta: number | null
  compartidos: number | null
  comentarios: number | null
  publicado_en: string | null
  observado_en: string
  observado_dia: string
  pais: string | null
  /** un video de tendencia se guarda por su dirección; descargarlo como archivo (con capturas y transcripción) aún no está construido */
  video_descargado: boolean
  video_id: string | null
}
export interface PedidoDeTendencias { cliente: string | null; bodega?: boolean; nivel?: string | null; red?: string | null; limite?: number; historial?: boolean }
export type RespuestaDeTendencias =
  | { ok: true; alcance: 'cliente' | 'bodega'; cliente: string | null; dia_vigente: string | null; total: number; devueltas: number; por_red: Record<string, number>; por_nivel: Record<string, number>; dias_con_historial: number; tendencias: TendenciaVista[]; modelos_llamados: 0; costo_usd: 0 }
  | { ok: false; error: string; detalle: string }

const COLUMNAS = ['id', 'nivel', 'red', 'origen', 'subcategoria', 'consulta', 'tipo', 'autor', 'texto', 'url', 'media_url', 'vistas', 'me_gusta', 'compartidos', 'comentarios', 'publicado_en', 'observado_en', 'observado_dia', 'pais', 'video_id']

export async function listarTendencias(consulta: Consulta, p: PedidoDeTendencias): Promise<RespuestaDeTendencias> {
  const bodega = p.bodega === true
  const cliente = txt(p.cliente)
  if (!bodega && !cliente) return { ok: false, error: 'entrada_invalida', detalle: 'falta `client_id` (o `bodega=1` para la bodega viral del mundo)' }
  if (p.red && !REDES.includes(p.red)) return { ok: false, error: 'entrada_invalida', detalle: `\`red\` debe ser ${REDES.join(', ')}` }
  if (p.nivel && !NIVELES.includes(p.nivel)) return { ok: false, error: 'entrada_invalida', detalle: `\`nivel\` debe ser ${NIVELES.join(', ')}` }
  const limite = Math.min(Math.max(Math.trunc(p.limite ?? LIMITE_POR_DEFECTO_DE_TENDENCIAS) || LIMITE_POR_DEFECTO_DE_TENDENCIAS, 1), LIMITE_MAXIMO_DE_TENDENCIAS)
  const r = await consulta({ tabla: 'cerebro_tendencias', columnas: COLUMNAS, donde: { client_id: bodega ? null : cliente }, orden: { columna: 'observado_dia', descendente: true }, limite: 2000 })
  if (r.error) return { ok: false, error: 'error_de_lectura', detalle: r.error.slice(0, 200) }
  const dias = [...new Set(r.filas.map((f: Fila) => String(f.observado_dia)))].sort().reverse()
  const vigente = dias[0] ?? null
  const base = r.filas.filter((f: Fila) => (p.historial === true || f.observado_dia === vigente) && (!p.nivel || f.nivel === p.nivel) && (!p.red || f.red === p.red))
  const vistas: TendenciaVista[] = base.map((f: Fila) => ({
    tendencia_id: String(f.id), nivel: String(f.nivel), red: String(f.red), origen: String(f.origen), subcategoria: String(f.subcategoria), consulta: String(f.consulta), tipo: String(f.tipo),
    autor: txt(f.autor), texto: txt(f.texto), url: txt(f.url), media_url: txt(f.media_url), vistas: n(f.vistas), me_gusta: n(f.me_gusta), compartidos: n(f.compartidos), comentarios: n(f.comentarios),
    publicado_en: txt(f.publicado_en), observado_en: String(f.observado_en), observado_dia: String(f.observado_dia), pais: txt(f.pais), video_descargado: !!txt(f.video_id), video_id: txt(f.video_id),
  }))
  // el orden del embudo: dentro de cada día, nivel y de más gustado a menos; con historial, lo más reciente primero
  const diasVistos = [...new Set(vistas.map((x) => x.observado_dia))].sort().reverse()
  const ordenadas = diasVistos.flatMap((d) => ordenDelEmbudo(vistas.filter((x) => x.observado_dia === d)))
  const por_red: Record<string, number> = {}
  const por_nivel: Record<string, number> = {}
  for (const v of vistas) { por_red[v.red] = (por_red[v.red] ?? 0) + 1; por_nivel[v.nivel] = (por_nivel[v.nivel] ?? 0) + 1 }
  return { ok: true, alcance: bodega ? 'bodega' : 'cliente', cliente: bodega ? null : cliente, dia_vigente: vigente, total: vistas.length, devueltas: Math.min(ordenadas.length, limite), por_red, por_nivel, dias_con_historial: dias.length, tendencias: ordenadas.slice(0, limite), modelos_llamados: 0, costo_usd: 0 }
}
