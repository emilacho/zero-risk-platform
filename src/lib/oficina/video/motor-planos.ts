/**
 * EL PASO `video` PLANO POR PLANO · 11-nov · GO Lenovo 16:43 (camino B) + 16:58 (unidor en Railway, sonido de una sola pieza).
 * Se usa SOLO si la plantilla lo enciende (`limites.video.plano_por_plano: true`) y el guion trae 2 o más planos; si no, sigue el camino A (una toma).
 *  1 · ENCUADRAR: cada foto propia de un plano se recorta al centro a la proporción de la red y se guarda en el almacén de la oficina (imagen a video no admite proporción).
 *  2 · COTIZAR LA SUMA (gratis): cada plano se estima con el brazo en `dry_run`; si la suma pasa el tope del paso, nada se envía (US$ 0, recuperable).
 *  3 · ENVIAR cada plano (idempotente por su clave `…:p<n>`), cada uno con su reserva.
 *  4 · ESPERAR a que vuelvan TODOS; uno que falla cierra el encargo fallido visible (como hoy).
 *  5 · UNIR en el orden del guion (Railway · ffmpeg), cada clip cortado a su plano y con el sonido fundido; el mp4 unido se guarda y es «el video» del encargo.
 * Todo el contacto con el mundo entra por los puertos.
 */
import type { EstadoDelBrazo, Puertos } from '../puertos'
import type { PedidoDePlano } from './planos'
import type { PedidoDeVideoDeLaOficina } from './pedido'

/** lo que el paso guarda de cada plano enviado */
export interface PlanoEnviado { n: number; request_id: string; costo_estimado_usd: number; segundos: number; cortar_a_s: number }

/** el pedido de un plano tal como lo entiende el puerto del brazo (`plano: true` lo manda por imagen a video) */
export const comoPedidoDelBrazo = (p: PedidoDePlano): PedidoDeVideoDeLaOficina & { plano: true } => ({
  prompt: p.prompt, formato: p.formato, segundos: p.segundos, resolucion: p.resolucion, relacion: p.relacion, audio: true, fotos: p.fotos, fotos_no_halladas: p.foto_no_hallada ? [p.foto_no_hallada] : [], clave: p.clave, prompt_recortado: false, plano: true,
})

const ctx = (encargoId: string, n: number) => ({ workflow_id: 'oficina:video_mesa', workflow_execution_id: `${encargoId}:${n}` })

/** 1 · encuadra la foto de cada plano que la tenga; devuelve los pedidos con la dirección del encuadre · en seco no sale a la red (la foto queda igual) */
export async function encuadrarFotos(P: Pick<Puertos, 'video' | 'guardarArchivos'>, enc: { id: string; client_id: string; dry_run: boolean }, planos: PedidoDePlano[], ahoraMs: number): Promise<{ ok: true; planos: PedidoDePlano[] } | { ok: false; motivo: string }> {
  if (enc.dry_run || !planos.some((p) => p.fotos.length)) return { ok: true, planos }
  if (!P.video?.encuadrar) return { ok: false, motivo: 'no se puede encuadrar las fotos de los planos: el unidor de video no está conectado (no se gastó nada; el encargo queda recuperable)' }
  const salida: PedidoDePlano[] = []
  for (const p of planos) {
    if (!p.fotos.length) { salida.push(p); continue }
    const e = await P.video.encuadrar({ url: p.fotos[0], relacion: p.relacion })
    if (!e.ok) return { ok: false, motivo: `no se pudo encuadrar la foto del plano ${p.n}: ${e.error} (no se gastó nada; el encargo queda recuperable)` }
    const nombre = `p${p.n}-${ahoraMs}.jpg`
    const g = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}/encuadres`, [{ nombre, bytes: e.bytes, tipo: 'image/jpeg' }])
    if (!g.ok) return { ok: false, motivo: `no se pudo guardar el encuadre del plano ${p.n}: ${g.error} (no se gastó nada; el encargo queda recuperable)` }
    salida.push({ ...p, fotos: [g.urls[nombre]] })
  }
  return { ok: true, planos: salida }
}

/** 2 + 3 · cotiza la suma (gratis) y, si cabe en el tope, envía cada plano · devuelve lo enviado */
export async function cotizarYEnviar(P: Pick<Puertos, 'video'>, enc: { id: string; client_id: string; dry_run: boolean }, planos: PedidoDePlano[], tope: number, n: number): Promise<{ ok: true; enviados: PlanoEnviado[]; simulado: boolean; costo_estimado_usd: number } | { ok: false; motivo: string }> {
  const v = P.video
  if (!v) return { ok: false, motivo: 'el puerto del brazo de video no está configurado' }
  const sinGastar = 'no se gastó nada; el encargo queda recuperable'
  if (enc.dry_run) {
    const enviados: PlanoEnviado[] = []
    for (const p of planos) {
      const e = await v.enviar({ pedido: comoPedidoDelBrazo(p), client_id: enc.client_id, encargo_id: enc.id, dry_run: true, tope_usd: tope, ...ctx(enc.id, n) })
      if (!e.ok) return { ok: false, motivo: `el brazo de video no aceptó el plano ${p.n}: ${e.error}` }
      enviados.push({ n: p.n, request_id: e.request_id, costo_estimado_usd: 0, segundos: p.segundos, cortar_a_s: p.cortar_a_s })
    }
    return { ok: true, enviados, simulado: true, costo_estimado_usd: 0 }
  }
  if (!v.cotizar) return { ok: false, motivo: `no se puede cotizar los planos: el brazo de video no está conectado (${sinGastar})` }
  const costos: number[] = []
  for (const p of planos) {
    const c = await v.cotizar({ pedido: comoPedidoDelBrazo(p), client_id: enc.client_id, encargo_id: enc.id, tope_usd: tope, workflow_id: 'oficina:video_mesa', workflow_execution_id: `${enc.id}:${n}:cotizar` })
    if (!c.ok) return { ok: false, motivo: `el brazo de video no pudo cotizar el plano ${p.n}: ${c.error}${c.descripcion ? ` · lo que dijo el proveedor sobre sus precios: «${c.descripcion.replace(/\s+/g, ' ').slice(0, 800)}»` : ''} (${sinGastar})` }
    costos.push(c.costo_estimado_usd)
  }
  const suma = +costos.reduce((s, x) => s + x, 0).toFixed(4)
  if (suma > tope + 1e-9) return { ok: false, motivo: `los ${planos.length} planos costarían US$ ${suma.toFixed(4)} y el tope del video es US$ ${tope} (${sinGastar})` }
  const enviados: PlanoEnviado[] = []
  for (const [i, p] of planos.entries()) {
    // la reserva de cada plano: lo que le queda al video sin contar lo que ya se reservó (nunca más que el tope)
    const queda = +(tope - enviados.reduce((s, x) => s + x.costo_estimado_usd, 0)).toFixed(4)
    const e = await v.enviar({ pedido: comoPedidoDelBrazo(p), client_id: enc.client_id, encargo_id: enc.id, dry_run: false, tope_usd: queda, ...ctx(enc.id, n) })
    if (!e.ok) {
      const ya = enviados.length ? ` · ya se enviaron los planos ${enviados.map((x) => x.n).join(', ')} (se cobran si terminan; reabrir el encargo los reutiliza, no los paga dos veces)` : ` (${sinGastar})`
      return { ok: false, motivo: `el brazo de video no aceptó el plano ${p.n}: ${e.error}${ya}` }
    }
    enviados.push({ n: p.n, request_id: e.request_id, costo_estimado_usd: e.costo_estimado_usd || costos[i], segundos: p.segundos, cortar_a_s: p.cortar_a_s })
  }
  return { ok: true, enviados, simulado: false, costo_estimado_usd: +enviados.reduce((s, x) => s + x.costo_estimado_usd, 0).toFixed(4) }
}

/** lo que se sabe de los planos al sondear */
export type EstadoDeLosPlanos =
  | { listo: false }
  | { listo: true; ok: false; status: string; error: string }
  | { listo: true; ok: true; clips: Array<{ n: number; request_id: string; video_url: string; cortar_a_s: number; costo_usd: number; expires_at: string | null }> }

/** 4 · ¿volvieron todos? · un plano que falla basta para cerrar; uno que quedó solo en el proveedor no se puede unir (el unidor solo baja de nuestro almacén) */
export function leerPlanos(enviados: PlanoEnviado[], estados: EstadoDelBrazo[], vencido: boolean, plazoMin: number): EstadoDeLosPlanos {
  const clips: Array<{ n: number; request_id: string; video_url: string; cortar_a_s: number; costo_usd: number; expires_at: string | null }> = []
  let pendientes = 0
  for (const [i, p] of enviados.entries()) {
    const st = estados[i]
    if (!st || !st.ok) { pendientes++; continue }
    if (st.simulado) { clips.push({ n: p.n, request_id: p.request_id, video_url: `https://dry.invalid/plano-${p.n}.mp4`, cortar_a_s: p.cortar_a_s, costo_usd: 0, expires_at: null }); continue }
    if (!st.terminal) { pendientes++; continue }
    if ('video_url' in st) {
      if (st.copia !== 'bucket') return { listo: true, ok: false, status: 'plano_sin_copia', error: `el clip del plano ${p.n} quedó solo en el proveedor (${st.aviso ?? 'sin copia'}): no se puede unir` }
      clips.push({ n: p.n, request_id: p.request_id, video_url: st.video_url, cortar_a_s: p.cortar_a_s, costo_usd: st.costo_usd, expires_at: st.expires_at })
      continue
    }
    return { listo: true, ok: false, status: st.status, error: `el plano ${p.n} no se generó (${st.status}): ${('error' in st ? st.error : null) ?? 'el proveedor no entregó el clip'}` }
  }
  if (pendientes) return vencido ? { listo: true, ok: false, status: 'sin_vuelta', error: `${pendientes} plano(s) no terminaron en ${plazoMin} min` } : { listo: false }
  return { listo: true, ok: true, clips: clips.sort((a, b) => a.n - b.n) }
}

/** 5 · une los clips (Railway) y guarda el mp4 en el almacén de la oficina · en seco devuelve el simulado sin salir a la red */
export async function unirClips(P: Pick<Puertos, 'video' | 'guardarArchivos'>, enc: { id: string; client_id: string }, clips: Array<{ video_url: string; cortar_a_s: number }>, relacion: string, resolucion: string, ahoraMs: number): Promise<{ ok: true; video_url: string } | { ok: false; error: string }> {
  if (clips.every((c) => c.video_url.startsWith('https://dry.invalid/'))) return { ok: true, video_url: 'https://dry.invalid/video-unido.mp4' }
  if (!P.video?.unir) return { ok: false, error: 'el unidor de video no está conectado' }
  const u = await P.video.unir({ clips: clips.map((c) => ({ url: c.video_url, segundos: c.cortar_a_s })), relacion, resolucion })
  if (!u.ok) return { ok: false, error: `no se pudieron unir los clips: ${u.error}` }
  const nombre = `video-unido-${ahoraMs}.mp4`
  const g = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, [{ nombre, bytes: u.bytes, tipo: 'video/mp4' }])
  if (!g.ok) return { ok: false, error: `no se pudo guardar el video unido: ${g.error}` }
  return { ok: true, video_url: g.urls[nombre] }
}
