/** 17-nov · S2-4 (CC1) · el arnés común de las pruebas del camino B: un brazo falso con todo (cotizar, enviar, estado, encuadrar, unir, buscar lo pagado) y el encargo entero hasta el brazo. US$ 0 */
import { escribirHoja } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { abrirEncargo } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { EstadoDelBrazo, PuertoDeVideo } from '../puertos'
import type { Plantilla } from '../tipos'
import type { PlanoEnviado } from '../video/motor-planos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { VIDEO_MESA_ANTES_DE_S2_3 } from './video-mesa-antes-de-s2-3'

export const ALMACEN = 'https://abcd.supabase.co/storage/v1/object/public/oficina'
export const enviados3: PlanoEnviado[] = [1, 2, 3].map((n) => ({ n, request_id: `req-${n}`, costo_estimado_usd: 1, segundos: 4, cortar_a_s: 4 }))
export const hecho = (n: number, extra: Record<string, unknown> = {}): EstadoDelBrazo => ({ ok: true, terminal: true, status: 'completed', video_url: `${ALMACEN}/videos/req-${n}.mp4`, url_proveedor: null, costo_usd: 1.06, expires_at: null, copia: 'bucket', aviso: null, ...extra } as EstadoDelBrazo)
export const enCurso: EstadoDelBrazo = { ok: true, terminal: false, status: 'in_progress' } as EstadoDelBrazo
export const fallo: EstadoDelBrazo = { ok: true, terminal: true, status: 'nsfw', error: 'bloqueado' } as EstadoDelBrazo


/** un brazo falso con TODO lo del camino B (cotizar, enviar, estado, encuadrar, unir) */
export function brazo(o: { estados: (id: string) => EstadoDelBrazo; une?: boolean; falla_envio_en?: number; pagados?: Array<{ huella: string; request_id: string; video_url: string; costo_usd: number }> | ((huellas: string[]) => Promise<Array<{ huella: string; request_id: string; video_url: string; costo_usd: number }>>) }) {
  const reg = { enviados: [] as string[], uniones: 0, cotizados: [] as string[], preguntados: [] as string[], unidos: [] as string[][], huellas: [] as string[][], tope: [] as number[] }
  let k = 0
  const v: PuertoDeVideo = {
    async cotizar(p) { reg.cotizados.push(p.pedido.clave); reg.tope.push(p.tope_usd); return { ok: true, costo_estimado_usd: 1.06, costo_lista_usd: 1.06 } },
    async enviar(p) { k++; if (o.falla_envio_en === k) return { ok: false, error: 'rechazado' }; reg.enviados.push(p.pedido.clave); return { ok: true, request_id: `req-${k}`, status: 'queued', costo_estimado_usd: 1.06, simulado: false } },
    async estado(id) { reg.preguntados.push(id); return o.estados(id) },
    async encuadrar() { return { ok: true as const, bytes: Buffer.from('jpg') } },
    async unir(p) { reg.uniones++; reg.unidos.push(p.clips.map((c) => c.url)); return o.une === false ? { ok: false as const, error: 'ffmpeg murió' } : { ok: true as const, bytes: Buffer.from('mp4') } },
    ...(o.pagados ? { async buscarPagados(p: { client_id: string; huellas: string[] }) { reg.huellas.push(p.huellas); return typeof o.pagados === 'function' ? o.pagados(p.huellas) : o.pagados!.filter((x) => p.huellas.includes(x.huella)) } } : {}),
  }
  return { v, reg }
}

// ───────────────────────── el camino ENTERO: la mesa → el pedido por plano → el envío real (falso) → el vigía → el encargo fallido con lo cobrado
export const PLANTILLA_B: Plantilla = { ...VIDEO_MESA_ANTES_DE_S2_3, limites: { ...VIDEO_MESA_ANTES_DE_S2_3.limites, video: { ...(VIDEO_MESA_ANTES_DE_S2_3.limites.video as Record<string, unknown>), plano_por_plano: true } } }
export const GUION = [
  '## Plano 1 · 0–4 s', 'Se ve: el pan recién salido del horno, el vapor sube', 'Producto: sí', 'Movimiento: acercamiento lento', 'Foto: ninguna',
  '## Plano 2 · 4–8 s', 'Se ve: una mano parte el pan en la mesa larga', 'Producto: sí', 'Movimiento: cámara fija', 'Foto: ninguna',
  '## Plano 3 · 8–12 s', 'Se ve: la puerta abierta con la mesa puesta', 'Producto: no', 'Movimiento: cámara fija', 'Foto: ninguna',
  '## Audio', 'ambiente de cocina, sin voz', '## Pie', 'Hay mesa desde las siete.', '## Etiquetas', '#pan',
  '## Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé',
].join('\n')

export async function hastaElBrazo(b: ReturnType<typeof brazo>) {
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: PLANTILLA_B })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  M.P.video = b.v
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: false, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const { ultima } = await jugar(M, id, a, (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION }
    return { texto: `Respuesta de ${t.agente}.` }
  }, 120)
  return { M, id, ultima }
}
export const gastoAntes = (M: ReturnType<typeof crearMemoria>, id: string) => M.encargos.get(id)!.gasto_usd
