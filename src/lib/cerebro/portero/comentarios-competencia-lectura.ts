/**
 * COMENTARIOS DE LA COMPETENCIA · lectura instantánea (01-nov · encargo «cerrar huecos», punto 3b). US$ 0, sin modelo, solo lee.
 * Lo que la gente comenta en las publicaciones de los competidores de un cliente (TikTok, Facebook, X, Instagram), con la fecha REAL del comentario; no vencen.
 * NO son opiniones sobre el cliente (esas son fichas de clase `comentarios`, `resenas` y `mencion`): son de terceros sobre OTRO negocio. No trae quién comentó.
 */
import type { Consulta, Fila } from '../consulta'

export const LIMITE_POR_DEFECTO_DE_COMENTARIOS = 50
export const LIMITE_MAXIMO_DE_COMENTARIOS = 200
const REDES = ['tiktok', 'instagram', 'x', 'facebook']
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

export interface ComentarioDeLaCompetencia { comentario_id: string; red: string; cuenta: string; texto: string; me_gusta: number | null; fecha_del_comentario: string | null; publicacion_url: string | null; observado_en: string }
export interface PedidoDeComentariosDeCompetencia { cliente: string; red?: string | null; cuenta?: string | null; limite?: number }
export type RespuestaDeComentariosDeCompetencia =
  | { ok: true; cliente: string; total: number; devueltos: number; por_red: Record<string, number>; por_cuenta: Record<string, number>; comentarios: ComentarioDeLaCompetencia[]; modelos_llamados: 0; costo_usd: 0 }
  | { ok: false; error: string; detalle: string }

export async function listarComentariosDeLaCompetencia(consulta: Consulta, p: PedidoDeComentariosDeCompetencia): Promise<RespuestaDeComentariosDeCompetencia> {
  const cliente = txt(p.cliente)
  if (!cliente) return { ok: false, error: 'entrada_invalida', detalle: 'falta `client_id`' }
  if (p.red && !REDES.includes(p.red)) return { ok: false, error: 'entrada_invalida', detalle: `\`red\` debe ser ${REDES.join(', ')}` }
  const limite = Math.min(Math.max(Math.trunc(p.limite ?? LIMITE_POR_DEFECTO_DE_COMENTARIOS) || LIMITE_POR_DEFECTO_DE_COMENTARIOS, 1), LIMITE_MAXIMO_DE_COMENTARIOS)
  const r = await consulta({ tabla: 'cerebro_comentarios_competencia', columnas: ['id', 'red', 'cuenta', 'texto', 'me_gusta', 'fecha_comentario', 'post_url', 'observado_en'], donde: { client_id: cliente }, orden: { columna: 'fecha_comentario', descendente: true }, limite: 2000 })
  if (r.error) return { ok: false, error: 'error_de_lectura', detalle: r.error.slice(0, 200) }
  const cuenta = txt(p.cuenta)?.toLowerCase().replace(/^@/, '') ?? null
  const base = r.filas.filter((f: Fila) => (!p.red || f.red === p.red) && (!cuenta || String(f.cuenta).toLowerCase() === cuenta))
  const por_red: Record<string, number> = {}, por_cuenta: Record<string, number> = {}
  for (const f of base) { por_red[String(f.red)] = (por_red[String(f.red)] ?? 0) + 1; por_cuenta[String(f.cuenta)] = (por_cuenta[String(f.cuenta)] ?? 0) + 1 }
  // lo más nuevo primero; un comentario sin fecha en el origen va al final (no se le inventa una)
  const ordenados = [...base].sort((a, b) => (Date.parse(String(b.fecha_comentario ?? '')) || -Infinity) - (Date.parse(String(a.fecha_comentario ?? '')) || -Infinity))
  const comentarios: ComentarioDeLaCompetencia[] = ordenados.slice(0, limite).map((f) => ({ comentario_id: String(f.id), red: String(f.red), cuenta: String(f.cuenta), texto: String(f.texto), me_gusta: n(f.me_gusta), fecha_del_comentario: txt(f.fecha_comentario), publicacion_url: txt(f.post_url), observado_en: String(f.observado_en) }))
  return { ok: true, cliente, total: base.length, devueltos: comentarios.length, por_red, por_cuenta, comentarios, modelos_llamados: 0, costo_usd: 0 }
}
